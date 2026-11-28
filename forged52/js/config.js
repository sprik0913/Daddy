// Central branding, feature flags and service configuration.
// Rename the whole app by editing BRAND. Nothing else hard-codes these strings.

export const BRAND = {
  parent: 'FORGED',
  program: 'FORGED52',
  programShort: '52',
  tagline: 'Forged by the Word. Strengthened by brothers. Transformed by Christ.',
  taglineLines: ['Forged by the Word.', 'Strengthened by brothers.', 'Transformed by Christ.'],
  secondary: 'Don’t just spend a year reading the Bible. Spend a year letting God change the man you are.',
  heroHeadline: 'God’s Word. Your life. A deeper faith.',
  heroSupport: 'Become a man rooted in Scripture, devoted to Christ, intentional with his family and surrounded by brothers who sharpen him.',
  philosophy: ['Conviction without condemnation.', 'Discipline without legalism.'],
  grace: 'We are not earning salvation through spiritual accomplishments. We grow in discipleship because of God’s grace.',
  org: 'Zeeland Fabrication',
  siteUrl: 'https://forged52.pages.dev',
  logo: 'assets/logo.webp',
  icon: 'assets/icon.png',
  leaderTitle: 'Point Man',
};

// Programs: FORGED52 is the flagship. Future programs plug in with the same shape.
export const PROGRAMS = [
  { id: 'forged52', name: 'FORGED52', subtitle: 'Bible-in-a-year discipleship', weeks: 52, plans: ['topical', 'chrono'], curriculum: 'data/curriculum.json', flagship: true },
];

export const FLAGS = {
  // Curriculum and study content were drafted for this app and have not yet been reviewed by a pastor.
  // While false, every devotional, article and guide is labeled as a draft for review.
  contentReviewed: false,
  // Tyndale's public NLT API ends January 1, 2027. After that the reader falls back to the bundled WEB.
  nltEnabled: Date.now() < Date.parse('2027-01-01T00:00:00Z'),
  aiAssistant: false, // future: see README "AI study assistant" (server-side only, never client keys)
};

export const SUPABASE = {
  url: 'https://tfqirxldqhlylhcmbovq.supabase.co',
  // Public anon key: safe in the browser. Access is enforced by row-level security on the server.
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmcWlyeGxkcWhseWxoY21ib3ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU4MzcyODEsImV4cCI6MjExMTQxMzI4MX0.cYtIa2Qv3gy1KRf_NGY5K962T_zabI5xheNVUeQ5rA0',
};
export const VAPID_PUBLIC = 'BGuzpTkorxKPCsEqmY2NrRVR_O8D71apDDz2drohd_ZoPORh-UZR8dWUiS7xVA-dhDNhboSj5xOhgfSFJjWP06g';

export const PHASES = [
  { n: 1, name: 'The Foundation', weeks: [1, 4], theme: 'Identity in Christ, salvation, grace, surrender and faith' },
  { n: 2, name: 'The Refining', weeks: [5, 8], theme: 'Sin, temptation, repentance, obedience and character' },
  { n: 3, name: 'The Discipline', weeks: [9, 12], theme: 'Prayer, Scripture, fasting and spiritual habits' },
  { n: 4, name: 'The Husband', weeks: [13, 16], theme: 'Marriage, sacrificial love, faithfulness, communication and serving your spouse' },
  { n: 5, name: 'The Father', weeks: [17, 20], theme: 'Biblical parenting, patience, presence, instruction and generational legacy' },
  { n: 6, name: 'The Steward', weeks: [21, 24], theme: 'Finances, generosity, work, responsibility and stewardship' },
  { n: 7, name: 'The Warrior', weeks: [25, 28], theme: 'Spiritual warfare, courage, perseverance and resisting temptation' },
  { n: 8, name: 'The Servant', weeks: [29, 32], theme: 'Humility, forgiveness, compassion and serving others' },
  { n: 9, name: 'The Brother', weeks: [33, 36], theme: 'Christian friendship, accountability, encouragement and community' },
  { n: 10, name: 'The Leader', weeks: [37, 40], theme: 'Wisdom, integrity, biblical leadership and responsibility' },
  { n: 11, name: 'The Witness', weeks: [41, 44], theme: 'Sharing the gospel, testimony, evangelism and living out your faith' },
  { n: 12, name: 'The Legacy', weeks: [45, 52], theme: 'Purpose, perseverance, discipleship, eternity and generational impact' },
];
export const phaseOf = (w) => PHASES.find((p) => w >= p.weeks[0] && w <= p.weeks[1]) || PHASES[0];

export const FOCUS_AREAS = ['Marriage', 'Fatherhood', 'Prayer', 'Biblical understanding', 'Leadership', 'Financial stewardship', 'Business and work', 'Spiritual discipline', 'Overcoming temptation', 'Brotherhood'];

export const THEMES = [
  { id: 'iron', name: 'Iron & Bronze', note: 'Signature' },
  { id: 'bone', name: 'Bone', note: 'Light' },
  { id: 'venom', name: 'Venom', note: 'Green' },
  { id: 'contrast', name: 'High contrast', note: 'Accessible' },
];

export const NOTIFY_CATEGORIES = [
  { id: 'reading', name: 'Daily reading' },
  { id: 'memory', name: 'Weekly memory verse' },
  { id: 'prayer', name: 'Prayer reminder' },
  { id: 'mission', name: 'Weekly mission' },
  { id: 'encourage', name: 'Brotherhood encouragement' },
  { id: 'meeting', name: 'Crew meeting reminders' },
  { id: 'discussion', name: 'New crew discussion' },
  { id: 'prayers', name: 'Shared prayer requests' },
];
