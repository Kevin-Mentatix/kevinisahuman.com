(() => {
  const K = window.KIAH || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ss = { get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  // Mobile nav
  const toggle = $('.nav-toggle');
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', open);
    $('#nav').classList.toggle('open', open);
  });

  // Analytics: outbound clicks to Discord / YouTube / Kick / Twitch / projects
  const dest = (h) => /discord\.gg/.test(h) ? 'discord' : /sub_confirmation/.test(h) ? 'youtube-subscribe' : /youtube\.com/.test(h) ? 'youtube' : /kick\.com/.test(h) ? 'kick' : /twitch\.tv/.test(h) ? 'twitch' : /^https?:/.test(h) && !h.includes(location.host) ? 'outbound' : null;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]'); const d = a && dest(a.href);
    if (!d || !window.umami) return;
    const where = a.closest('.site-head') ? 'header' : a.closest('.hero') ? 'hero' : a.closest('.cta-discord') ? 'discord-band' : a.closest('.cta-sub') ? 'subscribe-block' : a.closest('.watch-actions') ? 'watch' : a.closest('.site-foot') ? 'footer' : 'page';
    umami.track(d, { where, url: a.href, page: location.pathname });
  });

  // Hero VCR timecode
  const tc = $('#tc');
  if (tc) {
    const t0 = Date.now();
    const tick = () => { const s = Math.floor((Date.now() - t0) / 1000); tc.textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
    setInterval(tick, 1000);
  }

  // YouTube facade -> official player on click (user-initiated play counts as a YouTube view)
  const ytSrc = (id, extra = '') => `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&playsinline=1${extra}`;
  const iframe = (src, title) => {
    const f = document.createElement('iframe');
    f.src = src; f.title = title || 'YouTube video';
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.referrerPolicy = 'strict-origin-when-cross-origin'; f.allowFullscreen = true;
    return f;
  };
  $$('.yt').forEach((el) => el.addEventListener('click', () => {
    if (el.querySelector('iframe')) return;
    el.replaceChildren(iframe(ytSrc(el.dataset.id), el.dataset.title));
  }));

  // Watch page: seek via ?t= and timestamp buttons
  const player = $('#player');
  if (player) {
    const t = parseInt(new URLSearchParams(location.search).get('t'), 10);
    if (t > 0) player.src = `${player.dataset.src}&start=${t}&autoplay=1`;
    const cmd = (func, args = []) => player.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      cmd('seekTo', [+b.dataset.t, true]); cmd('playVideo');
      if (player.getBoundingClientRect().top < 0) player.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const tx = $('.tx'), tb = $('.tx-toggle');
    tb?.addEventListener('click', () => {
      const open = tx.dataset.collapsed === 'true';
      tx.dataset.collapsed = open ? 'false' : 'true';
      tb.setAttribute('aria-expanded', open);
      tb.textContent = open ? 'Collapse transcript' : 'Show full transcript';
    });
    $('[data-share]')?.addEventListener('click', async (e) => {
      const u = location.href.split('?')[0];
      try { if (navigator.share) await navigator.share({ title: document.title, url: u }); else { await navigator.clipboard.writeText(u); e.target.textContent = 'Link copied'; } } catch {}
    });
  }

  // Catalog filtering
  const cat = $('#catalog');
  if (cat) {
    const cards = $$('.card', cat);
    const q = $('#q'), ch = $('#ch'), sort = $('#sort'), count = $('#count'), empty = $('#empty');
    const params = new URLSearchParams(location.search);
    let type = params.get('type') || 'all';
    q.value = params.get('q') || ''; ch.value = params.get('ch') || '';
    const apply = () => {
      const terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let n = 0;
      for (const c of cards) {
        const ok = (type === 'all' || c.dataset.type === type) && (!ch.value || c.dataset.topics.split(' ').includes(ch.value)) && terms.every((w) => c.dataset.k.includes(w));
        c.hidden = !ok; if (ok) n++;
      }
      const by = sort.value;
      const sorted = [...cards].sort((a, b) => by === 'views' ? b.dataset.views - a.dataset.views : by === 'old' ? a.dataset.date.localeCompare(b.dataset.date) : b.dataset.date.localeCompare(a.dataset.date));
      sorted.forEach((c) => cat.appendChild(c));
      count.textContent = `${n} video${n === 1 ? '' : 's'}`;
      empty.hidden = n > 0;
      $$('.chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === type));
      const p = new URLSearchParams();
      if (q.value) p.set('q', q.value); if (type !== 'all') p.set('type', type); if (ch.value) p.set('ch', ch.value);
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    };
    $$('.chip').forEach((b) => b.addEventListener('click', () => { type = b.dataset.type; apply(); }));
    q.addEventListener('input', apply); ch.addEventListener('change', apply); sort.addEventListener('change', apply);
    apply();
  }

  // Live status (Twitch via decapi, Kick public API). Cached 2 min per tab.
  async function liveStatus() {
    const cached = ss.get('kiah-live');
    if (cached && Date.now() - cached.at < 120000) return cached;
    const out = { at: Date.now(), twitch: false, kick: false };
    await Promise.allSettled([
      fetch(`https://decapi.me/twitch/uptime/${K.twitch}`).then((r) => r.text()).then((t) => { out.twitch = !/offline|error|not found/i.test(t); }),
      fetch(`https://kick.com/api/v2/channels/${K.kick}`).then((r) => r.json()).then((j) => { out.kick = !!j.livestream; }),
    ]);
    ss.set('kiah-live', out);
    return out;
  }
  liveStatus().then((s) => {
    const where = [s.kick && 'Kick', s.twitch && 'Twitch'].filter(Boolean);
    if (where.length) { $('#live-where').textContent = 'on ' + where.join(' & '); $('#live-bar').hidden = false; }
    if ($('#live-player')) setupLive(s);
  });

  function setupLive(s) {
    const box = $('#live-player'), status = $('#live-status');
    const srcs = {
      youtube: `https://www.youtube.com/embed/live_stream?channel=${box.dataset.channel}&autoplay=1&mute=0`,
      kick: `https://player.kick.com/${K.kick}?autoplay=true`,
      twitch: `https://player.twitch.tv/?channel=${K.twitch}&parent=${location.hostname}&autoplay=true`,
    };
    const tabs = $$('.live-tabs [data-platform]');
    tabs.forEach((t) => t.classList.toggle('is-live', !!s[t.dataset.platform]));
    const show = (p) => {
      tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.platform === p));
      box.replaceChildren(iframe(srcs[p], `Kevin Is A Human live on ${p}`));
    };
    tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.platform)));
    // Default to YouTube (counts toward channel metrics); fall back to whichever platform is live.
    show('youtube');
    status.textContent = s.kick || s.twitch
      ? `Live now on ${[s.kick && 'Kick', s.twitch && 'Twitch'].filter(Boolean).join(' & ')}. If the YouTube player is blank, switch tabs.`
      : "Kevin isn't live right now. Follow on Kick or Twitch to get notified, or watch a past broadcast below.";
  }
})();
