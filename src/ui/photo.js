import * as THREE from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { slider, select, check } from './drawer.js';

// CSS filter strings: previewed live on the canvas and baked into the saved PNG with the same string.
export const FILTERS = {
  none: ['None', 'none'],
  noir: ['Noir', 'grayscale(1) contrast(1.35) brightness(0.95)'],
  neon: ['Neon pop', 'saturate(1.7) contrast(1.12)'],
  film: ['Faded film', 'sepia(0.3) saturate(0.85) contrast(0.95) brightness(1.05)'],
  cold: ['Cold steel', 'hue-rotate(-14deg) saturate(1.25) brightness(0.95)'],
  dream: ['Dream', 'blur(0.8px) brightness(1.12) saturate(1.3)'],
};

// P: the world freezes (main.js stops simulating), you get a free camera, then save the frame as a PNG.
export function createPhoto({ camera, renderer, scene, post, input, canvas, car }) {
  const dof = new BokehPass(scene, camera, { focus: 20, aperture: 0.002, maxblur: 0.012 });
  dof.enabled = false;
  post.composer.insertPass(dof, 2); // after the render and the NaN guard
  const st = { yaw: 0, pitch: 0, fov: 60, filter: 'none', dof: false };
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3();

  document.body.insertAdjacentHTML('beforeend', `<div id="photo" class="hidden"><div class="t">PHOTO MODE</div><div class="ctl"></div>
    <button data-a="shot">Save PNG (Enter)</button><button data-a="exit">Exit (P)</button>
    <div class="hint">WASD / Q E move · Space / F up-down · Shift faster · drag to look</div><div class="msg"></div></div>`);
  const ui = document.getElementById('photo'), ctl = ui.querySelector('.ctl'), msg = ui.querySelector('.msg');
  const fovIn = slider(ctl, 'Field of view', { min: 15, max: 100, step: 1, value: 60 }, (x) => (st.fov = x));
  select(ctl, 'Filter', Object.entries(FILTERS).map(([k, [n]]) => [k, n]), 'none', (k) => { st.filter = k; canvas.style.filter = FILTERS[k][1]; });
  check(ctl, 'Depth of field', false, (on) => (dof.enabled = st.dof = on));
  const focusIn = slider(ctl, 'Focus distance', { min: 2, max: 400, step: 1, value: 20 }, (x) => (dof.uniforms.focus.value = x));
  slider(ctl, 'Blur', { min: 0.0002, max: 0.01, step: 0.0002, value: 0.002 }, (x) => (dof.uniforms.aperture.value = x));
  const focusCar = Object.assign(document.createElement('button'), { textContent: 'Focus on car', className: 'act' });
  focusCar.onclick = () => { const d = camera.position.distanceTo(car.pos); dof.uniforms.focus.value = d; focusIn.value = d; };
  ctl.append(focusCar);

  let dragging = false;
  canvas.addEventListener('pointerdown', () => (dragging = api.active));
  addEventListener('pointerup', () => (dragging = false));
  addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    st.yaw -= ev.movementX * 0.003;
    st.pitch = THREE.MathUtils.clamp(st.pitch - ev.movementY * 0.003, -1.5, 1.5);
  });

  const api = {
    active: false,
    enter() {
      api.active = true;
      e.setFromQuaternion(camera.quaternion, 'YXZ');
      st.yaw = e.y; st.pitch = e.x; st.fov = camera.fov; fovIn.value = st.fov;
      dof.enabled = st.dof;
      canvas.style.filter = FILTERS[st.filter][1];
      ui.classList.remove('hidden');
      document.body.classList.add('in-photo');
      msg.textContent = '';
    },
    exit() {
      api.active = false;
      dof.enabled = false;
      canvas.style.filter = '';
      ui.classList.add('hidden');
      document.body.classList.remove('in-photo');
    },
    update(dt) {
      const sp = (input.held('boost') ? 45 : 12) * dt;
      const fwd = input.axis('forward', 'back'), side = input.axis('right', 'left') + input.axis('strafeR', 'strafeL'), up = input.axis('up', 'down');
      const s = Math.sin(st.yaw), c = Math.cos(st.yaw);
      camera.position.add(v.set(-s * fwd + c * side, up, -c * fwd - s * side).multiplyScalar(sp));
      camera.quaternion.setFromEuler(e.set(st.pitch, st.yaw, 0, 'YXZ'));
      camera.fov = st.fov;
      camera.updateProjectionMatrix();
    },
    // render() must draw the frame; the canvas is copied straight after, before the browser clears it.
    capture(render) {
      render();
      const out = Object.assign(document.createElement('canvas'), { width: renderer.domElement.width, height: renderer.domElement.height });
      const g = out.getContext('2d');
      g.filter = FILTERS[st.filter][1];
      g.drawImage(renderer.domElement, 0, 0);
      out.toBlob((blob) => {
        if (!blob) { msg.textContent = 'Could not save the image.'; return; }
        const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `neon-drift-${stamp}.png` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    },
    say(text) { msg.textContent = text; },
  };
  ui.addEventListener('click', (ev) => { if (ev.target.dataset.a === 'exit') api.exit(); else if (ev.target.dataset.a === 'shot') api.onShot?.(); });
  return api;
}
