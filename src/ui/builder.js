import * as THREE from 'three';
import { lotAt, solidAt } from '../world/city.js';
import { DISTRICTS } from '../world/districts.js';
import { makePadMesh } from '../world/pads.js';
import { holoMaterial } from '../world/holograms.js';
import { slider, button } from './drawer.js';
import { load, store } from '../core/save.js';

const KINDS = { pad: 'Sky-pad', outpost: 'Outpost', sign: 'Neon sign', holo: 'Hologram' };
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function signMesh(text, color) {
  const c = Object.assign(document.createElement('canvas'), { width: 1024, height: 160 });
  const g = c.getContext('2d');
  g.font = '600 110px "Segoe UI", "Yu Gothic", sans-serif';
  const w = Math.min(1004, g.measureText(text).width + 60);
  c.width = Math.max(160, Math.ceil(w)); // resizing resets the context
  g.font = '600 110px "Segoe UI", "Yu Gothic", sans-serif';
  g.fillStyle = '#07090e'; g.fillRect(0, 0, c.width, 160);
  g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 14; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, 84, c.width - 40);
  g.fillRect(16, 10, c.width - 32, 5); g.fillRect(16, 145, c.width - 32, 5); // tube rails
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const h = 2.4, mesh = new THREE.Mesh(new THREE.PlaneGeometry((h * c.width) / 160, h),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(...rgb(color).map((v) => v * 2.2)), side: THREE.DoubleSide }));
  mesh.position.y = 4;
  return mesh;
}

