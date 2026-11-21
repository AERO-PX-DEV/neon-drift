import * as THREE from 'three';

const W = 512, H = 302, MAX = 600; // H/W matches the Blender windshield (1.50 m × 0.89 m)
const PERIOD = [0, 1.4, 1.25, 0.75]; // seconds per wipe; mode 1 pauses between wipes (intermittent)
const REST = [0, 2.2, 0, 0];
const SWEEP = 2.5; // radians from rest (lying right) up and over
// Pivot x and blade reach in canvas px; must match X_WiperL/R in blender/car.blend (0.73 m and 0.55 m arms).
const PIVOTS = [W * 0.2, W * 0.64], BLADES = [249, 188];
const PY = H + 8;

// Drops beaded on a canvas texture on the windshield; wiper blades clear what they sweep.
export class Windshield {
  constructor() {
    this.canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.4),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }),
    );
    // Raked back over the driver so it fills the cockpit view; only shown in cockpit (it pokes above the roof).
    this.mesh.position.set(0, 0.76, -0.9); // follows the Blender car's long raked windshield
    this.mesh.rotation.x = -1.09;
    this.drops = [];
    this.mode = 0;
    this.phase = 0;
    this.angle = 0;
    this.spawn = 0;
    this.drawT = 0;
  }

  cycle() { this.mode = (this.mode + 1) % 4; return this.mode; }

  update(dt, rain, speed) {
    const drops = this.drops;
    this.spawn += dt * rain * (45 + speed * 1.5);
    for (; this.spawn >= 1; this.spawn--) {
      if (drops.length >= MAX) { this.spawn = 0; break; }
      const r = 1.2 + Math.random() ** 2 * 4.5;
      drops.push({ x: Math.random() * W, y: Math.random() * H, r });
    }
    // Airflow pushes drops up the glass at speed; heavy drops run down when slow.
    const push = speed * speed * 0.025;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += ((d.r > 3.8 ? 22 : 0) - push) * dt;
      if (d.y < -8 || d.y > H + 8) drops.splice(i, 1);
    }

    // Wipers sweep 0 → SWEEP → 0 with an ease; anything between last and current angle is wiped.
    const prev = this.angle;
    if (this.mode) {
      this.phase += dt;
      const cyc = PERIOD[this.mode] + REST[this.mode];
      const p = (this.phase % cyc) / PERIOD[this.mode];
      this.angle = p < 1 ? (SWEEP * (1 - Math.cos(2 * Math.PI * p))) / 2 : 0;
    } else {
      this.angle = Math.max(0, this.angle - dt * 3); // park the blades
    }
    const lo = Math.min(prev, this.angle) - 0.05, hi = Math.max(prev, this.angle) + 0.05;
    if (hi - lo > 0.1) {
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        for (let k = 0; k < 2; k++) {
          const dx = d.x - PIVOTS[k], dy = PY - d.y;
          const a = Math.atan2(dy, dx);
          if (dx * dx + dy * dy < BLADES[k] ** 2 && a >= lo && a <= hi) { drops.splice(i, 1); break; }
        }
      }
    }

    if ((this.drawT -= dt) <= 0) { this.drawT = 1 / 30; this.draw(); }
  }

  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.beginPath();
    for (const d of this.drops) { c.moveTo(d.x + d.r, d.y); c.arc(d.x, d.y, d.r, 0, Math.PI * 2); }
    c.fillStyle = 'rgba(150,180,220,0.22)';
    c.fill();
    c.beginPath();
    for (const d of this.drops) { const r = d.r * 0.32; c.moveTo(d.x - d.r * 0.3 + r, d.y - d.r * 0.35); c.arc(d.x - d.r * 0.3, d.y - d.r * 0.35, r, 0, Math.PI * 2); }
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fill();
    this.tex.needsUpdate = true;
  }
}
