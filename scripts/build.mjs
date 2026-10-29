// Static site generator: data/*.json -> dist/
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, VIDEOS_JSON, TRANSCRIPTS, readJSON, isoDuration } from './lib.mjs';
import { site, person, links, live, projects, topics } from '../site.config.mjs';

const DIST = path.join(ROOT, 'dist');
const BUILT = new Date().toISOString();

// ---------- helpers ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (p = '/') => site.base + p;
const abs = (p = '/') => site.url + site.base + p;
const thumb = (v, size = 'mqdefault') => `https://i.ytimg.com/vi/${v.id}/${size}.jpg`;
const bigThumb = (v) => thumb(v, v.maxres ? 'maxresdefault' : 'hqdefault');
const clock = (sec) => {
  sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
};
const dateFmt = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const num = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n || 0));
const displayTitle = (t) => t.replace(/\s*#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim() || t;
const truncate = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const write = (p, html) => {
  const f = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
};
const typeLabel = { video: 'Video', stream: 'Live VOD', short: 'Short' };

// Strip Kevin's standard links footer; keep only the video-specific part.
function cleanDescription(d = '') {
  let s = d.split(/(?:^|\n)\s*Thanks for Watching/i)[0];
  s = s.split('\n').filter((l) => !/^\s*(twitch|kick|x|instagram)\s*:/i.test(l) && !/^\s*(whokilledthescientists|theaicults)\.com\s*$/i.test(l)).join('\n');
  return s.trim();
}
const linkify = (s) => esc(s)
  .replace(/(https?:\/\/[^\s<]+)/g, (m) => `<a href="${m}" rel="noopener" target="_blank">${m.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`)
  .replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');

// ---------- data ----------
// Shorts stay in data/videos.json but are not published on the site.
const videos = readJSON(VIDEOS_JSON, []).filter((v) => v.type !== 'short');
for (const v of videos) {
  v.t = displayTitle(v.title);
  v.desc = cleanDescription(v.description);
  v.sum = readJSON(path.join(DATA, 'summaries', `${v.id}.json`), null);
  v.paras = v.transcript ? readJSON(path.join(TRANSCRIPTS, `${v.id}.json`), []) : [];
  v.path = `/videos/${v.slug}/`;
  v.meta = v.sum?.metaDescription
    || truncate(v.desc || (v.paras.length ? v.paras.slice(0, 2).map((p) => p[1]).join(' ') : `${v.t} — a ${typeLabel[v.type].toLowerCase()} from Kevin Is A Human.`), 155);

  // topic scoring
  const score = {};
  const fields = [[v.title, 3], [(v.tags || []).join(' | '), 2], [v.desc, 1], [v.sum ? v.sum.summary + ' ' + (v.sum.entities || []).join(' | ') : '', 1]];
  for (const tp of topics) {
    let s = 0;
    for (const [text, w] of fields) if (tp.keywords.some((k) => new RegExp('\\b' + k, 'i').test(text))) s += w;
    if (s >= 2) score[tp.slug] = s;
  }
  v.topics = Object.keys(score).sort((a, b) => score[b] - score[a]);
}
const topicBy = Object.fromEntries(topics.map((t) => [t.slug, t]));
const projectBy = Object.fromEntries(projects.map((p) => [p.id, p]));
const longform = videos;
for (const t of topics) t.videos = videos.filter((v) => v.topics.includes(t.slug));

// ---------- entities (JSON-LD) ----------
const PERSON_ID = abs('/#kevin');
const SITE_ID = abs('/#website');
const sameAs = [links.youtube, links.twitch, links.kick, links.x, links.instagram, links.discord];
const personLD = {
  '@type': 'Person', '@id': PERSON_ID, name: person.name, alternateName: person.alternateName,
  description: person.description, jobTitle: person.jobTitle, url: abs('/'), image: abs('/assets/img/kevin.jpg'),
  sameAs, knowsAbout: person.knowsAbout,
  owns: projects.map((p) => ({ '@type': 'WebSite', name: p.name, url: p.url })),
};
const websiteLD = {
  '@type': 'WebSite', '@id': SITE_ID, url: abs('/'), name: site.name, description: site.description,
  inLanguage: 'en', publisher: { '@id': PERSON_ID },
  potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: abs('/videos/') + '?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
};
const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(p) })),
});
const videoLD = (v) => {
  const o = {
    '@type': 'VideoObject', '@id': abs(v.path) + '#video', name: v.t,
    description: v.sum?.summary || v.meta, thumbnailUrl: [bigThumb(v), thumb(v, 'hqdefault')],
    uploadDate: v.publishedAt, duration: isoDuration(v.duration),
    embedUrl: `https://www.youtube.com/embed/${v.id}`, url: abs(v.path),
    inLanguage: 'en', author: { '@id': PERSON_ID }, creator: { '@id': PERSON_ID }, publisher: { '@id': PERSON_ID },
    interactionStatistic: { '@type': 'InteractionCounter', interactionType: { '@type': 'WatchAction' }, userInteractionCount: v.views || 0 },
    sameAs: `https://www.youtube.com/watch?v=${v.id}`,
  };
  if (v.tags?.length) o.keywords = v.tags.join(', ');
  if (v.sum?.entities?.length) o.about = v.sum.entities.map((name) => ({ '@type': 'Thing', name }));
  const km = v.sum?.keyMoments || [];
  if (km.length) {
    o.hasPart = km.map((k, i) => ({
      '@type': 'Clip', name: k.label, startOffset: k.t,
      endOffset: km[i + 1] ? km[i + 1].t : v.duration, url: `${abs(v.path)}?t=${k.t}`,
    }));
  }
  return o;
};

