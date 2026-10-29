// Single source of truth for identity, links, and topic "channels".
// SITE_URL / BASE_PATH / NOINDEX can be overridden by env at build time.

export const site = {
  url: process.env.SITE_URL || 'https://kevinisahuman.com',
  base: process.env.BASE_PATH || '',
  noindex: process.env.NOINDEX === '1',
  name: 'Kevin Is A Human',
  short: 'KIAH',
  tagline: 'Fighting transhumanism and the surveillance state.',
  description:
    'Kevin Is A Human investigates transhumanism, the AI cults of Silicon Valley, the surveillance state, corruption, and the conspiracies nobody wants to explain. Daily videos and live streams.',
  locale: 'en_US',
  channelId: 'UCW0thOneTVu_df6DBdfRD6w',
  uploadsPlaylist: 'UUW0thOneTVu_df6DBdfRD6w',
};

export const person = {
  name: 'Kevin',
  alternateName: ['Kevin Is A Human', 'kevin_is_a_human', 'KIAH'],
  jobTitle: 'Independent investigative creator and live streamer',
  description:
    'Kevin is an independent creator who fights transhumanism and the surveillance state while investigating conspiracy theories and corruption, on YouTube, Twitch, and Kick.',
  knowsAbout: [
    'Transhumanism', 'TESCREAL', 'Surveillance state', 'Flock Safety cameras', 'Palantir',
    'Artificial intelligence', 'Effective altruism', 'Peter Thiel', 'Government corruption',
    'Missing and dead scientists', 'Conspiracy theories',
  ],
};

export const links = {
  youtube: 'https://www.youtube.com/@kevin_is_a_human',
  youtubeSub: 'https://www.youtube.com/@kevin_is_a_human?sub_confirmation=1',
  twitch: 'https://www.twitch.tv/kevin_is_a_human',
  kick: 'https://kick.com/kevin-is-a-human',
  x: 'https://x.com/Kevin_is_human',
  instagram: 'https://www.instagram.com/kevin_is_a_human/',
  discord: 'https://discord.gg/FjpnvxXKtA',
};

export const live = { twitch: 'kevin_is_a_human', kick: 'kevin-is-a-human' };

export const projects = [
  {
    id: 'panopticon',
    name: 'Panopticon Index',
    url: 'https://panopticonindex.com/',
    img: 'p-panopticon.webp',
    kicker: 'Mapping the U.S. surveillance state',
    blurb:
      'An interactive index of American surveillance technology: the companies, their products, the agencies and cities deploying them, who funds them, and how it all connects.',
  },
  {
    id: 'aicults',
    name: 'The AI Cults',
    url: 'https://theaicults.com/',
    img: 'p-aicults.webp',
    kicker: 'How Silicon Valley learned to build a god',
    blurb:
      'An investigation into TESCREAL, the interlocking belief system treating artificial intelligence as a divine project, from cybernetics and LessWrong to OpenAI and the literal Church of AI.',
  },
  {
    id: 'scientists',
    name: 'Who Killed The Scientists?',
    url: 'https://whokilledthescientists.com/',
    img: 'p-scientists.webp',
    kicker: '21+ dead or missing since 2022',
    blurb:
      'Scientists connected to classified U.S. defense, aerospace, and nuclear programs have died or vanished since 2022. An interactive investigation with a profile and sources for every case.',
  },
];

