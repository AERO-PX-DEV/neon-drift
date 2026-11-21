// Everything the game remembers lives in localStorage under `nd.*` keys (each system saves as it changes,
// so it's always autosaved). Export bundles those keys into one JSON file; import writes them back.
// Music files stay in IndexedDB and are not part of the file (they can be hundreds of MB).
const PREFIX = 'nd.';
const KEY_OK = /^nd\.[\w.-]{1,64}$/;

export const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
export const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: lasts this session */ } };

export function snapshot() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) data[k] = JSON.parse(localStorage.getItem(k));
    }
  } catch { /* storage blocked or a value isn't JSON: export what we could read */ }
  return { app: 'neon-drift', version: 1, savedAt: new Date().toISOString(), data };
}

// Validates a parsed save file; returns the [key, value] pairs to write, or throws with a readable reason.
export function readSave(obj) {
  if (!obj || obj.app !== 'neon-drift' || typeof obj.data !== 'object' || !obj.data) throw new Error('Not a NEON DRIFT save file.');
  const entries = Object.entries(obj.data).filter(([k]) => KEY_OK.test(k));
  if (!entries.length) throw new Error('The save file is empty.');
  return entries;
}

export function exportSave() {
  const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `neon-drift-save-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Replaces all nd.* keys with the file's. Returns a promise; the caller reloads on success.
export async function importSave(file) {
  const entries = readSave(JSON.parse(await file.text()));
  for (const k of Object.keys(snapshot().data)) localStorage.removeItem(k);
  for (const [k, v] of entries) store(k, v);
  return entries.length;
}

export function resetAll() {
  for (const k of Object.keys(snapshot().data)) localStorage.removeItem(k);
}