// ---------- layout ----------
const NAV = [['Videos', '/videos/'], ['Live', '/live/'], ['Channels', '/channels/'], ['Projects', '/projects/'], ['About', '/about/']];
const icon = {
  yt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>',
  twitch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.3 2 3 5.4v13.8h4.6V22h2.6l2.8-2.8h3.8l5.2-5.2V2H4.3zm15.6 11.1-3 3h-4.8l-2.6 2.6v-2.6H5.6V3.8h14.3v9.3zM16.8 7v5.4H15V7h1.8zm-4.8 0v5.4h-1.8V7H12z"/></svg>',
  kick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 3h6v4h2V5h2V3h6v6h-2v2h-2v2h2v2h2v6h-6v-2h-2v-2H9v4H3V3z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.2 2.3h3.4l-7.4 8.5 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9.1L.8 2.3h7l4.8 6.4 5.6-6.4zm-1.2 18h1.9L7.1 4.2H5.1l11.9 16.1z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8C2.4 4 3.9 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M5 12h14m-6-6 6 6-6 6"/></svg>',
};
const socials = () => `<ul class="socials">
  <li><a href="${links.discord}" rel="noopener" target="_blank" aria-label="Discord">${icon.discord}</a></li>
  <li><a href="${links.youtube}" rel="me noopener" target="_blank" aria-label="YouTube">${icon.yt}</a></li>
  <li><a href="${links.kick}" rel="me noopener" target="_blank" aria-label="Kick">${icon.kick}</a></li>
  <li><a href="${links.twitch}" rel="me noopener" target="_blank" aria-label="Twitch">${icon.twitch}</a></li>
  <li><a href="${links.x}" rel="me noopener" target="_blank" aria-label="X">${icon.x}</a></li>
  <li><a href="${links.instagram}" rel="me noopener" target="_blank" aria-label="Instagram">${icon.ig}</a></li>
</ul>`;

function layout({ title, description, path: p, image, schema = [], body, ogType = 'website', bodyClass = '' }) {
  const canonical = abs(p);
  const img = image || abs('/assets/img/og.jpg');
  const fullTitle = title ? `${title} | ${site.name}` : `${site.name} — ${site.tagline.replace(/\.$/, '')}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${site.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1'}">
<meta name="author" content="${esc(site.name)}">
<meta name="theme-color" content="#0b0b0a">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title || site.name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="${site.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@Kevin_is_human">
<meta name="twitter:creator" content="@Kevin_is_human">
<link rel="icon" href="${url('/assets/img/favicon-32.png')}" sizes="32x32">
<link rel="apple-touch-icon" href="${url('/assets/img/apple-touch-icon.png')}">
<link rel="manifest" href="${url('/site.webmanifest')}">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} — new videos" href="${url('/feed.xml')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://i.ytimg.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=VT323&display=swap">
<link rel="stylesheet" href="${url('/assets/css/site.css')}?v=${BUILT.slice(0, 16).replace(/\D/g, '')}">
${ld({ '@context': 'https://schema.org', '@graph': [websiteLD, personLD, ...schema] })}
${site.umami ? `<script defer src="https://cloud.umami.is/script.js" data-website-id="${site.umami}" data-domains="kevinisahuman.com"></script>\n` : ''}</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<div class="live-bar" id="live-bar" hidden><a href="${url('/live/')}"><span class="rec">● LIVE</span> Kevin is streaming now <span id="live-where"></span> — watch here ${icon.arrow}</a></div>
<header class="site-head">
  <a class="brand" href="${url('/')}" aria-label="${esc(site.name)} — home">
    <img src="${url('/assets/img/ripple-512.png')}" alt="" width="36" height="36">
    <span class="wordmark"><span>Kevin is a</span> <b>Human</b></span>
  </a>
  <button class="nav-toggle" aria-expanded="false" aria-controls="nav" aria-label="Menu"><span></span><span></span></button>
  <nav id="nav" aria-label="Primary">
    <ul>${NAV.map(([n, h]) => `<li><a href="${url(h)}"${p.startsWith(h) ? ' aria-current="page"' : ''}>${n}</a></li>`).join('')}</ul>
    <a class="btn btn-discord" href="${links.discord}" rel="noopener" target="_blank">${icon.discord} Discord</a>
    <a class="btn btn-sub" href="${links.youtubeSub}" rel="noopener" target="_blank">${icon.yt} Subscribe</a>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="site-foot">
  <div class="foot-grid">
    <div>
      <a class="brand" href="${url('/')}"><img src="${url('/assets/img/ripple-512.png')}" alt="" width="36" height="36" loading="lazy"><span class="wordmark"><span>Kevin is a</span> <b>Human</b></span></a>
      <p class="foot-tag">${esc(site.tagline)} Investigating the people building the cage, live and on YouTube.</p>
      ${socials()}
    </div>
    <div>
      <h2 class="hud">Channels</h2>
      <ul>${topics.map((t) => `<li><a href="${url(`/channels/${t.slug}/`)}"><span class="ch">CH ${t.ch}</span> ${esc(t.name)}</a></li>`).join('')}</ul>
    </div>
    <div>
      <h2 class="hud">Investigations</h2>
      <ul>${projects.map((pr) => `<li><a href="${pr.url}" rel="noopener" target="_blank">${esc(pr.name)}</a></li>`).join('')}</ul>
      <h2 class="hud">Site</h2>
      <ul>${NAV.map(([n, h]) => `<li><a href="${url(h)}">${n}</a></li>`).join('')}<li><a href="${url('/feed.xml')}">RSS</a></li></ul>
    </div>
  </div>
  <p class="fine">© ${new Date().getFullYear()} Kevin Is A Human. Videos play through YouTube's official player, so every view counts on YouTube.</p>
</footer>
<script>window.KIAH=${JSON.stringify({ base: site.base, twitch: live.twitch, kick: live.kick })};</script>
<script src="${url('/assets/js/site.js')}?v=${BUILT.slice(0, 16).replace(/\D/g, '')}" defer></script>
</body>
</html>`;
}