// B toggles builder mode: aim at a rooftop (the screen centre), pick what to place, Enter to drop it there.
// Edits are saved per seed in localStorage; district names, traffic and neon are saved globally.
export function createBuilder({ scene, camera, city, pads, lights, uniforms }) {
  const key = `nd.world.${city.seed}`;
  const items = (Array.isArray(load(key, [])) ? load(key, []) : [])
    .filter((it) => KINDS[it?.kind] && [it.x, it.y, it.z, it.rot].every(Number.isFinite) && /^#[0-9a-f]{6}$/i.test(it.color));
  const group = new THREE.Group(), anims = new Map();
  scene.add(group);

  const markerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3.5, 4.5) });
  const marker = new THREE.Group();
  marker.add(new THREE.Mesh(new THREE.TorusGeometry(3, 0.12, 6, 40).rotateX(Math.PI / 2), markerMat));
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.15, 12, 0.15), markerMat);
  stem.position.y = 6;
  marker.add(stem);
  marker.visible = false;
  scene.add(marker);

  document.body.insertAdjacentHTML('beforeend', `
    <div id="builder" class="hidden">
      <div class="t">WORLD BUILDER</div>
      <select>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <input class="txt" maxlength="24" placeholder="Text / name" value="NIGHT OWL" />
      <input class="col" type="color" value="#1ad9ff" />
      <button data-a="place">Place (Enter)</button><button data-a="undo">Undo</button>
      <div class="hint">Aim at a rooftop · B to exit · Esc → World Builder tab for districts</div>
    </div>`);
  const ui = document.getElementById('builder');
  const kindSel = ui.querySelector('select'), txt = ui.querySelector('.txt'), col = ui.querySelector('.col'), hint = ui.querySelector('.hint');
  txt.addEventListener('keydown', (e) => { if (e.code === 'Enter') { api.place(); txt.blur(); } });

  function build(it) {
    let obj;
    if (it.kind === 'pad') {
      const pad = { id: it.id, type: 'pad', name: it.text || 'My Pad', x: it.x, y: it.y, z: it.z, user: true };
      pads.push(pad);
      obj = makePadMesh(pad);
    } else {
      obj = new THREE.Group();
      obj.position.set(it.x, it.y, it.z);
      obj.rotation.y = it.rot;
      const c = rgb(it.color);
      if (it.kind === 'outpost') {
        const shell = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4), new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.5, metalness: 0.5 }));
        shell.position.y = 1.3;
        const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(...c.map((v) => v * 3)) });
        const win = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 0.05), glow);
        win.position.set(0, 1.8, 2.03);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.5, 0.25) }));
        door.position.set(1.2, 0.9, 2.03);
        const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5, 0.12), shell.material);
        mast.position.set(-1.5, 5, -1.5);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 0.4, 0.25) }));
        beacon.position.set(-1.5, 7.6, -1.5);
        obj.add(shell, win, door, mast, beacon);
      } else if (it.kind === 'sign') {
        const s = signMesh(it.text || 'OPEN', it.color);
        const post = new THREE.MeshStandardMaterial({ color: 0x0b0d11, metalness: 0.6, roughness: 0.4 });
        const w = s.geometry.parameters.width;
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), post); p.position.set(sx * w * 0.35, 1.5, -0.05); obj.add(p); }
        obj.add(s);
      } else {
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), holoMaterial(c.map((v) => v * 1.3), uniforms));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 48), holoMaterial(c, uniforms));
        ring.rotation.x = 1.2;
        const h = new THREE.Group();
        h.add(core, ring);
        h.scale.setScalar(4);
        h.position.y = 9;
        obj.add(h);
        anims.set(obj, (t) => { core.rotation.y = t * 0.8; ring.rotation.z = -t * 0.5; h.position.y = 9 + Math.sin(t) * 0.8; });
      }
    }
    obj.userData.id = it.id;
    group.add(obj);
  }
  items.forEach(build);

  function remove(id) {
    const i = items.findIndex((it) => it.id === id);
    if (i < 0) return;
    items.splice(i, 1);
    const obj = group.children.find((o) => o.userData.id === id);
    if (obj) { group.remove(obj); anims.delete(obj); }
    const pi = pads.findIndex((p) => p.id === id);
    if (pi >= 0) pads.splice(pi, 1);
    store(key, items);
    renderList();
  }

  // Step along the view ray until it enters a building, then snap onto that building's top roof.
  const dir = new THREE.Vector3(), p = new THREE.Vector3();
  function target() {
    camera.getWorldDirection(dir);
    p.copy(camera.position);
    for (let d = 0; d < 900; d += 1.5) {
      p.addScaledVector(dir, 1.5);
      if (p.y < 0) return null;
      const b = lotAt(city, p.x, p.z);
      if (b && solidAt(b, p.x, p.y, p.z)) {
        if (b.shape !== 'box') return null;
        const r = b.tiers?.at(-1) ?? b, mx = Math.max(0, r.w / 2 - 2.5), mz = Math.max(0, r.d / 2 - 2.5);
        return { x: THREE.MathUtils.clamp(p.x, b.x - mx, b.x + mx), y: b.top, z: THREE.MathUtils.clamp(p.z, b.z - mz, b.z + mz) };
      }
    }
    return null;
  }

  // ---- drawer tab: placed things + district editor
  let listEl = null;
  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = items.length ? '' : '<p class="dim">Nothing placed yet. Press B in flight.</p>';
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'placed';
      row.innerHTML = `<span>${KINDS[it.kind]}${it.text && it.kind !== 'holo' && it.kind !== 'outpost' ? ` · ${esc(it.text)}` : ''}</span>`;
      const x = Object.assign(document.createElement('button'), { textContent: '✕', className: 'act', title: 'Remove' });
      x.onclick = () => remove(it.id);
      row.append(x);
      listEl.append(row);
    }
  }
  const dKey = 'nd.districts', dSaved = load(dKey, []);
  const saveDistricts = () => store(dKey, DISTRICTS.map((d, i) => ({ name: d.name, traffic: d.traffic, neon: lights.neon[i] })));
  const baseTraffic = DISTRICTS.map((d) => d.traffic);
  // Fresh installs start at the sliders' max: every lane full, brightest neon. Saved tweaks below still win.
  DISTRICTS.forEach((d, i) => { d.traffic = 2.5; lights.setNeon(i, 2); });
  dSaved.forEach((s, i) => {
    if (!DISTRICTS[i] || !s) return;
    if (typeof s.name === 'string' && s.name.trim()) DISTRICTS[i].name = s.name.slice(0, 32);
    if (Number.isFinite(s.traffic)) DISTRICTS[i].traffic = s.traffic;
    if (Number.isFinite(s.neon)) lights.setNeon(i, s.neon);
  });

  const api = {
    active: false,
    toggle() {
      api.active = !api.active;
      ui.classList.toggle('hidden', !api.active);
      marker.visible = false;
      if (!api.active) txt.blur();
    },
    place() {
      const t = target();
      if (!t) { hint.textContent = 'No rooftop in sight: aim the view at a roof'; return; }
      const it = {
        id: `u${Date.now().toString(36)}`, kind: kindSel.value, text: txt.value.trim().slice(0, 24), color: col.value,
        x: t.x, y: t.y, z: t.z, rot: Math.atan2(camera.position.x - t.x, camera.position.z - t.z),
      };
      items.push(it);
      build(it);
      store(key, items);
      renderList();
      hint.textContent = `Placed ${KINDS[it.kind].toLowerCase()}. Undo removes it.`;
    },
    undo() { if (items.length) remove(items.at(-1).id); },
    update(time) {
      for (const a of anims.values()) a(time);
      if (!api.active) return;
      const t = target();
      marker.visible = !!t;
      if (t) { marker.position.set(t.x, t.y + 0.2, t.z); marker.rotation.y = time; }
    },
    // Fills the drawer's World Builder tab.
    fillTab(pane) {
      pane.append(Object.assign(document.createElement('h3'), { textContent: 'PLACED' }));
      listEl = document.createElement('div');
      pane.append(listEl);
      renderList();
      button(pane, 'Builder mode (B)', () => api.toggle());
      DISTRICTS.forEach((d, i) => {
        pane.append(Object.assign(document.createElement('h3'), { textContent: d.id.toUpperCase() }));
        const name = Object.assign(document.createElement('input'), { value: d.name, maxLength: 32, className: 'name' });
        name.onchange = () => { if (name.value.trim()) { d.name = name.value.trim(); saveDistricts(); } };
        pane.append(name);
        slider(pane, 'Traffic', { min: 0, max: 2.5, step: 0.05, value: d.traffic }, (v) => { d.traffic = v; saveDistricts(); });
        slider(pane, 'Neon', { min: 0, max: 2, step: 0.05, value: lights.neon[i] }, (v) => { lights.setNeon(i, v); saveDistricts(); });
      });
      button(pane, 'Reset districts', () => { store(dKey, []); DISTRICTS.forEach((d, i) => { d.traffic = baseTraffic[i]; lights.setNeon(i, 1); }); location.reload(); });
    },
  };
  ui.addEventListener('click', (e) => { if (e.target.dataset.a === 'place') api.place(); else if (e.target.dataset.a === 'undo') api.undo(); });
  return api;
}
