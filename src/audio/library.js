import { parseFileName, guessStation } from './playlist.js';

// Your music library: files dropped/picked in-game live in IndexedDB (survive reloads);
// files in the project's /music folder are found at build time. Metadata edits for both are stored in IDB.
const bundled = import.meta.glob('/music/**/*.{mp3,ogg,wav,m4a,flac,MP3,OGG,WAV,M4A,FLAC}', { eager: true, query: '?url', import: 'default' });
export const AUDIO_RE = /\.(mp3|ogg|wav|m4a|flac)$/i;

const DB = 'neon-drift', STORE = 'tracks';
let dbPromise = null;
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function db() {
  dbPromise ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise;
}
const store = async (mode) => (await db()).transaction(STORE, mode).objectStore(STORE);

const urls = new Map();
export function urlFor(t) {
  if (t.url) return t.url;
  if (!urls.has(t.id)) urls.set(t.id, URL.createObjectURL(t.blob));
  return urls.get(t.id);
}

function describe(name) {
  const { artist, title } = parseFileName(name);
  return { name, artist, title, station: guessStation(name) };
}

let tracks = [];
let persistent = true; // false if IndexedDB is unavailable (e.g. private window): library is then session-only

export async function loadLibrary() {
  let saved = [];
  try { saved = await req((await store('readonly')).getAll()); }
  catch (err) { persistent = false; console.warn('IndexedDB unavailable; library will not persist', err); }
  const edits = new Map(saved.filter((r) => !r.blob).map((r) => [r.id, r]));
  const fromFolder = Object.entries(bundled).map(([path, url]) => {
    const id = `b:${path}`;
    return { ...describe(path), id, url, bundled: true, ...edits.get(id) };
  });
  tracks = [...fromFolder, ...saved.filter((r) => r.blob)];
  return tracks;
}

export const getTracks = () => tracks;
export const isPersistent = () => persistent;

// Recursively collect audio files from a drop (supports dropped folders).
export async function filesFromDrop(dt) {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dt.files];
  const out = [];
  const walk = async (e) => {
    if (e.isFile) out.push(await new Promise((res, rej) => e.file(res, rej)));
    else if (e.isDirectory) {
      const reader = e.createReader();
      for (let batch; (batch = await new Promise((res, rej) => reader.readEntries(res, rej))).length;) for (const c of batch) await walk(c);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

export async function addFiles(files) {
  const added = [];
  for (const f of files) {
    if (!AUDIO_RE.test(f.name) && !f.type.startsWith('audio/')) continue;
    if (tracks.some((t) => t.name === f.name && t.size === f.size)) continue; // already in library
    const t = { id: `u:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, ...describe(f.name), size: f.size, blob: f };
    if (persistent) {
      try { await req((await store('readwrite')).put(t)); } catch (err) { persistent = false; console.warn('Could not store file', err); }
    }
    tracks.push(t);
    added.push(t);
  }
  return added;
}

export async function updateTrack(id, patch) {
  const t = tracks.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  if (!persistent) return;
  const rec = t.bundled ? { id, title: t.title, artist: t.artist, station: t.station } : t; // bundled: store the edit only
  try { await req((await store('readwrite')).put(rec)); } catch (err) { console.warn('Could not save edit', err); }
}

export async function removeTrack(id) {
  tracks = tracks.filter((t) => t.id !== id);
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  if (persistent) try { await req((await store('readwrite')).delete(id)); } catch { /* already gone */ }
}
