// One-off/local import: converts yt-dlp output in data/raw (info.json + .vtt) into
// data/videos.json and data/transcripts/*.json. Existing slugs are preserved.
//   yt-dlp --skip-download --write-info-json --write-auto-subs --write-subs \
//     --sub-langs "en.*,en" --sub-format vtt -o "data/raw/%(id)s.%(ext)s" <uploads playlist>
import fs from 'node:fs';
import path from 'node:path';
import { DATA, VIDEOS_JSON, TRANSCRIPTS, readJSON, writeJSON, assignSlugs, parseVtt } from './lib.mjs';

const RAW = path.join(DATA, 'raw');
const existing = new Map(readJSON(VIDEOS_JSON, []).map((v) => [v.id, v]));
const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.info.json'));

for (const f of files) {
  const d = readJSON(path.join(RAW, f));
  if (!d || d._type === 'playlist' || !d.id) continue;
  const prev = existing.get(d.id) || {};
  const ud = d.upload_date || '';
  const ts = d.release_timestamp || d.timestamp;
  const thumbs = (d.thumbnails || []).map((t) => t.url);
  const vertical = d.width && d.height && d.height > d.width;
  const v = {
    ...prev,
    id: d.id,
    title: d.title,
    description: d.description || '',
    publishedAt: ts ? new Date(ts * 1000).toISOString() : `${ud.slice(0, 4)}-${ud.slice(4, 6)}-${ud.slice(6, 8)}T12:00:00Z`,
    duration: Math.round(d.duration || 0),
    type: d.live_status === 'was_live' ? 'stream' : (vertical || (d.duration <= 180 && /\/shorts\//.test(d.original_url || ''))) ? 'short' : 'video',
    tags: d.tags || [],
    views: d.view_count ?? prev.views ?? 0,
    likes: d.like_count ?? prev.likes ?? 0,
    maxres: thumbs.some((u) => u.includes('maxresdefault')),
  };

  const vtt = [`${d.id}.en-orig.vtt`, `${d.id}.en.vtt`].map((n) => path.join(RAW, n)).find((p) => fs.existsSync(p));
  if (vtt) {
    const paras = parseVtt(fs.readFileSync(vtt, 'utf8'));
    if (paras.length) { writeJSON(path.join(TRANSCRIPTS, `${d.id}.json`), paras); v.transcript = true; }
  }
  existing.set(d.id, v);
}

const videos = [...existing.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
assignSlugs(videos);
writeJSON(VIDEOS_JSON, videos);
const by = videos.reduce((m, v) => ((m[v.type] = (m[v.type] || 0) + 1), m), {});
console.log(`videos.json: ${videos.length}`, by, `transcripts: ${videos.filter((v) => v.transcript).length}`);
