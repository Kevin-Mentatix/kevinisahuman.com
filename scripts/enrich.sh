#!/bin/zsh
# Daily local job (launchd): fetch transcripts from a residential IP, write AI summaries
# with the local Claude CLI, then push so GitHub Actions rebuilds the site.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "${0:A:h}/.." || exit 1
LOG="$HOME/Library/Logs/kiah-enrich.log"
exec >>"$LOG" 2>&1
echo "=== $(date) ==="
git pull --rebase --quiet || { echo "git pull failed"; exit 1; }
node scripts/transcripts.mjs
node scripts/summarize.mjs
git add data/videos.json data/transcripts data/summaries
if git diff --cached --quiet; then echo "nothing new"; exit 0; fi
git commit --quiet -m "enrich: transcripts and summaries for new videos"
git push --quiet && echo "pushed"
