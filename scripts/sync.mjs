// Pulls the full public upload list from the YouTube Data API v3 and merges it into
// data/videos.json. Costs ~1 quota unit per 50 videos (free quota: 10,000/day).
//   YOUTUBE_API_KEY=... node scripts/sync.mjs
import { VIDEOS_JSON, readJSON, writeJSON, assignSlugs, parseIsoDuration, isShort } from './lib.mjs';
import { site } from '../site.config.mjs';

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error('YOUTUBE_API_KEY not set; skipping sync.'); process.exit(0); }

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