// ---------- components ----------
const card = (v, { lazy = true } = {}) => `<a class="card" href="${url(v.path)}" data-type="${v.type}" data-topics="${v.topics.join(' ')}" data-date="${v.publishedAt}" data-views="${v.views || 0}" data-k="${esc((v.t + ' ' + (v.tags || []).join(' ') + ' ' + (v.sum?.entities || []).join(' ')).toLowerCase())}">
  <span class="thumb"><img src="${thumb(v)}" alt="" width="320" height="180"${lazy ? ' loading="lazy"' : ''} decoding="async"><span class="dur">${clock(v.duration)}</span>${v.type !== 'video' ? `<span class="badge badge-${v.type}">${typeLabel[v.type]}</span>` : ''}</span>
  <span class="card-body"><span class="card-title">${esc(v.t)}</span><span class="card-meta">${dateFmt(v.publishedAt)} · ${num(v.views)} views</span></span>
</a>`;
const grid = (list, opts) => `<div class="grid">${list.map((v) => card(v, opts)).join('\n')}</div>`;
const facade = (v, eager = false) => `<div class="yt" data-id="${v.id}" data-title="${esc(v.t)}">
  <img src="${bigThumb(v)}" alt="${esc(v.t)}" width="1280" height="720"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}>
  <button class="yt-play" type="button" aria-label="Play: ${esc(v.t)}">${icon.play}</button>
</div>`;
const hud = (s) => `<span class="hud">${s}</span>`;
const projectCta = (pr, context) => pr ? `<aside class="cta-project">
  <img src="${url('/assets/img/' + pr.img)}" alt="${esc(pr.name)}" width="400" height="210" loading="lazy">
  <div><p class="hud">Go deeper ${context ? '· ' + esc(context) : ''}</p><h2>${esc(pr.name)}</h2><p>${esc(pr.blurb)}</p>
  <a class="btn" href="${pr.url}" rel="noopener" target="_blank">Open ${esc(pr.name)} ${icon.arrow}</a></div>
</aside>` : '';
const discordCta = () => `<section class="cta-discord">
  <div class="cta-discord-icon">${icon.discord}</div>
  <div><p class="hud">Community · Free to join</p><h2>Join the Kevin Is A Human Discord.</h2><p>Talk through the investigations with people who are paying attention, share what you're finding, and get every new upload in #youtube-uploads.</p></div>
  <a class="btn btn-discord btn-lg" href="${links.discord}" rel="noopener" target="_blank">${icon.discord} Join the Discord</a>
</section>`;
const subscribeCta = () => `<section class="cta-sub">
  <div><p class="hud">New video almost every day</p><h2>Don't miss the next one.</h2><p>Subscribe on YouTube, join the community on Discord, or catch the investigations live on Kick and Twitch.</p></div>
  <div class="cta-actions">
    <a class="btn btn-primary" href="${links.youtubeSub}" rel="noopener" target="_blank">${icon.yt} Subscribe on YouTube</a>
    <a class="btn btn-discord" href="${links.discord}" rel="noopener" target="_blank">${icon.discord} Join the Discord</a>
    <a class="btn" href="${links.kick}" rel="noopener" target="_blank">${icon.kick} Kick</a>
    <a class="btn" href="${links.twitch}" rel="noopener" target="_blank">${icon.twitch} Twitch</a>
  </div>
</section>`;

