// YouTube WebSub (PubSubHubbub) receiver: YouTube pings this on upload/update,
// and it fires a repository_dispatch so GitHub Actions syncs + deploys within minutes.
const enc = new TextEncoder();

async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Subscription verification from the hub.
    if (req.method === 'GET') {
      const challenge = url.searchParams.get('hub.challenge');
      const topic = url.searchParams.get('hub.topic') || '';
      if (challenge && topic.includes(env.CHANNEL_ID)) return new Response(challenge);
      return new Response('kiah-websub ok');
    }

    if (req.method === 'POST') {
      const body = await req.text();
      const sig = req.headers.get('X-Hub-Signature') || '';
      // Ignore unsigned/forged posts (hub expects a 2xx either way).
      if (sig !== `sha1=${await hmacHex(env.HUB_SECRET, body)}`) return new Response('ignored', { status: 202 });

      const videoId = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || null;
      const r = await fetch(`https://api.github.com/repos/${env.REPO}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'kiah-websub',
        },
        body: JSON.stringify({ event_type: 'youtube-upload', client_payload: { videoId } }),
      });
      return new Response(`dispatch ${r.status}`, { status: r.ok ? 200 : 202 });
    }

    return new Response('method not allowed', { status: 405 });
  },
};