// Topic hubs, styled as TV channels (matches the stream intro).
// keywords are regex fragments (case-insensitive, implicit leading \b) scored against
// title (x3), tags (x2), and summary/entities (x1). A video joins a topic at score >= 2.
export const topics = [
  {
    slug: 'surveillance-state', ch: '17', name: 'Surveillance State', project: 'panopticon',
    keywords: ['flock', 'surveillance', 'palantir', 'biometric', 'alpr', 'toka', 'cameras?\\b', 'axon\\b', 'profiling', 'pre-? ?crime', 'tracking', 'call the cops', 'stalk', 'facial recognition'],
    intro:
      'Flock license-plate cameras, Palantir, biometric ID, and the private companies quietly building a nationwide tracking grid. Kevin follows who builds it, who funds it, and who it gets used against.',
  },
  {
    slug: 'transhumanism', ch: '33', name: 'Transhumanism', project: 'aicults',
    keywords: ['transhuman', 'cyborg', 'immortal', 'alcor', 'cryogenic', 'cryonic', 'frozen', 'extropian', 'brain chip', 'neuralink', 'longevity', 'life extension'],
    intro:
      'The movement to merge people with machines: cyborg companies, cryonics, life extension, and the billionaires funding a "post-human" future. Kevin argues against it and digs into who is pushing it.',
  },
  {
    slug: 'ai-cults-tescreal', ch: '39', name: 'AI Cults & TESCREAL', project: 'aicults',
    keywords: ['tescreal', 'cults?\\b', 'extropian', 'altruis', 'ai god', 'religion', 'occult', 'pope\\b', 'vatican', 'theaicults', 'kill us all', 'will all die', 'rationalis', 'longtermis', 'singularit', 'replace you'],
    intro:
      'TESCREAL stands for transhumanism, extropianism, singularitarianism, cosmism, rationalism, effective altruism, and longtermism. Together they form the belief system behind the AI race. Kevin covers the ideas, the people, and the money.',
  },
  {
    slug: 'artificial-intelligence', ch: '07', name: 'Artificial Intelligence', project: 'aicults',
    keywords: ['ai\\b', 'artificial intelligence', 'openai', 'open ai\\b', 'anthropic', 'claude\\b', 'chatgpt', 'altman', 'america\\.gov'],
    intro:
      'Critical coverage of OpenAI, Anthropic, Big Tech, and government AI: who controls it, what they say in public versus what they build, and what it means for ordinary people.',
  },
  {
    slug: 'tech-billionaires', ch: '13', name: 'Tech Billionaires', project: 'panopticon',
    keywords: ['thiel', 'theil', 'altman', 'musk\\b', 'zuckerberg', 'meta\\b', 'palantir', 'anduril', 'puppet master', 'billionaire'],
    intro:
      'Peter Thiel, Sam Altman, and the rest of the small group of tech billionaires shaping surveillance, AI, and politics. Kevin looks at their companies, interviews, and connections.',
  },
  {
    slug: 'government-corruption', ch: '23', name: 'Government Corruption', project: null,
    keywords: ['trump', 'pentagon', 'hegseth', 'execution', 'bondi\\b', 'epstein', 'eppy\\b', 'sovereignty', 'section 219', 'too big to fail', 'nationaliz', 'fbi\\b', 'hacked', 'scam', 'corrupt', 'congress', 'dark brandon', 'biden'],
    intro:
      'Abuses of power in Washington and beyond: sovereignty, Epstein, government AI deals, and the officials and insiders who profit from them.',
  },
  {
    slug: 'dead-scientists', ch: '51', name: 'Dead Scientists', project: 'scientists',
    keywords: ['scientists?\\b', 'plutonium', 'whokilledthescientists'],
    intro:
      'Since 2022, more than 21 scientists tied to classified U.S. defense, aerospace, and nuclear programs have died or disappeared. Kevin investigates the cases and how they connect.',
  },
  {
    slug: 'conspiracy-theories', ch: '27', name: 'Conspiracy Theories', project: 'scientists',
    keywords: ['conspirac', 'antigravity', 'cybertruck', 'noticing', 'probably nothing', 'epstein frozen', 'shady', 'warn us', 'cover-? ?up', 'ufo', 'uap'],
    intro:
      'The stories official explanations do not settle: antigravity programs, strange coincidences, and things worth noticing. Kevin investigates them and says plainly what holds up and what does not.',
  },
];