// ---------- pages ----------
function home() {
  const [latest, ...rest] = longform;
  const upNext = rest.slice(0, 4);
  const faq = faqs();
  const body = `
<section class="hero">
  <video class="hero-video" autoplay muted loop playsinline preload="metadata" poster="${url('/assets/media/hero-poster.jpg')}" aria-hidden="true">
    <source src="${url('/assets/media/hero.mp4')}" type="video/mp4">
  </video>
  <div class="hero-scan" aria-hidden="true"></div>
  <div class="hero-hud" aria-hidden="true"><span>PLAY ▸</span><span></span><span class="tc" id="tc">0:00:00</span></div>
  <div class="hero-inner">
    <h1 class="hero-title"><span>Kevin is a</span> <b>Human</b></h1>
    <p class="hero-sub">Investigating <strong>transhumanism</strong>, the <strong>AI cults</strong> of Silicon Valley, the <strong>surveillance state</strong>, and the corruption that connects them.</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="${url(latest.path)}">${icon.play} Watch the latest</a>
      <a class="btn btn-discord" href="${links.discord}" rel="noopener" target="_blank">${icon.discord} Join the Discord</a>
      <a class="btn" href="${url('/videos/')}">Browse all ${videos.length} videos</a>
      <a class="btn btn-ghost" href="${url('/live/')}"><span class="rec">●</span> Live streams</a>
    </div>
  </div>
</section>

<section class="wrap section latest">
  <header class="sec-head">${hud('Now playing')}<h2>Latest upload</h2></header>
  <div class="latest-grid">
    <div>
      ${facade(latest, true)}
      <h3 class="latest-title"><a href="${url(latest.path)}">${esc(latest.t)}</a></h3>
      <p class="muted">${dateFmt(latest.publishedAt)} · ${clock(latest.duration)} · ${typeLabel[latest.type]}</p>
      ${latest.sum ? `<p>${esc(latest.sum.summary)}</p>` : ''}
    </div>
    <div class="up-next">
      <p class="hud">Up next</p>
      ${upNext.map((v) => card(v)).join('\n')}
      <a class="more" href="${url('/videos/')}">Full catalog ${icon.arrow}</a>
    </div>
  </div>
</section>

<div class="wrap">${discordCta()}</div>

<section class="wrap section">
  <header class="sec-head">${hud('Change the channel')}<h2>What Kevin investigates</h2></header>
  <div class="channels">
    ${topics.filter((t) => t.videos.length).map((t) => `<a class="channel" href="${url(`/channels/${t.slug}/`)}">
      <span class="ch">CH ${t.ch}</span><span class="ch-name">${esc(t.name)}</span>
      <span class="ch-intro">${esc(truncate(t.intro, 120))}</span><span class="ch-count">${t.videos.length} videos ${icon.arrow}</span>
    </a>`).join('\n')}
  </div>
</section>

<section class="wrap section">
  <header class="sec-head">${hud('Investigations')}<h2>Three sites, three rabbit holes</h2></header>
  <div class="projects">
    ${projects.map((pr) => `<a class="project" href="${pr.url}" rel="noopener" target="_blank">
      <img src="${url('/assets/img/' + pr.img)}" alt="${esc(pr.name)} preview" width="800" height="420" loading="lazy">
      <span class="project-text"><span class="hud">${esc(pr.kicker)}</span><span class="project-name">${esc(pr.name)} ${icon.arrow}</span><span class="project-blurb">${esc(pr.blurb)}</span></span>
    </a>`).join('\n')}
  </div>
</section>

<section class="wrap section about-strip">
  <img src="${url('/assets/img/kevin.webp')}" alt="Kevin, host of Kevin Is A Human, at the mic" width="240" height="240" loading="lazy">
  <div>
    <p class="hud">Who is Kevin?</p>
    <h2>A human, still.</h2>
    <p>${esc(person.description)} He also built <a href="${projects[0].url}" rel="noopener" target="_blank">Panopticon Index</a>, <a href="${projects[1].url}" rel="noopener" target="_blank">The AI Cults</a>, and <a href="${projects[2].url}" rel="noopener" target="_blank">Who Killed The Scientists?</a></p>
    <a class="btn" href="${url('/about/')}">More about Kevin ${icon.arrow}</a>
  </div>
</section>

<section class="wrap section faq">
  <header class="sec-head">${hud('Briefing')}<h2>Frequently asked</h2></header>
  ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('\n')}
</section>

<div class="wrap">${subscribeCta()}</div>`;
  write('/', layout({
    title: '', description: site.description, path: '/', body, bodyClass: 'home',
    schema: [{ '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) }],
  }));
}

function faqs() {
  return [
    ['Who is Kevin Is A Human?', `${esc(person.description)} He publishes new videos on YouTube almost every day and streams live on <a href="${links.kick}">Kick</a>, <a href="${links.twitch}">Twitch</a>, and YouTube.`],
    ['What topics does Kevin Is A Human cover?', `Transhumanism and the TESCREAL ideologies behind the AI race, Silicon Valley's AI companies, the surveillance state (Flock cameras, Palantir, biometric tracking), tech billionaires like Peter Thiel, government corruption, and the string of dead and missing U.S. scientists.`],
    ['What is TESCREAL?', `TESCREAL is an acronym for transhumanism, extropianism, singularitarianism, cosmism, rationalism, effective altruism, and longtermism, a cluster of ideologies influential in Silicon Valley's AI industry. Kevin covers it on the <a href="${url('/channels/ai-cults-tescreal/')}">AI Cults &amp; TESCREAL channel</a> and on <a href="${projects[1].url}">theaicults.com</a>.`],
    ['Where can I watch Kevin live?', `On <a href="${links.kick}">Kick</a>, <a href="${links.twitch}">Twitch</a>, and YouTube. The <a href="${url('/live/')}">live page</a> on this site shows the stream whenever he is on.`],
    ['Is there a Kevin Is A Human community?', `Yes. The <a href="${links.discord}">Kevin Is A Human Discord</a> is free to join. It's where viewers discuss the investigations between streams, and every new upload is posted in #youtube-uploads.`],
    ['What websites does Kevin run?', `<a href="${projects[0].url}">Panopticon Index</a> maps the U.S. surveillance industry, <a href="${projects[1].url}">The AI Cults</a> investigates TESCREAL, and <a href="${projects[2].url}">Who Killed The Scientists?</a> tracks the scientists tied to classified programs who have died or vanished since 2022.`],
    ['Do views on this site count on YouTube?', `Yes. Every video here plays through YouTube's official embedded player, so views and watch time count toward the channel just like watching on YouTube.`],
  ];
}

function catalog() {
  const body = `
<section class="wrap section page-head">
  ${hud(`Archive · ${videos.length} tapes`)}
  <h1>Every video</h1>
  <p class="lede">The full Kevin Is A Human catalog: investigations and live stream VODs. Search by person, company, or topic.</p>
  <form class="filters" role="search" onsubmit="return false">
    <label class="sr" for="q">Search videos</label>
    <input id="q" type="search" placeholder="Search: Thiel, Flock, TESCREAL…" autocomplete="off">
    <div class="chips" role="group" aria-label="Type">
      <button type="button" class="chip" data-type="all" aria-pressed="true">All</button>
      <button type="button" class="chip" data-type="video" aria-pressed="false">Videos</button>
      <button type="button" class="chip" data-type="stream" aria-pressed="false">Live VODs</button>
    </div>
    <label class="sr" for="ch">Channel</label>
    <select id="ch"><option value="">All channels</option>${topics.map((t) => `<option value="${t.slug}">CH ${t.ch} · ${esc(t.name)}</option>`).join('')}</select>
    <label class="sr" for="sort">Sort</label>
    <select id="sort"><option value="new">Newest</option><option value="old">Oldest</option><option value="views">Most viewed</option></select>
  </form>
  <p class="count" id="count" aria-live="polite">${videos.length} videos</p>
</section>
<section class="wrap">
  <div class="grid" id="catalog">${videos.map((v, i) => card(v, { lazy: i > 7 })).join('\n')}</div>
  <p class="empty" id="empty" hidden>No tapes match that. Try another search.</p>
</section>
<div class="wrap">${subscribeCta()}</div>`;
  write('/videos/', layout({
    title: 'All Videos', path: '/videos/', body,
    description: `Browse all ${videos.length} Kevin Is A Human videos and live stream VODs on transhumanism, AI cults, the surveillance state, and corruption. Searchable.`,
    schema: [
      { '@type': 'CollectionPage', '@id': abs('/videos/'), name: 'All videos', isPartOf: { '@id': SITE_ID }, about: { '@id': PERSON_ID },
        mainEntity: { '@type': 'ItemList', numberOfItems: videos.length, itemListElement: videos.map((v, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(v.path), name: v.t })) } },
      crumbs([['Home', '/'], ['Videos', '/videos/']]),
    ],
  }));
}

function videoPage(v) {
  const related = [
    ...videos.filter((o) => o !== v && o.type !== 'short' && o.topics.some((t) => v.topics.includes(t))),
    ...longform.filter((o) => o !== v),
  ].filter((o, i, a) => a.indexOf(o) === i).slice(0, 6);
  const primary = topicBy[v.topics[0]];
  const pr = primary?.project ? projectBy[primary.project] : null;
  const km = v.sum?.keyMoments || [];
  const embed = `https://www.youtube.com/embed/${v.id}?rel=0&playsinline=1&enablejsapi=1`;
  const body = `
<article class="wrap watch">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${url('/')}">Home</a> / <a href="${url('/videos/')}">Videos</a>${primary ? ` / <a href="${url(`/channels/${primary.slug}/`)}">${esc(primary.name)}</a>` : ''}</nav>
  <div class="player${v.type === 'short' ? ' player-short' : ''}">
    <iframe id="player" src="${embed}" data-src="${embed}" title="${esc(v.t)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
  </div>
  <div class="watch-grid">
    <div class="watch-main">
      <p class="hud">${typeLabel[v.type]}${primary ? ` · CH ${primary.ch} ${esc(primary.name)}` : ''}</p>
      <h1>${esc(v.t)}</h1>
      <p class="watch-meta"><time datetime="${v.publishedAt}">${dateFmt(v.publishedAt)}</time> · ${clock(v.duration)} · ${num(v.views)} views</p>
      <div class="watch-actions">
        <a class="btn btn-primary" href="${links.youtubeSub}" rel="noopener" target="_blank">${icon.yt} Subscribe</a>
        <a class="btn btn-discord" href="${links.discord}" rel="noopener" target="_blank">${icon.discord} Discuss on Discord</a>
        <a class="btn" href="https://www.youtube.com/watch?v=${v.id}" rel="noopener" target="_blank">Comment on YouTube</a>
        <button class="btn btn-ghost" type="button" data-share>Copy link</button>
      </div>
      ${v.topics.length ? `<ul class="tags">${v.topics.map((t) => `<li><a href="${url(`/channels/${t}/`)}">CH ${topicBy[t].ch} ${esc(topicBy[t].name)}</a></li>`).join('')}</ul>` : ''}
      ${v.sum ? `<section class="summary"><h2>What this ${v.type === 'stream' ? 'stream' : 'video'} covers</h2><p>${esc(v.sum.summary)}</p>
        ${v.sum.entities?.length ? `<p class="entities"><span class="hud">Mentioned</span> ${v.sum.entities.map((e) => `<a href="${url('/videos/')}?q=${encodeURIComponent(e)}">${esc(e)}</a>`).join('')}</p>` : ''}</section>` : ''}
      ${km.length ? `<section class="moments"><h2>Key moments</h2><ol>${km.map((k) => `<li><button type="button" data-t="${k.t}"><span class="ts">${clock(k.t)}</span> ${esc(k.label)}</button></li>`).join('')}</ol></section>` : ''}
      ${v.desc ? `<section class="desc"><h2>From the description</h2><p>${linkify(v.desc)}</p></section>` : ''}
      ${v.paras.length ? `<section class="transcript" id="transcript">
        <h2>Transcript</h2>
        <p class="muted small">Auto-generated captions, lightly cleaned. Click a timestamp to jump there.</p>
        <div class="tx" data-collapsed="true">${v.paras.map(([t, s]) => `<p><button type="button" data-t="${t}" class="ts">${clock(t)}</button> ${esc(s)}</p>`).join('\n')}</div>
        <button class="btn btn-ghost tx-toggle" type="button" aria-expanded="false">Show full transcript</button>
      </section>` : ''}
    </div>
    <aside class="watch-side">
      ${projectCta(pr, primary?.name)}
      <p class="hud">Watch next</p>
      ${related.map((o) => card(o)).join('\n')}
    </aside>
  </div>
  ${subscribeCta()}
</article>`;
  write(v.path, layout({
    title: v.t, description: v.meta, path: v.path, image: bigThumb(v), ogType: 'video.other', body,
    schema: [
      videoLD(v),
      { '@type': 'WebPage', '@id': abs(v.path), url: abs(v.path), name: v.t, isPartOf: { '@id': SITE_ID }, primaryImageOfPage: bigThumb(v), mainEntity: { '@id': abs(v.path) + '#video' }, datePublished: v.publishedAt },
      crumbs([['Home', '/'], ['Videos', '/videos/'], [v.t, v.path]]),
    ],
  }));
}

function channelsIndex() {
  const body = `
<section class="wrap section page-head">
  ${hud('Program guide')}
  <h1>Channels</h1>
  <p class="lede">Every investigation, sorted by topic. Pick a channel.</p>
</section>
<section class="wrap"><div class="channels">
  ${topics.map((t) => `<a class="channel" href="${url(`/channels/${t.slug}/`)}"><span class="ch">CH ${t.ch}</span><span class="ch-name">${esc(t.name)}</span><span class="ch-intro">${esc(t.intro)}</span><span class="ch-count">${t.videos.length} videos ${icon.arrow}</span></a>`).join('\n')}
</div></section>
<div class="wrap">${subscribeCta()}</div>`;
  write('/channels/', layout({
    title: 'Channels: Topics Kevin Investigates', path: '/channels/', body,
    description: 'Kevin Is A Human videos by topic: surveillance state, transhumanism, AI cults and TESCREAL, artificial intelligence, tech billionaires, government corruption, dead scientists, and conspiracy theories.',
    schema: [crumbs([['Home', '/'], ['Channels', '/channels/']])],
  }));
}

function channelPage(t) {
  const pr = t.project ? projectBy[t.project] : null;
  const p = `/channels/${t.slug}/`;
  const [lead, ...others] = t.videos.filter((v) => v.type !== 'short');
  const body = `
<section class="wrap section page-head">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${url('/')}">Home</a> / <a href="${url('/channels/')}">Channels</a></nav>
  <span class="hud ch-big">CH ${t.ch}</span>
  <h1>${esc(t.name)}</h1>
  <p class="lede">${esc(t.intro)}</p>
</section>
${lead ? `<section class="wrap section latest"><div class="latest-grid">
  <div>${facade(lead)}<h2 class="latest-title"><a href="${url(lead.path)}">${esc(lead.t)}</a></h2><p class="muted">${dateFmt(lead.publishedAt)} · ${clock(lead.duration)}</p>${lead.sum ? `<p>${esc(lead.sum.summary)}</p>` : ''}</div>
  <div>${projectCta(pr, t.name)}</div>
</div></section>` : ''}
<section class="wrap section">
  <header class="sec-head">${hud(`${t.videos.length} on this channel`)}<h2>All ${esc(t.name.toLowerCase())} videos</h2></header>
  ${grid(others)}
</section>
<div class="wrap">${subscribeCta()}</div>`;
  write(p, layout({
    title: `${t.name} Videos`, path: p, body,
    description: truncate(`${t.name}: ${t.intro}`, 158),
    schema: [
      { '@type': 'CollectionPage', '@id': abs(p), name: `${t.name} — Kevin Is A Human`, description: t.intro, isPartOf: { '@id': SITE_ID }, about: { '@type': 'Thing', name: t.name },
        mainEntity: { '@type': 'ItemList', numberOfItems: t.videos.length, itemListElement: t.videos.map((v, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(v.path), name: v.t })) } },
      crumbs([['Home', '/'], ['Channels', '/channels/'], [t.name, p]]),
    ],
  }));
}

