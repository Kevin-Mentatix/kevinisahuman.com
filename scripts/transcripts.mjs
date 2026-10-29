// Best-effort: fetch auto-captions with yt-dlp for videos that don't have a transcript yet.
// YouTube sometimes blocks datacenter IPs (e.g. GitHub Actions); failures are skipped, and
// running `npm run transcripts` locally fills any gaps.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { VIDEOS_JSON, TRANSCRIPTS, readJSON, writeJSON, parseVtt } from './lib.mjs';

const videos = readJSON(VIDEOS_JSON, []);
const todo = videos.filter((v) => !v.transcript && !v.noTranscript).slice(0, 15);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiah-vtt-'));
let got = 0;

for (const v of todo) {
  try {
    execFileSync('yt-dlp', ['--no-update', '--skip-download', '--write-auto-subs', '--write-subs', '--sub-langs', 'en.*,en', '--sub-format', 'vtt',
      '-o', path.join(tmp, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${v.id}`], { stdio: 'pipe', timeout: 90000 });
  } catch { /* blocked or no captions yet */ }
  const f = [`${v.id}.en-orig.vtt`, `${v.id}.en.vtt`].map((n) => path.join(tmp, n)).find((p) => fs.existsSync(p));
  if (!f) continue;
  const paras = parseVtt(fs.readFileSync(f, 'utf8'));
  if (!paras.length) continue;
  writeJSON(path.join(TRANSCRIPTS, `${v.id}.json`), paras);
  v.transcript = true;
  got++;
}

writeJSON(VIDEOS_JSON, videos);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`transcripts: ${got}/${todo.length} fetched`);
