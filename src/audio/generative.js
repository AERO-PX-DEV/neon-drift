// "City Ambience": an endless generative station. Slow minor-key pads, deep sub bass,
// sparse pentatonic plucks through an echo, vinyl crackle and soft rain. Always works, zero files.
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const CHORDS = [ // A minor-ish progression, MIDI notes
  [45, 52, 57, 60, 64, 67], // Am9 colour
  [41, 48, 53, 57, 60, 64], // Fmaj7
  [48, 55, 60, 64, 67, 71], // Cmaj7
  [43, 50, 55, 59, 62, 66], // G6/9-ish
];
const PENTA = [69, 72, 74, 76, 79, 81, 84];

export function createGenerative(ctx, out) {
  const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const f = (type, freq, Q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.Q.value = Q; return n; };

  let master = null, voices = [], nodes = [], chordT = 0, pluckT = 2, chordIdx = 0, sub = null, echo = null;

  function crackleBuffer() {
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.015 + (Math.random() < 0.0004 ? (Math.random() - 0.5) * 1.2 : 0);
    return b;
  }

  function playChord(notes) {
    const t = ctx.currentTime;
    for (const v of voices) { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 1.5); v.oscs.forEach((o) => o.stop(t + 8)); }
    voices = notes.map((m) => {
      const vg = g(0), lp = f('lowpass', 700 + Math.random() * 500, 0.8);
      const oscs = [-7, 7].map((det) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; o.connect(lp); o.start(t); return o; });
      lp.connect(vg); vg.connect(master);
      vg.gain.setTargetAtTime(0.022, t, 2.2); // slow swell
      return { g: vg, oscs };
    });
    sub.frequency.setTargetAtTime(mtof(notes[0] - 12), t, 0.5);
  }

  function pluck() {
    const t = ctx.currentTime, o = ctx.createOscillator(), e = g(0);
    o.type = 'triangle';
    o.frequency.value = mtof(PENTA[Math.floor(Math.random() * PENTA.length)]);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.05, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0005, t + 2.5);
    o.connect(e); e.connect(echo); e.connect(master);
    o.start(t); o.stop(t + 2.6);
  }

  return {
    running: false,
    start() {
      if (this.running) return;
      this.running = true;
      const t = ctx.currentTime;
      master = g(0);
      master.connect(out);
      master.gain.linearRampToValueAtTime(0.9, t + 4);
      sub = ctx.createOscillator(); sub.frequency.value = 55;
      const subG = g(0.18); sub.connect(subG); subG.connect(master); sub.start();
      echo = ctx.createDelay(1.5); echo.delayTime.value = 0.42;
      const fb = g(0.45), eLp = f('lowpass', 2200);
      echo.connect(eLp); eLp.connect(fb); fb.connect(echo); eLp.connect(master);
      const crackle = ctx.createBufferSource(); crackle.buffer = crackleBuffer(); crackle.loop = true;
      const cG = g(0.6); crackle.connect(f('highpass', 800)).connect(cG); cG.connect(master); crackle.start();
      const rainB = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), rd = rainB.getChannelData(0);
      for (let i = 0; i < rd.length; i++) rd[i] = Math.random() * 2 - 1;
      const rain = ctx.createBufferSource(); rain.buffer = rainB; rain.loop = true;
      rain.connect(f('bandpass', 2800, 0.5)).connect(g(0.025)).connect(master); rain.start();
      nodes = [sub, crackle, rain];
      chordIdx = 0; chordT = 11; pluckT = 3;
      playChord(CHORDS[0]);
    },
    stop() {
      if (!this.running) return;
      this.running = false;
      const t = ctx.currentTime, m = master;
      m.gain.cancelScheduledValues(t); m.gain.setTargetAtTime(0, t, 0.8);
      for (const v of voices) v.oscs.forEach((o) => o.stop(t + 4));
      for (const n of nodes) n.stop(t + 4);
      setTimeout(() => m.disconnect(), 4500);
      voices = []; nodes = [];
    },
    update(dt) {
      if (!this.running) return;
      if ((chordT -= dt) <= 0) { chordT = 10 + Math.random() * 4; chordIdx = (chordIdx + 1) % CHORDS.length; playChord(CHORDS[chordIdx]); }
      if ((pluckT -= dt) <= 0) { pluckT = 1.5 + Math.random() * 5; pluck(); }
    },
  };
}
