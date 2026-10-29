# kevinisahuman.com

Static personal-brand site for Kevin Is A Human. YouTube catalog auto-syncs hourly; every video gets its own SEO/GEO page (VideoObject schema, summary, key moments, transcript).

## How it works
- `scripts/sync.mjs`: YouTube Data API → `data/videos.json` (needs `YOUTUBE_API_KEY` secret)
- `scripts/transcripts.mjs`: yt-dlp auto-captions → `data/transcripts/` (best effort in CI; run locally to fill gaps)
- `data/summaries/<id>.json`: hand/AI-written summary + key moments (spec: `data/SUMMARY_SPEC.md`). Videos without one fall back to transcript text.
- `scripts/build.mjs`: generates `dist/` (pages, sitemap with video extension, robots, llms.txt, llms-full.txt, RSS)
- `.github/workflows/deploy.yml`: sync → build → GitHub Pages, on a schedule and instantly when YouTube pings the Worker
- `worker/`: Cloudflare Worker receiving YouTube WebSub pings → `repository_dispatch` (secrets: `HUB_SECRET`, `GITHUB_TOKEN`)
- `scripts/enrich.sh` + `scripts/com.kevinisahuman.enrich.plist`: local launchd job (3x daily) for transcripts + summaries via `claude -p`

Config lives in `site.config.mjs` (links, projects, topic channels and their keywords).

## Repo variables (Settings → Secrets and variables → Actions → Variables)
- `SITE_URL` e.g. `https://kevinisahuman.com`
- `BASE_PATH` empty on a custom domain, `/kevinisahuman.com` on github.io
- `NOINDEX` `1` while previewing, remove at launch
- `CNAME` `kevinisahuman.com` once the domain points here

## Local
`npm run preview` → http://localhost:8787
