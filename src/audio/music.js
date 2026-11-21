import { createGenerative } from './generative.js';
import { urlFor } from './library.js';

// Two-deck player → mix → slowed+reverb (dry/wet) → room filter (Sanctuary) → analyser → music bus.
function impulse(ctx, seconds) {
  const len = ctx.sampleRate * seconds, b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return b;
}

const SLOW_RATE = 0.82;

export function createMusic(audio, resolveQueue) {
  const { ctx, bus } = audio;
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const mix = gain(1), dry = gain(1), wet = gain(0), conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, 3.2);
  const room = ctx.createBiquadFilter(); room.type = 'lowpass'; room.frequency.value = 20000;
  const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.7;
  analyser.minDecibels = -85; analyser.maxDecibels = -12; // headroom so loud masters don't pin every bar at max
  mix.connect(dry); mix.connect(conv); conv.connect(wet);
  dry.connect(room); wet.connect(room); room.connect(analyser); analyser.connect(bus.music);

  const decks = [0, 1].map(() => {
    const el = new Audio();
    el.preload = 'auto';
    el.preservesPitch = false; // slowed = lower pitch too, like real slowed edits
    const g = gain(0);
    ctx.createMediaElementSource(el).connect(g);
    g.connect(mix);
    return { el, g };
  });
  const gen = createGenerative(ctx, mix);

  const listeners = {};
  const emit = (ev, data) => listeners[ev]?.forEach((fn) => fn(data));

  const m = {
    source: null, queue: [], index: -1, deck: 0, current: null,
    shuffle: false, repeat: 'all', crossfade: 3, slowed: false,
    playing: false, xfading: false, errors: 0,
    freq: new Uint8Array(analyser.frequencyBinCount), pulse: 0, bassAvg: 0,
    on(ev, fn) { (listeners[ev] ??= []).push(fn); },
    get generative() { return gen.running; },

    setSource(id, { announce = true, startId } = {}) {
      m.source = id;
      m.errors = 0;
      if (id === 'ambience') return m.startGenerative();
      m.queue = resolveQueue(id);
      if (!m.queue.length) { emit('empty', id); return m.setSource('ambience', { announce }); }
      const want = startId ? m.queue.findIndex((t) => t.id === startId) : -1;
      m.index = want >= 0 ? want : m.shuffle ? Math.floor(Math.random() * m.queue.length) : 0;
      m.playTrack(m.queue[m.index], true, announce);
    },

    startGenerative() {
      m.source = 'ambience';
      m.fadeDecks(2);
      gen.start();
      m.playing = true;
      m.current = { title: 'City Ambience', artist: 'Generated live', generative: true };
      emit('track', m.current);
    },

    fadeDecks(sec) {
      const t = ctx.currentTime;
      for (const d of decks) { d.g.gain.cancelScheduledValues(t); d.g.gain.setTargetAtTime(0, t, sec / 4); }
      setTimeout(() => decks.forEach((d) => d.el.pause()), sec * 1000);
    },

    async playTrack(track, fade = true, announce = true) {
      if (gen.running) gen.stop();
      const prev = decks[m.deck], next = decks[1 - m.deck];
      next.el.src = urlFor(track);
      next.el.playbackRate = m.slowed ? SLOW_RATE : 1;
      next.el.onerror = () => m.onError(track);
      next.el.ontimeupdate = () => m.checkFade(next);
      next.el.onended = () => { if (decks[m.deck] === next && !m.xfading) m.next(false); };
      try { await next.el.play(); } catch (err) { if (err.name !== 'AbortError') m.onError(track); return; }
      const t = ctx.currentTime, f = fade && m.playing ? Math.max(0.05, m.crossfade) : 0.05;
      next.g.gain.cancelScheduledValues(t); next.g.gain.setValueAtTime(0, t); next.g.gain.linearRampToValueAtTime(1, t + f);
      prev.g.gain.cancelScheduledValues(t); prev.g.gain.setValueAtTime(prev.g.gain.value, t); prev.g.gain.linearRampToValueAtTime(0, t + f);
      setTimeout(() => { if (decks[m.deck] !== prev) prev.el.pause(); }, f * 1000 + 150);
      m.deck = 1 - m.deck;
      m.current = track; m.playing = true; m.xfading = false; m.errors = 0;
      emit('track', { ...track, announce });
    },

    checkFade(d) {
      if (decks[m.deck] !== d || m.xfading || !m.crossfade || !isFinite(d.el.duration)) return;
      const remaining = (d.el.duration - d.el.currentTime) / d.el.playbackRate; // real seconds left
      if (remaining <= m.crossfade) { m.xfading = true; m.next(true); }
    },

    onError(track) {
      emit('error', track);
      if (++m.errors >= Math.max(3, m.queue.length)) { m.errors = 0; return m.setSource('ambience'); } // nothing in this queue plays
      setTimeout(() => m.next(false), 800);
    },

    next(fade = true) {
      if (m.source === 'ambience' || !m.queue.length) return;
      if (m.repeat !== 'one') {
        if (m.shuffle && m.queue.length > 1) { let i; do i = Math.floor(Math.random() * m.queue.length); while (i === m.index); m.index = i; }
        else if (m.index + 1 < m.queue.length) m.index++;
        else if (m.repeat === 'all') m.index = 0;
        else { m.fadeDecks(m.crossfade || 1); m.playing = false; emit('state'); return; }
      }
      m.playTrack(m.queue[m.index], fade);
    },

    prev() {
      if (m.source === 'ambience' || !m.queue.length) return;
      const d = decks[m.deck].el;
      if (d.currentTime > 4) { d.currentTime = 0; return; }
      m.index = (m.index - 1 + m.queue.length) % m.queue.length;
      m.playTrack(m.queue[m.index], false);
    },

    playIndex(i) { m.index = i; m.playTrack(m.queue[i], true); },

    togglePlay() {
      if (m.source === 'ambience') { gen.running ? gen.stop() : gen.start(); m.playing = gen.running; }
      else if (!m.current) m.setSource(m.source ?? 'ambience');
      else { const el = decks[m.deck].el; if (el.paused) { el.play(); m.playing = true; } else { el.pause(); m.playing = false; } }
      emit('state');
    },

    setSlowed(on) {
      m.slowed = on;
      decks.forEach((d) => (d.el.playbackRate = on ? SLOW_RATE : 1));
      const t = ctx.currentTime;
      wet.gain.setTargetAtTime(on ? 0.45 : 0, t, 0.3);
      dry.gain.setTargetAtTime(on ? 0.8 : 1, t, 0.3);
    },

    // Sanctuary View (Phase 5): music sounds like it's playing in the room.
    setRoom(on) { room.frequency.setTargetAtTime(on ? 1600 : 20000, ctx.currentTime, 0.6); },

    // Radio static sweep for DJ interstitials.
    staticSweep() {
      const t = ctx.currentTime, len = ctx.sampleRate * 1.3, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(4000, t + 0.6); bp.frequency.exponentialRampToValueAtTime(900, t + 1.2);
      const g = gain(0); g.gain.linearRampToValueAtTime(0.12, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 1.25);
      s.connect(bp).connect(g).connect(room);
      s.start(t);
    },

    // Bass envelope → 0..1 pulse that the city's neon and holograms throb to.
    update(dt) {
      gen.update(dt);
      analyser.getByteFrequencyData(m.freq);
      const bass = (m.freq[1] + m.freq[2] + m.freq[3]) / 765;
      m.bassAvg += (bass - m.bassAvg) * Math.min(1, dt * 1.5);
      const hit = Math.min(1, Math.max(0, (bass - m.bassAvg * 0.95) * 6) + bass * 0.08); // kicks above the running average
      m.pulse = hit > m.pulse ? hit : Math.max(0, m.pulse - dt * 3);
    },
  };

  // Keyboard media keys / OS media controls.
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => !m.playing && m.togglePlay());
    ms.setActionHandler('pause', () => m.playing && m.togglePlay());
    ms.setActionHandler('nexttrack', () => m.next(true));
    ms.setActionHandler('previoustrack', () => m.prev());
    m.on('track', (t) => { ms.metadata = new MediaMetadata({ title: t.title || t.name, artist: t.artist || '', album: 'NEON DRIFT' }); });
  }
  return m;
}
