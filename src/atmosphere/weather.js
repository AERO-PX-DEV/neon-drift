// Weather states blend toward the target over ~30 s (exponential approach, τ = 8 s).
export const WEATHER = {
  drizzle: { name: 'Light Drizzle', rain: 0.25, fall: 30, fog: 0.0032, len: 0.035, wobble: 0, flake: 0, lightning: 0 },
  steady: { name: 'Steady Rain', rain: 0.6, fall: 38, fog: 0.0042, len: 0.045, wobble: 0, flake: 0, lightning: 0 },
  downpour: { name: 'Heavy Downpour', rain: 1, fall: 48, fog: 0.0058, len: 0.055, wobble: 0, flake: 0, lightning: 1 },
  fog: { name: 'Dense Fog', rain: 0.08, fall: 30, fog: 0.012, len: 0.035, wobble: 0, flake: 0, lightning: 0 },
  ash: { name: 'Ash/Snow Mix', rain: 0.55, fall: 4.5, fog: 0.0065, len: 0.012, wobble: 1.4, flake: 1, lightning: 0 },
};
// Auto weather: ash is rare and eerie.
const AUTO_WEIGHTS = [['drizzle', 3], ['steady', 4], ['downpour', 2], ['fog', 1.5], ['ash', 0.4]];

export class Weather {
  constructor(key = 'steady') {
    this.key = key;
    this.p = { ...WEATHER[key] };
    this.auto = true;
    this.autoTimer = 150;
    this.flash = 0;
    this.flashRaw = 0;
    this.lightTimer = 3;
    this.onThunder = null; // (delaySeconds, strength) => void
  }

  get name() { return WEATHER[this.key].name; }

  set(key) { if (WEATHER[key]) this.key = key; }

  update(dt) {
    const tgt = WEATHER[this.key], k = 1 - Math.exp(-dt / 8);
    for (const f in this.p) if (typeof tgt[f] === 'number') this.p[f] += (tgt[f] - this.p[f]) * k;

    if (this.auto && (this.autoTimer -= dt) <= 0) {
      this.autoTimer = 120 + Math.random() * 180;
      const total = AUTO_WEIGHTS.reduce((s, [, w]) => s + w, 0);
      let r = Math.random() * total;
      for (const [key, w] of AUTO_WEIGHTS) if ((r -= w) <= 0) { this.key = key; break; }
    }

    if (this.p.lightning > 0.3 && (this.lightTimer -= dt) <= 0) this.strike();
    this.flashRaw *= Math.exp(-dt * 5);
    // double-flicker look of distant lightning
    this.flash = this.flashRaw * (0.55 + 0.45 * Math.sin(this.flashRaw * 40));
  }

  strike(strength = 0.6 + Math.random() * 0.4) {
    this.flashRaw = strength;
    this.lightTimer = 5 + Math.random() * 14;
    this.onThunder?.(0.6 + Math.random() * 3, strength);
  }
}
