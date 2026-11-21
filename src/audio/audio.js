// Fully synthesized soundscape. Buses: music / ambience / engine / sfx → master.
function noiseBuffer(ctx, brown) {
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;
  }
  return buf;
}

export function createAudio() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  const bus = {};
  for (const k of ['music', 'ambience', 'engine', 'sfx']) { bus[k] = ctx.createGain(); bus[k].connect(master); }

  const white = noiseBuffer(ctx, false), brown = noiseBuffer(ctx, true);
  const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
  const filter = (type, freq, Q = 0.7) => {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f;
  };
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  // Rain bed: bright hiss + body, through a "cabin" lowpass that closes when you're inside.
  const cabin = filter('lowpass', 12000);
  cabin.connect(bus.ambience);
  const rainSrc = loop(white);
  const rainHi = gain(0), rainBody = gain(0);
  chain(rainSrc, filter('highpass', 1500), rainHi, cabin);
  chain(rainSrc, filter('bandpass', 600), rainBody, cabin);

  // Distant city hum.
  const hum = gain(0.22);
  chain(loop(brown), filter('lowpass', 180), hum, bus.ambience);
  for (const f of [49, 49.6, 98.3]) {
    const o = ctx.createOscillator(); o.frequency.value = f; o.start();
    chain(o, gain(0.012), hum);
  }

  // Engine: detuned saw + sine sub, tone follows speed.
  const engLp = filter('lowpass', 300, 2), engGain = gain(0.05);
  const eng1 = ctx.createOscillator(), eng2 = ctx.createOscillator();
  eng1.type = 'sawtooth'; eng2.type = 'sine';
  eng1.start(); eng2.start();
  eng1.connect(engLp); chain(eng2, gain(0.6), engLp);
  chain(engLp, engGain, bus.engine);

  // Market crowd murmur: band-limited noise with a slow random swell; louder low over the market.
  const crowd = gain(0), crowdAm = gain(0.6);
  chain(loop(white), filter('bandpass', 520, 0.9), filter('lowpass', 1400), crowdAm, crowd, cabin);
  chain(loop(brown), filter('bandpass', 300, 1.2), gain(0.8), crowdAm);

  // PA voices: a buzzy source through two moving formant filters, with a hall-ish echo.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.32;
  const fb = gain(0.38);
  chain(echo, fb, echo);
  chain(echo, filter('lowpass', 2500), bus.sfx);
  function pa(level) {
    const t0 = ctx.currentTime, dur = 2.5 + Math.random() * 2;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120 + Math.random() * 50;
    const f1 = filter('bandpass', 700, 6), f2 = filter('bandpass', 1400, 8), g = gain(0), out = gain(level);
    for (let t = 0; t < dur; t += 0.12) { // new "syllable" every 120 ms
      f1.frequency.setValueAtTime(400 + Math.random() * 600, t0 + t);
      f2.frequency.setValueAtTime(1100 + Math.random() * 1300, t0 + t);
      g.gain.setValueAtTime(Math.random() < 0.8 ? 0.5 : 0.05, t0 + t);
      o.frequency.setValueAtTime(o.frequency.value * (0.95 + Math.random() * 0.1), t0 + t);
    }
    g.gain.setValueAtTime(0, t0 + dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g);
    chain(g, filter('highpass', 300), out, echo);
    out.connect(bus.sfx);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }
  // Distant two-tone siren, panned and filtered for distance.
  function siren() {
    const t0 = ctx.currentTime, o = ctx.createOscillator(), pan = ctx.createStereoPanner(), g = gain(0);
    o.type = 'square';
    for (let t = 0; t < 5; t += 0.5) o.frequency.setValueAtTime(t % 1 < 0.5 ? 660 : 880, t0 + t);
    g.gain.linearRampToValueAtTime(0.025, t0 + 1); g.gain.linearRampToValueAtTime(0, t0 + 5);
    pan.pan.value = Math.random() * 1.6 - 0.8;
    chain(o, filter('lowpass', 1200), g, pan, bus.sfx);
    o.start(t0); o.stop(t0 + 5.1);
  }
  let paT = 30, sirenT = 40;

  // Recorded layers (public/sfx, see CREDITS.md) on top of the synth; a missing file just stays silent.
  const sample = (path) => fetch(`${import.meta.env.BASE_URL}${path}`).then((r) => r.arrayBuffer())
    .then((b) => ctx.decodeAudioData(b)).catch((e) => { console.warn(`${path} unavailable`, e); return null; });
  const recLoop = (path, out) => {
    const g = gain(0), src = ctx.createBufferSource();
    g.connect(out);
    sample(path).then((buf) => { if (buf) { src.buffer = buf; src.loop = true; src.connect(g); src.start(); } });
    return { g, src };
  };
  const recRain = recLoop('sfx/rain/rain-loop-1.ogg', cabin);
  const recStorm = recLoop('sfx/rain/rain-thunder.ogg', cabin);            // heavy downpour only
  const recGlass = recLoop('sfx/rain/rain_on_window_loop.wav', bus.ambience); // drops on the glass: heard inside
  const recEngine = recLoop('sfx/kenney-sci-fi-sounds/spaceEngineLow_000.ogg', bus.engine);
  const clickBuf = sample('sfx/kenney-interface-sounds/click_001.ogg');

  let dropAcc = 0;
  const set = (p, v) => p.setTargetAtTime(v, ctx.currentTime, 0.25);

  return {
    ctx, master, bus,
    resume() { return ctx.resume(); },
    update(dt, s) {
      const rain = s.rain * (1 - s.flake * 0.9);
      set(rainHi.gain, rain * (s.cockpit ? 0.04 : 0.2));
      set(rainBody.gain, rain * (s.cockpit ? 0.3 : 0.16));
      set(cabin.frequency, s.cockpit ? 1100 : 12000);
      set(eng1.frequency, (38 + s.speed * 0.9) * (s.tone ?? 1)); // tone: garage engine hum
      set(eng2.frequency, (76 + s.speed * 1.8) * (s.tone ?? 1));
      set(engLp.frequency, 220 + s.speed * 9);
      set(engGain.gain, (0.04 + Math.abs(s.thrust) * 0.04) * (s.cockpit ? 1 : 0.6));
      set(recRain.g.gain, rain * (s.cockpit ? 0.12 : 0.45));
      set(recStorm.g.gain, Math.max(0, rain - 0.75) * (s.cockpit ? 0.5 : 1.2));
      set(recGlass.g.gain, s.cockpit ? rain * 0.55 : 0);
      set(recEngine.g.gain, (0.06 + Math.abs(s.thrust) * 0.12) * (s.cockpit ? 1 : 0.6));
      set(recEngine.src.playbackRate, (0.75 + Math.min(s.speed, 120) * 0.006) * (s.tone ?? 1));
      set(crowd.gain, s.district === 'market' ? 0.35 * Math.max(0, 1 - (s.alt - 15) / 110) : 0);
      crowdAm.gain.setTargetAtTime(0.4 + Math.random() * 0.6, ctx.currentTime, 0.8);
      if ((paT -= dt) <= 0) { paT = 50 + Math.random() * 70; if (s.district === 'market' || s.district === 'spires') pa(0.05); }
      if ((sirenT -= dt) <= 0) { sirenT = 40 + Math.random() * 60; if (s.district !== 'outskirts') siren(); }

      // Drumming on the roof when you're inside: individual filtered noise ticks.
      if (!s.cockpit) return;
      dropAcc += dt * rain * 110;
      const t = ctx.currentTime;
      for (; dropAcc >= 1; dropAcc--) {
        const src = ctx.createBufferSource();
        src.buffer = white;
        const bp = filter('bandpass', 700 + Math.random() * 2200, 2.5), g = gain(0);
        const at = t + Math.random() * dt;
        g.gain.setValueAtTime(0.25 + Math.random() * 0.35, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
        chain(src, bp, g, bus.ambience);
        src.start(at, Math.random() * 2, 0.05);
      }
    },
    // Passing car: noise band sweeping down in pitch (cheap Doppler), panned to the side it passes.
    whoosh(pan, strength) {
      const t = ctx.currentTime, src = ctx.createBufferSource(), p = ctx.createStereoPanner();
      src.buffer = white;
      const bp = filter('bandpass', 1800, 1.5), g = gain(0);
      bp.frequency.setValueAtTime(1800, t);
      bp.frequency.exponentialRampToValueAtTime(350, t + 0.9);
      g.gain.linearRampToValueAtTime(0.18 * strength, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      p.pan.value = Math.max(-1, Math.min(1, pan));
      chain(src, bp, g, p, bus.sfx);
      src.start(t, Math.random() * 1.5, 1.2);
    },
    // UI button press.
    click() {
      clickBuf.then((buf) => {
        if (!buf) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        chain(src, gain(0.25), bus.sfx);
        src.start();
      });
    },
    // Memory fragment: a soft rising four-note chime with a long tail.
    chime() {
      const t = ctx.currentTime;
      [76, 83, 88, 95].forEach((n, i) => {
        const o = ctx.createOscillator(), g = gain(0), at = t + i * 0.11;
        o.type = 'triangle';
        o.frequency.value = 440 * 2 ** ((n - 69) / 12);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.07, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005, at + 2.2);
        chain(o, g, bus.sfx);
        g.connect(echo);
        o.start(at); o.stop(at + 2.3);
      });
    },
    // Kettle pour: a rising gurgle of filtered noise (pitch climbs as the cup fills).
    pour() {
      const t = ctx.currentTime, src = ctx.createBufferSource(), bp = filter('bandpass', 700, 3), g = gain(0);
      src.buffer = white;
      bp.frequency.setValueAtTime(700, t);
      bp.frequency.linearRampToValueAtTime(1700, t + 2.2);
      for (let k = 0; k < 2.2; k += 0.07) g.gain.setValueAtTime(0.05 + Math.random() * 0.05, t + k);
      g.gain.setValueAtTime(0, t + 2.3);
      chain(src, bp, g, bus.sfx);
      src.start(t, Math.random() * 1.5, 2.4);
    },
    // Sip: a short airy slurp, then a soft low gulp.
    sip() {
      const t = ctx.currentTime, src = ctx.createBufferSource(), bp = filter('bandpass', 1400, 4), g = gain(0);
      src.buffer = white;
      bp.frequency.setValueAtTime(1100, t);
      bp.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
      g.gain.linearRampToValueAtTime(0.06, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      chain(src, bp, g, bus.sfx);
      src.start(t, Math.random(), 0.45);
      const o = ctx.createOscillator(), og = gain(0);
      o.frequency.setValueAtTime(210, t + 0.55);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.65);
      og.gain.setValueAtTime(0.08, t + 0.55);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      chain(o, og, bus.sfx);
      o.start(t + 0.55); o.stop(t + 0.75);
    },
    // Firework: distant bang (delayed by distance) with a crackle tail.
    firework(delay, strength) {
      const t = ctx.currentTime + delay, src = ctx.createBufferSource(), lp = filter('lowpass', 900), g = gain(0);
      src.buffer = brown;
      g.gain.setValueAtTime(strength * 0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      chain(src, lp, g, bus.sfx);
      src.start(t, Math.random() * 2, 1.7);
      const cr = ctx.createBufferSource(), hp = filter('highpass', 3000), cg = gain(0);
      cr.buffer = white;
      for (let k = 0.3; k < 1.8; k += 0.05) cg.gain.setValueAtTime(Math.random() < 0.3 ? strength * 0.12 : 0, t + k);
      cg.gain.setValueAtTime(0, t + 1.85);
      chain(cr, hp, cg, bus.sfx);
      cr.start(t, Math.random() * 2, 1.9);
    },
    thunder(delay, strength) {
      const t = ctx.currentTime + delay, src = ctx.createBufferSource();
      src.buffer = brown;
      src.loop = true;
      const lp = filter('lowpass', 700), g = gain(0);
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.exponentialRampToValueAtTime(80, t + 4);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(strength * 1.2, t + 0.08);
      g.gain.exponentialRampToValueAtTime(strength * 0.5, t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.001, t + 7);
      chain(src, lp, g, bus.sfx);
      src.start(t);
      src.stop(t + 7.5);
    },
  };
}