function livePage() {
  const vods = videos.filter((v) => v.type === 'stream').slice(0, 6);
  const body = `
<section class="wrap section page-head">
  ${hud('<span class="rec">●</span> Broadcast')}
  <h1>Live with Kevin</h1>
  <p class="lede">Kevin streams investigations, reactions, and interviews live on Kick, Twitch, and YouTube. When he's on, the stream plays right here.</p>
</section>
<section class="wrap section">
  <div class="live-tabs" role="tablist" aria-label="Platform">
    <button role="tab" type="button" data-platform="youtube" aria-selected="true">${icon.yt} YouTube</button>
    <button role="tab" type="button" data-platform="kick" aria-selected="false">${icon.kick} Kick</button>
    <button role="tab" type="button" data-platform="twitch" aria-selected="false">${icon.twitch} Twitch</button>
  </div>
  <div class="player live-player" id="live-player" data-channel="${site.channelId}"></div>
  <p class="muted small" id="live-status">Checking who's live…</p>
  <div class="cta-actions">
    <a class="btn btn-discord" href="${links.discord}" rel="noopener" target="_blank">${icon.discord} Join the Discord</a>
    <a class="btn" href="${links.kick}" rel="noopener" target="_blank">${icon.kick} Follow on Kick</a>
    <a class="btn" href="${links.twitch}" rel="noopener" target="_blank">${icon.twitch} Follow on Twitch</a>
    <a class="btn btn-primary" href="${links.youtubeSub}" rel="noopener" target="_blank">${icon.yt} Subscribe on YouTube</a>
  </div>
</section>
${vods.length ? `<section class="wrap section"><header class="sec-head">${hud('Past broadcasts')}<h2>Recent stream VODs</h2><a class="more" href="${url('/videos/?type=stream')}">All VODs ${icon.arrow}</a></header>${grid(vods)}</section>` : ''}`;
  write('/live/', layout({
    title: 'Live Streams on Kick, Twitch & YouTube', path: '/live/', body,
    description: 'Watch Kevin Is A Human live on Kick, Twitch, and YouTube: investigations into transhumanism, AI cults, surveillance, and corruption, plus past stream VODs.',
    schema: [crumbs([['Home', '/'], ['Live', '/live/']])],
  }));
}

