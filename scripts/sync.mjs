// Pulls the full public upload list from the YouTube Data API v3 and merges it into
// data/videos.json. Costs ~1 quota unit per 50 videos (free quota: 10,000/day).
//   YOUTUBE_API_KEY=... node scripts/sync.mjs
import { VIDEOS_JSON, readJSON, writeJSON, assignSlugs, parseIsoDuration, isShort } from './lib.mjs';
import { site } from '../site.config.mjs';

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) {
  if (process.env.GITHUB_ACTIONS) console.log('::warning title=RSS fallback::YOUTUBE_API_KEY is not set; syncing new uploads from the public RSS feed instead.');
  await rssSync();
  process.exit(0);
}

// Keyless fallback: the public channel feed lists the latest 15 uploads. New videos are added
// (length and stream status read from the watch page, best effort); nothing is ever removed.
async function rssSync() {
  const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${site.channelId}`)).text();
  const un = (t = '') => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const pick = (e, re) => (e.match(re) || [])[1];
  const existing = new Map(readJSON(VIDEOS_JSON, []).map((v) => [v.id, v]));
  let added = 0;
  for (const e of xml.split('<entry>').slice(1)) {
    const id = pick(e, /<yt:videoId>([^<]+)/);
    const views = +pick(e, /<media:statistics views="(\d+)"/) || 0;
    const prev = existing.get(id);
    if (prev) { prev.views = Math.max(prev.views || 0, views); continue; }
    let duration = 0, live = false;
    try {
      const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { 'accept-language': 'en' } })).text();
      duration = +pick(html, /"lengthSeconds":"(\d+)"/) || 0;
      live = /"isLiveContent":true/.test(html);
      if (/"isUpcoming":true|"isLive":true/.test(html)) continue; // not finished yet
    } catch {}
    existing.set(id, {
      id,
      title: un(pick(e, /<title>([^<]*)/)),
      description: un(pick(e, /<media:description>([^<]*)/)),
      publishedAt: new Date(pick(e, /<published>([^<]+)/)).toISOString(),
      duration,
      type: /\/shorts\//.test(pick(e, /<link rel="alternate" href="([^"]+)/) || '') ? 'short' : live ? 'stream' : 'video',
      tags: [], views, likes: 0, maxres: false,
    });
    added++;
  }
  const videos = [...existing.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  assignSlugs(videos);
  writeJSON(VIDEOS_JSON, videos);
  console.log(`sync (rss): ${videos.length} videos (${added} new)`);
}

const api = async (endpoint, params) => {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${endpoint} ${r.status}: ${await r.text()}`);
  return r.json();
};

const ids = [];
let pageToken = '';
do {
  const j = await api('playlistItems', { part: 'contentDetails', playlistId: site.uploadsPlaylist, maxResults: 50, ...(pageToken && { pageToken }) });
  ids.push(...j.items.map((i) => i.contentDetails.videoId));
  pageToken = j.nextPageToken || '';
} while (pageToken);

const existing = new Map(readJSON(VIDEOS_JSON, []).map((v) => [v.id, v]));
const seen = new Set();
let added = 0;
for (let i = 0; i < ids.length; i += 50) {
  const j = await api('videos', { part: 'snippet,contentDetails,statistics,liveStreamingDetails,status', id: ids.slice(i, i + 50).join(',') });
  for (const d of j.items) {
    const s = d.snippet;
    // Only public, embeddable, finished videos (skip upcoming/currently-live broadcasts).
    if (d.status.privacyStatus !== 'public' || d.status.embeddable === false || s.liveBroadcastContent !== 'none') continue;
    seen.add(d.id);
    const prev = existing.get(d.id);
    const duration = parseIsoDuration(d.contentDetails.duration);
    let type = prev?.type;
    if (!type) {
      if (d.liveStreamingDetails?.actualEndTime) type = 'stream';
      else if (duration <= 180) type = ((await isShort(d.id)) ?? duration <= 60) ? 'short' : 'video';
      else type = 'video';
      added++;
    }
    existing.set(d.id, {
      ...prev,
      id: d.id,
      title: s.title,
      description: s.description || '',
      publishedAt: d.liveStreamingDetails?.actualStartTime || s.publishedAt,
      duration,
      type,
      tags: s.tags || [],
      views: +d.statistics.viewCount || 0,
      likes: +d.statistics.likeCount || 0,
      maxres: !!s.thumbnails?.maxres,
    });
  }
}

// Drop videos that were deleted or made private.
for (const id of existing.keys()) if (!seen.has(id)) existing.delete(id);

const videos = [...existing.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
assignSlugs(videos);
writeJSON(VIDEOS_JSON, videos);
console.log(`sync: ${videos.length} public videos (${added} new)`);
