import { CORE, STATIONS, PLAYLIST_ID, PLAYLIST_NAME, linkPlaylist } from '../audio/playlist.js';
import { getTracks, addFiles, updateTrack, removeTrack, filesFromDrop, isPersistent } from '../audio/library.js';

const SOURCES = [{ id: PLAYLIST_ID, name: PLAYLIST_NAME, genre: 'core playlist', artists: [] }, ...STATIONS];
const sourceName = (id) => SOURCES.find((s) => s.id === id)?.name ?? '';

// Small persistence helpers (Phase 6 folds these into the full save system).
const load = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k)) }; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const DJ_LINES = [
  (c) => `You're listening to ${c.station}. It's ${c.clock} and the rain isn't stopping.`,
  (c) => `${c.station}, broadcasting from somewhere above ${c.district}. Stay dry up there.`,
  (c) => `${c.weather} over the city tonight. Wipers on, windows cracked, volume up.`,
  (c) => `${c.clock}. Nobody's asleep in the Stacks. This next one's for the night drivers.`,
  (c) => `Here's ${c.title}. ${c.station}, still on the air at ${c.clock}.`,
  (c) => `The sea wall's humming again. ${c.station} keeps you company till the haze comes in.`,
];

export function createRadio({ audio, music, getInfo, car }) {
  const prefs = load('nd.music', { source: PLAYLIST_ID, shuffle: false, repeat: 'all', crossfade: 3, slowed: false, vol: { master: 0.8, music: 0.8, ambience: 0.8, engine: 0.8, sfx: 0.8 } });
  const playlist = load('nd.playlist', { meta: {}, links: {} }); // per-entry edits + explicit file links
  const entries = () => CORE.map((e, i) => ({ ...e, ...playlist.meta[i] }));
  const links = () => linkPlaylist(entries(), getTracks(), playlist.links);
  const savePrefs = () => save('nd.music', { source: music.source, shuffle: music.shuffle, repeat: music.repeat, crossfade: music.crossfade, slowed: music.slowed, vol: prefs.vol });

  // ---------- DOM
  document.body.insertAdjacentHTML('beforeend', `
    <div id="deck">
      <canvas width="240" height="26"></canvas>
      <div class="st"></div><div class="ti"></div><div class="ar"></div>
      <div class="btns"><button data-a="prev" title="Previous">⏮</button><button data-a="play" title="Play/Pause">⏯</button><button data-a="next" title="Next (N)">⏭</button><button data-a="open" title="Radio (R)">☰</button></div>
    </div>
    <div id="player" class="hidden">
      <div class="col sources"><h3>SOURCES</h3><ul></ul></div>
      <div class="col now">
        <canvas class="viz" width="640" height="200"></canvas>
        <div class="np-st"></div><div class="np-ti"></div><div class="np-ar"></div>
        <div class="ctrl">
          <button data-a="prev">⏮</button><button data-a="play" class="big">⏯</button><button data-a="next">⏭</button>
          <button data-a="shuffle">SHUFFLE</button><button data-a="repeat">REPEAT</button><button data-a="slowed">SLOWED + REVERB</button>
        </div>
        <label>Crossfade <input type="range" data-p="crossfade" min="0" max="10" step="0.5"><span class="xf"></span></label>
        <h3>MIXER</h3>
        ${['master', 'music', 'ambience', 'engine', 'sfx'].map((k) => `<label>${k[0].toUpperCase() + k.slice(1)} <input type="range" data-v="${k}" min="0" max="1" step="0.01"></label>`).join('')}
        <p class="note"></p>
        <button data-a="close" class="act">Close (R)</button>
      </div>
      <div class="col list">
        <h3 class="lt"></h3><div class="hint"></div><ul class="tracks"></ul>
        <div class="lib">
          <button data-a="addfiles" class="act">+ Add files</button><button data-a="addfolder" class="act">+ Add folder</button>
          <input type="file" class="f-files" accept="audio/*,.flac,.m4a" multiple hidden>
          <input type="file" class="f-folder" webkitdirectory multiple hidden>
        </div>
      </div>
    </div>
    <div id="dj"><div class="call"></div><div class="msg"></div></div>
    <div id="dropzone"><div>Drop music to add it to your library</div></div>`);
  const $ = (s) => document.querySelector(s);
  const deck = $('#deck'), player = $('#player'), dj = $('#dj'), drop = $('#dropzone');
  let selected = prefs.source;

  // ---------- rendering
  function renderSources() {
    player.querySelector('.sources ul').innerHTML = SOURCES.map((s) => `
      <li class="${s.id === selected ? 'sel' : ''} ${s.id === music.source ? 'on' : ''}" data-src="${s.id}">
        <div class="sn">${esc(s.name)}</div><div class="sg">${esc(s.genre)}</div>
        ${s.artists.length ? `<div class="sa">Listen for: ${esc(s.artists.join(', '))}</div>` : ''}
        <button data-tune="${s.id}" class="act">${s.id === music.source ? 'ON AIR' : 'Tune in'}</button>
      </li>`).join('');
  }

  const stationSelect = (id, value) => `<select data-station="${id}">${STATIONS.filter((s) => !s.generative).map((s) => `<option value="${s.id}" ${s.id === value ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;

  function renderList() {
    const lt = player.querySelector('.lt'), hint = player.querySelector('.hint'), ul = player.querySelector('.tracks');
    lt.textContent = sourceName(selected).toUpperCase();
    const curId = music.current?.id;
    if (selected === PLAYLIST_ID) {
      const L = links(), tracks = getTracks();
      hint.textContent = 'Files are linked automatically by name. Drop a file on a row to link it by hand. Click a title or artist to edit.';
      ul.innerHTML = entries().map((e, i) => {
        const t = tracks.find((x) => x.id === L[i]);
        return `<li class="row ${t ? 'linked' : 'unlinked'} ${t && t.id === curId ? 'playing' : ''}" data-entry="${i}">
          <span class="n">${i + 1}</span>
          <input class="ed" data-meta="title" data-entry="${i}" value="${esc(e.title)}${e.variant ? ` (${esc(e.variant)})` : ''}">
          <input class="ed ar" data-meta="artist" data-entry="${i}" value="${esc(e.artist)}" placeholder="artist (editable)">
          ${t ? `<span class="file" title="${esc(t.name)}">${esc(t.name.split('/').pop())}</span><button data-playentry="${i}">▶</button>` : '<span class="drop">drop file to link</span>'}
        </li>`;
      }).join('');
    } else if (selected === 'ambience') {
      hint.textContent = '';
      ul.innerHTML = '<li class="row"><span>Generated live in your browser: slow pads, deep sub bass, pentatonic plucks, vinyl crackle and rain. Always on the air, no files needed.</span></li>';
    } else {
      const list = getTracks().filter((t) => t.station === selected);
      const st = STATIONS.find((s) => s.id === selected);
      hint.textContent = list.length ? '' : `No files yet. Drop tracks by ${st.artists.join(', ')}. They're sorted onto this station by artist name, and you can move any track with its station picker.`;
      ul.innerHTML = list.map((t) => `<li class="row ${t.id === curId ? 'playing' : ''}">
        <input class="ed" data-track="${t.id}" data-field="title" value="${esc(t.title)}">
        <input class="ed ar" data-track="${t.id}" data-field="artist" value="${esc(t.artist)}" placeholder="artist">
        ${stationSelect(t.id, t.station)}
        <button data-playtrack="${t.id}">▶</button>${t.bundled ? '' : `<button data-del="${t.id}" title="Remove from library">✕</button>`}
      </li>`).join('');
    }
  }

  function renderNow() {
    const t = music.current ?? {};
    const st = sourceName(music.source);
    deck.querySelector('.st').textContent = st;
    deck.querySelector('.ti').textContent = t.title || t.name || '—';
    deck.querySelector('.ar').textContent = t.artist || '';
    player.querySelector('.np-st').textContent = st;
    player.querySelector('.np-ti').textContent = t.title || t.name || '—';
    player.querySelector('.np-ar').textContent = t.artist || '';
    for (const [a, on] of [['shuffle', music.shuffle], ['slowed', music.slowed], ['repeat', music.repeat !== 'off']]) {
      player.querySelector(`[data-a="${a}"]`).classList.toggle('on', on);
    }
    player.querySelector('[data-a="repeat"]').textContent = `REPEAT ${music.repeat.toUpperCase()}`;
    player.querySelector('.xf').textContent = `${music.crossfade}s`;
    player.querySelector('[data-p="crossfade"]').value = music.crossfade;
    player.querySelector('.note').textContent = isPersistent() ? '' : 'Storage is blocked in this window, so dropped files last until you reload.';
  }
  const renderAll = () => { renderSources(); renderList(); renderNow(); };

  // ---------- DJ interstitials
  let djT = 0, lastTitle = '';
  function interstitial(text) {
    dj.querySelector('.call').textContent = `${sourceName(music.source).toUpperCase()} · 104.9`;
    dj.querySelector('.msg').textContent = text;
    dj.classList.add('show');
    djT = 6;
    music.staticSweep();
  }
  music.on('track', (t) => {
    renderAll();
    car.nowPlaying = t.title || t.name || '';
    if (t.announce !== false && Math.random() < 0.4) {
      const info = getInfo();
      interstitial(DJ_LINES[Math.floor(Math.random() * DJ_LINES.length)]({ ...info, station: sourceName(music.source), title: t.title || 'this one', prev: lastTitle }));
    }
    lastTitle = t.title;
  });
  music.on('state', renderNow);
  music.on('empty', (id) => interstitial(`No signal on ${sourceName(id)} yet. Drop some files in and it'll come alive. Switching to City Ambience.`));
  music.on('error', (t) => interstitial(`Signal lost on "${t.title || t.name}". Skipping ahead.`));

  // ---------- actions
  async function ingest(files) {
    const added = await addFiles(files);
    if (added.length) interstitial(`${added.length} new track${added.length > 1 ? 's' : ''} in the library.`);
    renderAll();
    return added;
  }
  function playOn(src, trackId) {
    if (music.source !== src) { music.setSource(src, { announce: false, startId: trackId }); return savePrefs(); }
    const i = music.queue.findIndex((t) => t.id === trackId);
    if (i >= 0) music.playIndex(i);
  }
  function act(a) {
    if (a === 'play') music.togglePlay();
    else if (a === 'next') music.next(true);
    else if (a === 'prev') music.prev();
    else if (a === 'open' || a === 'close') api.toggle();
    else if (a === 'shuffle') music.shuffle = !music.shuffle;
    else if (a === 'repeat') music.repeat = { all: 'one', one: 'off', off: 'all' }[music.repeat];
    else if (a === 'slowed') music.setSlowed(!music.slowed);
    else if (a === 'addfiles') player.querySelector('.f-files').click();
    else if (a === 'addfolder') player.querySelector('.f-folder').click();
    renderNow(); savePrefs();
  }
  deck.addEventListener('click', (e) => { const a = e.target.dataset.a; if (a) act(a); });
  player.addEventListener('click', (e) => {
    const d = e.target.dataset;
    if (d.a) return act(d.a);
    if (d.tune) { selected = d.tune; music.setSource(d.tune); savePrefs(); return renderAll(); }
    const li = e.target.closest('[data-src]');
    if (li) { selected = li.dataset.src; return renderAll(); }
    if (d.playentry) playOn(PLAYLIST_ID, links()[d.playentry]);
    if (d.playtrack) playOn(selected, d.playtrack);
    if (d.del) removeTrack(d.del).then(renderAll);
  });
  player.addEventListener('change', (e) => {
    const d = e.target.dataset;
    if (d.meta) {
      const m = (playlist.meta[d.entry] ??= {});
      if (d.meta === 'title') { m.title = e.target.value.replace(/\s*\(.*\)\s*$/, ''); m.variant = (e.target.value.match(/\((.*)\)\s*$/) || [])[1] ?? ''; }
      else m.artist = e.target.value;
      save('nd.playlist', playlist); renderList();
    }
    if (d.track) updateTrack(d.track, { [d.field]: e.target.value }).then(renderList);
    if (d.station) updateTrack(d.station, { station: e.target.value }).then(renderList);
    if (d.v) { prefs.vol[d.v] = +e.target.value; applyVolumes(); savePrefs(); }
    if (d.p === 'crossfade') { music.crossfade = +e.target.value; renderNow(); savePrefs(); }
  });
  player.addEventListener('input', (e) => { if (e.target.dataset.v) { prefs.vol[e.target.dataset.v] = +e.target.value; applyVolumes(); } });
  for (const sel of ['.f-files', '.f-folder']) player.querySelector(sel).addEventListener('change', (e) => { ingest([...e.target.files]); e.target.value = ''; });

  // Drag & drop anywhere; dropping on an unlinked playlist row links that file to it.
  let dragDepth = 0;
  addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; drop.classList.add('show'); } });
  addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.classList.remove('show'); } });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0; drop.classList.remove('show');
    const row = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest?.('[data-entry]')).find(Boolean);
    const files = await filesFromDrop(e.dataTransfer);
    const added = await ingest(files);
    if (row && added[0]) { playlist.links[row.dataset.entry] = added[0].id; save('nd.playlist', playlist); renderList(); }
  });

  function applyVolumes() {
    const t = audio.ctx.currentTime;
    audio.master.gain.setTargetAtTime(prefs.vol.master, t, 0.05);
    for (const k of ['music', 'ambience', 'engine', 'sfx']) audio.bus[k].gain.setTargetAtTime(prefs.vol[k], t, 0.05);
  }

  // ---------- visualizers
  const vizBig = player.querySelector('.viz'), vb = vizBig.getContext('2d');
  const vizSmall = deck.querySelector('canvas'), vs = vizSmall.getContext('2d');
  function bars(g, w, h, n, mirror) {
    g.clearRect(0, 0, w, h);
    const f = music.freq, bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = f[Math.floor(2 + (i / n) ** 1.6 * 300)] / 255; // log-ish spread across the spectrum
      const bh = Math.max(1, v * h * (mirror ? 0.5 : 1));
      g.fillStyle = `hsl(${190 - v * 30 + (i / n) * 10}, 100%, ${45 + v * 25}%)`;
      if (mirror) { g.fillRect(i * bw + 1, h / 2 - bh, bw - 2, bh * 2); }
      else g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    }
    if (music.pulse > 0.4) { g.fillStyle = `rgba(255,60,50,${(music.pulse - 0.4) * 0.25})`; g.fillRect(0, 0, w, h); }
  }

  // ---------- init
  music.shuffle = prefs.shuffle; music.repeat = prefs.repeat; music.crossfade = prefs.crossfade;
  music.setSlowed(prefs.slowed);
  for (const k of Object.keys(prefs.vol)) player.querySelector(`[data-v="${k}"]`).value = prefs.vol[k];
  applyVolumes();

  const api = {
    get open() { return !player.classList.contains('hidden'); },
    toggle() { player.classList.toggle('hidden'); if (api.open) { selected = music.source ?? selected; renderAll(); } },
    resolveQueue(id) {
      if (id !== PLAYLIST_ID) return getTracks().filter((t) => t.station === id);
      const L = links(), tracks = getTracks();
      return entries().flatMap((e, i) => { // playlist order, shown with the playlist's (editable) metadata
        const t = tracks.find((x) => x.id === L[i]);
        return t ? [{ ...t, title: e.variant ? `${e.title} (${e.variant})` : e.title, artist: e.artist || t.artist }] : [];
      });
    },
    start() { music.setSource(prefs.source, { announce: false }); renderAll(); },
    update(dt) {
      if (djT > 0 && (djT -= dt) <= 0) dj.classList.remove('show');
      bars(vs, vizSmall.width, vizSmall.height, 40, false);
      if (api.open) bars(vb, vizBig.width, vizBig.height, 64, true);
    },
  };
  return api;
}