function projectsPage() {
  const body = `
<section class="wrap section page-head">
  ${hud('Case files')}
  <h1>Investigations</h1>
  <p class="lede">Three independent research sites Kevin built to document what the videos only have time to touch on.</p>
</section>
<section class="wrap section">
  ${projects.map((pr) => {
    const rel = topics.filter((t) => t.project === pr.id);
    const vids = videos.filter((v) => v.type !== 'short' && v.topics.some((t) => rel.some((r) => r.slug === t))).slice(0, 3);
    return `<article class="case">
      <a href="${pr.url}" rel="noopener" target="_blank"><img src="${url('/assets/img/' + pr.img)}" alt="${esc(pr.name)} preview" width="800" height="420" loading="lazy"></a>
      <div>
        <p class="hud">${esc(pr.kicker)}</p>
        <h2>${esc(pr.name)}</h2>
        <p>${esc(pr.blurb)}</p>
        <a class="btn btn-primary" href="${pr.url}" rel="noopener" target="_blank">Visit ${esc(pr.url.replace(/^https:\/\/|\/$/g, ''))} ${icon.arrow}</a>
        ${rel.length ? `<p class="muted small">Related channels: ${rel.map((t) => `<a href="${url(`/channels/${t.slug}/`)}">${esc(t.name)}</a>`).join(', ')}</p>` : ''}
        ${vids.length ? `<div class="mini-list">${vids.map((v) => card(v)).join('')}</div>` : ''}
      </div>
    </article>`;
  }).join('\n')}
</section>`;
  write('/projects/', layout({
    title: 'Investigations: Panopticon Index, The AI Cults, Who Killed The Scientists?', path: '/projects/', body,
    description: 'Kevin\'s research sites: Panopticon Index maps the U.S. surveillance industry, The AI Cults investigates TESCREAL, and Who Killed The Scientists? tracks dead and missing scientists.',
    schema: [
      { '@type': 'ItemList', name: 'Investigations by Kevin Is A Human', itemListElement: projects.map((pr, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'WebSite', name: pr.name, url: pr.url, description: pr.blurb, creator: { '@id': PERSON_ID } } })) },
      crumbs([['Home', '/'], ['Projects', '/projects/']]),
    ],
  }));
}

