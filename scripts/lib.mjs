import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');
export const VIDEOS_JSON = path.join(DATA, 'videos.json');
export const TRANSCRIPTS = path.join(DATA, 'transcripts');

export const readJSON = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; }
};
export const writeJSON = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n');
};

export function slugify(s) {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/#\w+/g, ' ')          // drop hashtags
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70).replace(/-+[^-]*$/, (m) => (m.length > 20 ? '' : m)) // avoid chopped words
    .replace(/-+$/g, '') || 'video';
}

// Slugs are assigned once and never change, so URLs stay stable if titles are edited.
export function assignSlugs(videos) {
  const used = new Set(videos.filter((v) => v.slug).map((v) => v.slug));
  for (const v of videos) {
    if (v.slug) continue;
    let s = slugify(v.title);
    if (used.has(s)) s = `${s}-${v.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    used.add(s);
    v.slug = s;
  }
}

// YouTube auto-caption VTT -> [[seconds, paragraphText], ...] (~45s paragraphs).
export function parseVtt(vtt) {
  const lines = [];
  let cueStart = 0;
  let last = '';
  for (const raw of vtt.split(/\r?\n/)) {
    const ts = raw.match(/^(\d+):(\d+):(\d+)\.\d+\s+-->/);
    if (ts) { cueStart = +ts[1] * 3600 + +ts[2] * 60 + +ts[3]; continue; }
    if (!raw.trim() || /^(WEBVTT|Kind:|Language:|NOTE)/.test(raw)) continue;
    const text = raw.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&nbsp;/g, ' ').trim();
    if (!text || text === last) continue;
    last = text;
    lines.push([cueStart, text]);
  }
  // Auto-captions repeat the previous line as the first line of each cue; dedupe already handled above.
  const paras = [];
  let cur = null;
  for (const [t, text] of lines) {
    if (/^\[(music|applause|laughter)\]$/i.test(text)) continue;
    if (!cur || t - cur[0] >= 45) { cur = [t, text]; paras.push(cur); }
    else cur[1] += ' ' + text;
  }
  return paras.map(([t, s]) => [t, cleanText(s)]);
}

// Common ASR misspellings of names Kevin talks about; keeps entities searchable.
const FIXES = [
  [/\bPeter (Teal|Teel|Theil)\b/g, 'Peter Thiel'], [/\b(Teal|Theil)'s\b/g, "Thiel's"],
  [/\bPalanteer\b/gi, 'Palantir'], [/\b(Tess ?(creel|creal|kreel)|Tescri?e?a?l|Tescreel|Tescriel|Tescrial|Tescril|Tescrai|Tesriel)\b/gi, 'TESCREAL'], [/\bTescraelian\b/gi, 'TESCREALian'], [/\bextropion(ism|s)?\b/gi, (m, x) => 'Extropian' + (x || '')],
  [/\bAnthropics\b/g, "Anthropic's"], [/\bAndoril\b/gi, 'Anduril'], [/\bExtropions\b/gi, 'Extropians'],
];

function cleanText(s) {
  s = s.replace(/>>/g, ' ').replace(/\[(music|applause|laughter|__|\s*_+\s*)\]/gi, ' ').replace(/\[\s*_+\s*\]/g, ' ');
  for (const [re, to] of FIXES) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

export function isoDuration(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `PT${h ? h + 'H' : ''}${m ? m + 'M' : ''}${s}S`;
}

export function parseIsoDuration(iso) {
  const m = (iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

// Shorts URL returns 200 for a Short and redirects to /watch for a regular video.
export async function isShort(id) {
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual' });
    return r.status === 200;
  } catch { return null; }
}
