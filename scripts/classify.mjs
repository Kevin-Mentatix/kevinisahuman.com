// Assigns topic channels to long-form videos that have a summary but no entry in data/topics.json,
// using the local Claude Code CLI (`claude -p`) and each topic's `scope` in site.config.mjs.
// Existing entries are never touched, so hand edits to data/topics.json stick. Run locally (scripts/enrich.sh).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DATA, VIDEOS_JSON, readJSON, writeJSON } from './lib.mjs';
import { topics } from '../site.config.mjs';

const FILE = path.join(DATA, 'topics.json');
const assigned = readJSON(FILE, {});
const valid = new Set(topics.map((t) => t.slug));
const todo = readJSON(VIDEOS_JSON, [])
  .filter((v) => v.type !== 'short' && !(v.id in assigned) && fs.existsSync(path.join(DATA, 'summaries', `${v.id}.json`)));

const rules = topics.map((t) => `- ${t.slug}: ${t.scope}`).join('\n');
const prompt = `You sort videos from the YouTube channel "Kevin Is A Human" into topic channels.

Topic channels:
${rules}

Rules:
- Assign a topic only if it is a main focus of the video (its premise or a substantial segment), never for a passing mention, a name-drop, or a single word in the title.
- Return 0 to 3 topics, most central first. Zero is fine if none is a main focus.
- Use only the slugs above.

The video is on stdin. Respond with ONLY a JSON array of slugs, e.g. ["surveillance-state","tech-billionaires"].`;

let done = 0;
for (const v of todo) {
  const sum = readJSON(path.join(DATA, 'summaries', `${v.id}.json`), {});
  const input = [`title: ${v.title}`, `type: ${v.type}`, `summary: ${sum.summary}`,
    `key moments: ${(sum.keyMoments || []).map((k) => k.label).join(' | ')}`, `entities: ${(sum.entities || []).join(', ')}`].join('\n');
  const r = spawnSync('claude', ['-p', prompt, '--model', 'sonnet', '--output-format', 'text'], { input, encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '').trim();
  try {
    const list = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
    if (!Array.isArray(list)) throw new Error('not an array');
    assigned[v.id] = [...new Set(list)].filter((t) => valid.has(t)).slice(0, 3);
    done++;
    console.log(`topics: ${v.id} ${v.title} → ${assigned[v.id].join(', ') || '(none)'}`);
  } catch (e) {
    console.error(`classify failed for ${v.id}: ${e.message} ${(r.stderr || '').slice(0, 200)}`);
  }
}
if (done) writeJSON(FILE, assigned);
console.log(`topics: ${done}/${todo.length} classified`);