function aboutPage() {
  const faq = faqs();
  const body = `
<section class="wrap section about">
  <img class="about-photo" src="${url('/assets/img/kevin.webp')}" alt="Kevin of Kevin Is A Human" width="480" height="480">
  <div>
    ${hud('Subject identified')}
    <h1>About Kevin</h1>
    <p class="lede">${esc(person.description)}</p>
    <p>On his YouTube channel, <a href="${links.youtube}" rel="me noopener" target="_blank">@kevin_is_a_human</a>, Kevin publishes new videos almost every day: breakdowns of Flock's camera network and Palantir, deep dives into the TESCREAL ideologies driving the AI race, Peter Thiel's interviews, and the unexplained deaths and disappearances of U.S. scientists. Many of his investigations happen live on <a href="${links.kick}" rel="me noopener" target="_blank">Kick</a> and <a href="${links.twitch}" rel="me noopener" target="_blank">Twitch</a>.</p>
    <p>He also builds research sites that go deeper than a video can: <a href="${projects[0].url}" rel="noopener" target="_blank">Panopticon Index</a>, <a href="${projects[1].url}" rel="noopener" target="_blank">The AI Cults</a>, and <a href="${projects[2].url}" rel="noopener" target="_blank">Who Killed The Scientists?</a></p>
    <p class="hud">Find Kevin</p>
    ${socials()}
  </div>
</section>
<section class="wrap section">
  <header class="sec-head">${hud('Coverage')}<h2>What Kevin covers</h2></header>
  <ul class="cover-list">${topics.map((t) => `<li><a href="${url(`/channels/${t.slug}/`)}"><span class="ch">CH ${t.ch}</span> <strong>${esc(t.name)}</strong></a> — ${esc(t.intro)}</li>`).join('')}</ul>
</section>
<section class="wrap section faq">
  <header class="sec-head">${hud('Briefing')}<h2>FAQ</h2></header>
  ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('\n')}
</section>
<div class="wrap">${subscribeCta()}</div>`;
  write('/about/', layout({
    title: 'About Kevin', path: '/about/', body,
    description: 'Who is Kevin Is A Human? An independent creator fighting transhumanism and the surveillance state and investigating conspiracies and corruption on YouTube, Kick, and Twitch.',
    schema: [
      { '@type': 'ProfilePage', '@id': abs('/about/'), url: abs('/about/'), name: 'About Kevin', mainEntity: { '@id': PERSON_ID }, dateModified: BUILT, isPartOf: { '@id': SITE_ID } },
      crumbs([['Home', '/'], ['About', '/about/']]),
    ],
  }));
}

