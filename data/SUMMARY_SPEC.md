# Video summary spec (SEO/GEO)

For each video ID you are given:

1. Read `data/videos.json` for the video's title, duration, type, and description (find it by `id`).
2. Read `data/transcripts/<id>.json`, an array of `[startSeconds, paragraphText]`. The text is auto-captions, so expect ASR errors. Use context to infer correct names, e.g. "Peter Teal" = Peter Thiel, "Flock" = Flock Safety cameras, "TESCREAL", "Extropians", "Palantir", "Anduril", "Alcor".
3. Write `data/summaries/<id>.json` containing exactly:

```json
{
  "metaDescription": "...",
  "summary": "...",
  "keyMoments": [{ "t": 0, "label": "..." }],
  "entities": ["..."]
}
```

## Fields

- **metaDescription**: 120–155 characters, one or two sentences, for Google's results page. Say concretely what the video covers. Name the key entities. No hashtags, no clickbait, no emoji.
- **summary**: plain prose.
  - Length: 90–160 words for long videos and streams, 40–70 words for Shorts (60s or less).
  - Third person ("Kevin ...").
  - Open with a sentence that directly answers "what is this video about?" so an AI engine can quote it.
  - Attribute claims to the speaker: "Kevin argues", "Kevin reports", "according to Kevin", "the guest says". Never state contested claims as established fact.
  - Name the people, companies, and programs involved.
  - Do not invent anything that is not in the transcript.
- **keyMoments**: chapter markers.
  - 4–8 for videos over 10 minutes, 2–4 for 3–10 minutes, empty `[]` for Shorts.
  - `t` is an integer second taken from the transcript paragraph where the topic starts; the first one must be `t: 0`.
  - `label` is 3–8 words in title case, descriptive and specific (e.g. "How Flock Shares Data With ICE").
- **entities**: 3–10 proper nouns or key concepts actually discussed, properly spelled (people, companies, programs, ideologies).

## Rules

- Valid JSON only, UTF-8, straight quotes inside strings escaped.
- Neutral, factual tone. Never put words in Kevin's mouth that he did not say.
- If a transcript is nearly empty (e.g. a music-only Short), base the summary on the title, keep it short, and use `"keyMoments": []`.
