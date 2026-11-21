// Playlist + station metadata and the fuzzy file → track linking. Pure (no DOM), so it's unit-tested.

export const PLAYLIST_ID = 'memory';
export const PLAYLIST_NAME = 'Memory Reboot';

// The game ships metadata only; you supply the audio files.
export const CORE = [
  { title: 'Memory Reboot', variant: 'Over Slowed', artist: 'VØJ x Narvent' },
  { title: 'Interlinked', variant: 'Slowed', artist: 'Lonely Lies, GOLDKID$' },
  { title: 'Intermission', artist: 'Navjaxx, GOLDKID$' },
  { title: 'Fainted', artist: 'Narvent' },
  { title: 'Embrace', artist: '' },
  { title: 'Cybernauts', artist: 'Navjaxx' },
  { title: 'Distant Echoes', artist: 'VXLLAIN, VØJ, Narvent' },
  { title: 'Encrypted Memory', variant: 'Over Slowed', artist: '' },
];

// keywords: single words that also place a file on the station.
export const STATIONS = [
  { id: 'overslowed', name: 'Over-Slowed Rain', genre: 'slowed wave', artists: ['VØJ', 'Narvent', 'GOLDKID$', 'Navjaxx', 'VXLLAIN', 'Lonely Lies', 'Skeler', 'Sidewalks and Skeletons'], keywords: ['slowed'] },
  { id: 'nocturne', name: 'Cyber Nocturne', genre: 'dark synth', artists: ['Lorn', 'Gesaffelstein', 'Mareux', 'Perturbator'], keywords: ['darksynth'] },
  { id: 'skyline', name: 'Cozy Skyline', genre: 'dreamy synthwave', artists: ['HOME', 'Kalax', 'Vacant', 'Kaito Shoma'], keywords: ['synthwave', 'chillwave'] },
  { id: 'offworld', name: 'Off-World Static', genre: 'ambient score', artists: ['Vangelis-style ambience', '2049-score-style ambience'], keywords: ['vangelis', '2049', 'ambient', 'soundtrack', 'ost', 'score'] },
  { id: 'ambience', name: 'City Ambience', genre: 'generative', artists: ['Generated live: slow pads, deep sub bass, vinyl crackle, rain'], generative: true },
];
export const DEFAULT_STATION = 'skyline';

export function normalize(s = '') {
  return s.toLowerCase()
    .replace(/\.(mp3|ogg|wav|m4a|flac)$/, '')
    .replace(/[øØ]/g, 'o').replace(/\$/g, 's')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOP = new Set(['x', 'ft', 'feat', 'and', 'the', 'official', 'audio', 'video', 'lyrics', 'lyric', 'hq', 'music', 'mv']);
const words = (s) => normalize(s).split(' ').filter((w) => w && !STOP.has(w));

// 0 = no match. Every title word must be present; artist + variant words break ties.
export function matchScore(entry, text) {
  const have = new Set(words(text));
  const cover = (list) => (list.length ? list.filter((w) => have.has(w)).length / list.length : 0);
  if (cover(words(entry.title)) < 1) return 0;
  return 0.7 + 0.2 * cover(words(entry.artist)) + 0.1 * cover(words(entry.variant));
}

const trackText = (t) => `${t.artist ?? ''} ${t.title ?? ''} ${t.name ?? ''}`;

// → { entryIndex: trackId }. Explicit links win; then best-scoring pairs, each file used once.
export function linkPlaylist(entries, tracks, explicit = {}) {
  const ids = new Set(tracks.map((t) => t.id));
  const links = {};
  for (const [i, id] of Object.entries(explicit)) if (ids.has(id)) links[i] = id;
  const used = new Set(Object.values(links));
  const pairs = [];
  entries.forEach((e, i) => {
    if (i in links) return;
    for (const t of tracks) {
      if (used.has(t.id)) continue;
      const s = matchScore(e, trackText(t));
      if (s) pairs.push([s, i, t.id]);
    }
  });
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [, i, id] of pairs) if (!(i in links) && !used.has(id)) { links[i] = id; used.add(id); }
  return links;
}

export function parseFileName(name) {
  const base = name.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  const at = base.indexOf(' - ');
  return at > 0 ? { artist: base.slice(0, at).trim(), title: base.slice(at + 3).trim() } : { artist: '', title: base.trim() };
}

export function guessStation(text) {
  const have = new Set(words(text));
  const byArtist = STATIONS.find((s) => !s.generative && s.artists.some((a) => { const w = words(a); return w.length && w.every((x) => have.has(x)); }));
  if (byArtist) return byArtist.id;
  const byKeyword = STATIONS.find((s) => s.keywords?.some((k) => have.has(k)));
  return byKeyword ? byKeyword.id : DEFAULT_STATION;
}