function notFound() {
  const body = `<section class="wrap section page-head nf">${hud('No signal')}<h1>404: Tape not found</h1><p class="lede">This page doesn't exist, or it was moved. Try the archive.</p><a class="btn btn-primary" href="${url('/videos/')}">Browse all videos</a></section>`;
  write('/404.html', layout({ title: 'Not found', description: 'Page not found.', path: '/404.html', body }).replace(/<link rel="canonical"[^>]*>\n/, '').replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex">'));
}

// ---------- machine-readable ----------
function feeds() {
  const pages = ['/', '/videos/', '/live/', '/channels/', '/projects/', '/about/', ...topics.map((t) => `/channels/${t.slug}/`)];
  const xmlEsc = (s) => esc(s).replace(/'/g, '&apos;');
  write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${pages.map((p) => `<url><loc>${abs(p)}</loc><lastmod>${BUILT}</lastmod></url>`).join('\n')}
${videos.map((v) => `<url><loc>${abs(v.path)}</loc><lastmod>${v.publishedAt}</lastmod><video:video><video:thumbnail_loc>${bigThumb(v)}</video:thumbnail_loc><video:title>${xmlEsc(v.t)}</video:title><video:description>${xmlEsc(truncate(v.sum?.summary || v.meta, 2000))}</video:description><video:player_loc>https://www.youtube.com/embed/${v.id}</video:player_loc><video:duration>${Math.max(1, v.duration)}</video:duration><video:publication_date>${v.publishedAt}</video:publication_date><video:family_friendly>yes</video:family_friendly></video:video></url>`).join('\n')}
</urlset>
`);

  const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot'];
  write('/robots.txt', site.noindex
    ? `User-agent: *\nDisallow:\n\n# Preview build: pages carry noindex.\n`
    : `User-agent: *\nAllow: /\n\n# AI search and answer engines are welcome.\n${aiBots.map((b) => `User-agent: ${b}\nAllow: /`).join('\n\n')}\n\nSitemap: ${abs('/sitemap.xml')}\n`);

  write('/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${esc(site.name)}</title><link>${abs('/')}</link><description>${esc(site.description)}</description><language>en</language>
<atom:link href="${abs('/feed.xml')}" rel="self" type="application/rss+xml"/>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${videos.slice(0, 40).map((v) => `<item><title>${esc(v.t)}</title><link>${abs(v.path)}</link><guid isPermaLink="false">yt:${v.id}</guid><pubDate>${new Date(v.publishedAt).toUTCString()}</pubDate><description>${esc(v.sum?.summary || v.meta)}</description><media:thumbnail url="${bigThumb(v)}"/></item>`).join('\n')}
</channel>
</rss>
`);

  const llms = `# ${site.name}

> ${person.description}

Kevin publishes new videos on YouTube (${links.youtube}) almost every day and streams live on Kick (${links.kick}) and Twitch (${links.twitch}). The community Discord is ${links.discord}. Every video on this site plays via YouTube's embedded player. Each video page includes a summary, key moments, and the full transcript.

## Core pages
- [All videos](${abs('/videos/')}): searchable catalog of ${videos.length} videos and live stream VODs
- [Live](${abs('/live/')}): live stream player for Kick, Twitch, and YouTube
- [About Kevin](${abs('/about/')}): who Kevin is, what he covers, FAQ
- [Investigations](${abs('/projects/')}): Kevin's three research sites

## Investigations (external sites by Kevin)
${projects.map((p) => `- [${p.name}](${p.url}): ${p.blurb}`).join('\n')}

## Topics
${topics.map((t) => `- [${t.name}](${abs(`/channels/${t.slug}/`)}): ${t.intro}`).join('\n')}

## Videos
${videos.map((v) => `- [${v.t}](${abs(v.path)}) (${v.publishedAt.slice(0, 10)}, ${typeLabel[v.type]}): ${v.meta}`).join('\n')}

## Full text
- [llms-full.txt](${abs('/llms-full.txt')}): every video summary and key moments in one file
`;
  write('/llms.txt', llms);
  write('/llms-full.txt', `# ${site.name} — full video index\n\n> ${person.description}\n\n` + videos.map((v) => `## ${v.t}\nURL: ${abs(v.path)}\nYouTube: https://www.youtube.com/watch?v=${v.id}\nPublished: ${v.publishedAt.slice(0, 10)} · ${typeLabel[v.type]} · ${clock(v.duration)}\nTopics: ${v.topics.map((t) => topicBy[t].name).join(', ') || '—'}\n\n${v.sum?.summary || v.meta}\n${(v.sum?.keyMoments || []).length ? '\nKey moments:\n' + v.sum.keyMoments.map((k) => `- ${clock(k.t)} ${k.label}`).join('\n') + '\n' : ''}`).join('\n'));

  write('/site.webmanifest', JSON.stringify({
    name: site.name, short_name: site.short, start_url: url('/'), display: 'standalone', background_color: '#0b0b0a', theme_color: '#ff6d1f',
    icons: [{ src: url('/assets/img/icon-192.png'), sizes: '192x192', type: 'image/png' }, { src: url('/assets/img/ripple-512.png'), sizes: '512x512', type: 'image/png' }],
  }));
  write('/.nojekyll', '');
  if (process.env.CNAME) write('/CNAME', process.env.CNAME + '\n');
}

// ---------- run ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
home(); catalog(); channelsIndex(); topics.forEach(channelPage); livePage(); projectsPage(); aboutPage(); notFound();
videos.forEach(videoPage);
feeds();
const untagged = videos.filter((v) => !v.topics.length).map((v) => v.t);
console.log(`built ${videos.length} video pages, ${topics.length} channels → dist/ (${site.url}${site.base})`);
console.log('per channel:', Object.fromEntries(topics.map((t) => [t.slug, t.videos.length])));
if (untagged.length) console.log('no channel:', untagged);
