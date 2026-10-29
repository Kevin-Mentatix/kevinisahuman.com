// Writes data/summaries/<id>.json for long-form videos that have a transcript but no summary,
// using the local Claude Code CLI (`claude -p`), so it runs on Kevin's subscription.
// Spec: data/SUMMARY_SPEC.md. Run locally (scripts/enrich.sh), not in CI.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DATA, VIDEOS_JSON, TRANSCRIPTS, readJSON, writeJSON } from './lib.mjs';

const SUMS = path.join(DATA, 'summaries');
const spec = fs.readFileSync(path.join(DATA, 'SUMMARY_SPEC.md'), 'utf8');
const todo = readJSON(VIDEOS_JSON, [])
  .filter((v) => v.type !== 'short' && v.transcript && !fs.existsSync(path.join(SUMS, `${v.id}.json`)))
  .slice(0, 10);

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let done = 0;

for (const v of todo) {
  const paras = readJSON(path.join(TRANSCRIPTS, `${v.id}.json`), []);
  const input = [
    `VIDEO METADATA`,
    `id: ${v.id}`, `title: ${v.title}`, `type: ${v.type}`, `duration: ${v.duration}s`,
    `description: ${v.description}`,
    ``, `TRANSCRIPT ([seconds] text)`,
    ...paras.map(([t, s]) => `[${t}] (${clock(t)}) ${s}`),
  ].join('\n');
  const prompt = `${spec}\n\nThe video metadata and transcript are provided on stdin instead of files. ` +
    `Respond with ONLY the JSON object for this one video (no code fences, no commentary).`;

  const r = spawnSync('claude', ['-p', prompt, '--model', 'sonnet', '--output-format', 'text'], { input, encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 24 });
  const out = (r.stdout || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
    if (!j.metaDescription || !j.summary || !Array.isArray(j.keyMoments) || !Array.isArray(j.entities)) throw new Error('missing fields');
    j.keyMoments = j.keyMoments.filter((k) => Number.isInteger(k.t) && k.t >= 0 && k.t <= v.duration && k.label);
    writeJSON(path.join(SUMS, `${v.id}.json`), j);
    done++;
    console.log(`summary: ${v.id} ${v.title}`);
  } catch (e) {
    console.error(`summary failed for ${v.id}: ${e.message} ${(r.stderr || '').slice(0, 200)}`);
  }
}
console.log(`summaries: ${done}/${todo.length} written`);
