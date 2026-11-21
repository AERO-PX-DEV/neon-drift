import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';
import { DISTRICTS } from './districts.js';
import { HALF } from './layout.js';
import { getAtlas, BRANDS_H } from './signs.js';
import { makeBeam } from '../fx/beam.js';

// Shared hologram look: fresnel rim + rolling scanlines + glitch flicker, additive.
// MODE 1 = dancer (twist/sway/flare), MODE 2 = koi (swim wave along the body).
export function holoMaterial(color, uniforms, mode = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uPulse: uniforms.uPulse, uColor: { value: new THREE.Color(...color) } },
    defines: { MODE: mode },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY; varying float vFade;
      void main() {
        vec3 p = position;
        #if MODE == 1
          float k = clamp(p.y, 0.0, 1.0);
          float a = sin(uTime * 0.9) * 0.9 * k + uTime * 0.25;
          p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
          p.x += sin(uTime * 1.3) * 0.08 * k * k;
          if (p.y < 0.45) p.xz *= 1.0 + sin(uTime * 1.8 + atan(p.z, p.x) * 3.0) * 0.15 * (0.45 - p.y) / 0.45;
        #elif MODE == 2
          p.x += sin(p.z * 6.0 - uTime * 4.0) * 0.07 * (0.5 - p.z);
        #endif
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vY = wp.y;
        vFade = exp(-length(cameraPosition - wp.xyz) * 0.0011);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uPulse; varying vec3 vN; varying vec3 vV; varying float vY; varying float vFade;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.6 + 0.4 * sin(vY * 2.2 - uTime * 6.0);
        float glitch = 1.0 - 0.6 * step(0.94, fract(sin(floor(uTime * 5.0)) * 43758.5453)) * step(0.5, fract(vY * 0.05 + uTime));
        vec3 c = uColor * (0.1 + fres * 1.6) * scan * glitch * (1.0 + uPulse * 0.6) * vFade;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function dancerGeometry() {
  const pts = [[0, 0], [0.22, 0], [0.2, 0.08], [0.14, 0.25], [0.08, 0.42], [0.11, 0.55], [0.12, 0.66], [0.13, 0.72],
    [0.045, 0.76], [0.05, 0.8], [0.065, 0.85], [0.06, 0.9], [0.03, 0.94], [0, 0.95]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 24);
}

function koiGeometry() {
  // Body along +Z (head at +0.5, tail at −0.5) so Object3D.lookAt points the head forward.
  const pts = [[0, 0], [0.02, 0.05], [0.04, 0.2], [0.09, 0.45], [0.11, 0.65], [0.1, 0.8], [0.07, 0.92], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  const bodyG = new THREE.LatheGeometry(pts, 12).rotateX(Math.PI / 2).translate(0, 0, -0.5).toNonIndexed();
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.45, 0, 0.17, -0.7, 0, -0.17, -0.7], 3));
  fin.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  fin.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2));
  return mergeGeometries([bodyG, fin]);
}

export function createHolograms(city, uniforms) {
  const rnd = mulberry32(city.seed ^ 0x4010);
  const group = new THREE.Group();
  const anims = [];
  const spires = city.buildings.filter((b) => DISTRICTS[b.district].id === 'spires' && b.shape === 'box').sort((a, b) => b.top - a.top);
  const market = city.buildings.filter((b) => DISTRICTS[b.district].id === 'market');

  // Giant dancers on spire rooftops.
  const dGeo = dancerGeometry(), armGeo = new THREE.CylinderGeometry(0.018, 0.012, 0.36, 6).translate(0, -0.18, 0);
  [[1, 0.2, 0.8], [0.2, 0.9, 1], [1, 0.5, 0.2], [0.7, 0.3, 1]].forEach((col, i) => {
    const b = spires[3 + i * 4];
    if (!b) return;
    const g = new THREE.Group();
    const mat = holoMaterial(col, uniforms, 1), armMat = holoMaterial(col, uniforms, 0);
    g.add(new THREE.Mesh(dGeo, mat));
    const arms = new THREE.Group();
    const l = new THREE.Mesh(armGeo, armMat), r = new THREE.Mesh(armGeo, armMat);
    l.position.set(-0.13, 0.72, 0); r.position.set(0.13, 0.72, 0);
    arms.add(l, r);
    g.add(arms);
    g.scale.setScalar(70 + rnd() * 30);
    g.position.set(b.x, b.top +2, b.z);
    group.add(g);
    const ph = rnd() * 10;
    anims.push((t) => {
      arms.rotation.y = Math.sin(t * 0.9) * 0.9 * 0.75 + t * 0.25; // follow the body's twist at shoulder height
      l.rotation.z = -(0.6 + Math.sin(t * 1.3 + ph) * 1.2);
      r.rotation.z = 0.6 + Math.sin(t * 1.1 + ph + 1.5) * 1.2;
      l.rotation.x = Math.sin(t * 0.7 + ph) * 0.5;
    });
  });

  // Koi swimming through the air in slow loops around the spires.
  const kGeo = koiGeometry();
  for (let s = 0; s < 3; s++) {
    const cx = (rnd() - 0.5) * HALF * 0.5, cz = (rnd() - 0.5) * HALF * 0.5, R = 140 + rnd() * 120, alt = 130 + rnd() * 70, w = 0.05 + rnd() * 0.03;
    for (let k = 0; k < 5; k++) {
      const col = [[1, 0.35, 0.08], [0.85, 0.9, 1], [1, 0.12, 0.15]][k % 3];
      const fish = new THREE.Mesh(kGeo, holoMaterial(col, uniforms, 2));
      fish.scale.setScalar(24 + rnd() * 10);
      group.add(fish);
      const off = k * 0.09, dr = (rnd() - 0.5) * 30, dy = (rnd() - 0.5) * 20, next = new THREE.Vector3();
      const at = (t, v) => v.set(cx + Math.cos(t * w + off) * (R + dr), alt + dy + Math.sin(t * w * 2 + off) * 25, cz + Math.sin(t * w + off) * (R + dr) * 0.7);
      anims.push((t) => { at(t, fish.position); fish.lookAt(at(t + 0.5, next)); });
    }
  }

  // Rotating product holos over market rooftops; festival night adds more over the Market and Stacks.
  const festival = new THREE.Group();
  festival.visible = false;
  group.add(festival);
  const stacks = city.buildings.filter((b) => DISTRICTS[b.district].id === 'stacks');
  const frnd = mulberry32(city.seed ^ 0xfe57); // festival picks get their own stream so the normal city is unchanged
  for (let i = 0; i < 25; i++) {
    const fest = i >= 7, r = fest ? frnd : rnd, from = fest && i % 2 ? stacks : market, b = from[Math.floor(r() * from.length)];
    if (!b) break;
    const col = fest ? [[0.2, 0.9, 1], [1, 0.25, 0.2], [0.6, 1, 1]][i % 3] : [[0.2, 1, 0.9], [1, 0.2, 0.7], [1, 0.7, 0.2]][i % 3];
    const g = new THREE.Group();
    const core = new THREE.Mesh(i % 2 ? new THREE.IcosahedronGeometry(1, 0) : new THREE.CylinderGeometry(0.55, 0.55, 1.6, 20), holoMaterial(col, uniforms));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 48), holoMaterial(col, uniforms));
    ring.rotation.x = 1.2;
    g.add(core, ring);
    g.scale.setScalar(6 + r() * 5);
    g.position.set(b.x, b.top +14, b.z);
    (fest ? festival : group).add(g);
    anims.push((t) => { core.rotation.y = t * 0.8; ring.rotation.z = -t * 0.5; g.position.y = b.top +14 + Math.sin(t + i) * 1.5; });
  }

  // Floating brand logos above the spires.
  const { tex, rect } = getAtlas();
  for (let i = 0; i < 5; i++) {
    const b = spires[i * 2];
    if (!b) break;
    const slot = Math.floor(rnd() * BRANDS_H.length), [u, v, du, dv] = rect(false, slot);
    const geo = new THREE.PlaneGeometry(60, 60 * (96 / 512));
    const uv = geo.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, u + uv.getX(j) * du, v + uv.getY(j) * dv);
    const col = [[0.3, 1.2, 2], [2, 0.4, 1.4], [2, 1.2, 0.3]][i % 3];
    const logo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(...col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    logo.position.set(b.x, b.top +25, b.z);
    group.add(logo);
    anims.push((t) => { logo.rotation.y = t * 0.15 + i; logo.position.y = b.top +25 + Math.sin(t * 0.6 + i) * 3; });
  }

  // Searchlights in the clouds from the four tallest spires.
  for (let i = 0; i < 4 && spires[i]; i++) {
    const b = spires[i], beam = makeBeam(700, 45, [0.7, 0.8, 1], 0.12), ph = rnd() * 10;
    beam.position.set(b.x, b.top +1, b.z);
    group.add(beam);
    anims.push((t) => beam.rotation.set(Math.PI + Math.sin(t * 0.11 + ph) * 0.45, 0, Math.cos(t * 0.09 + ph) * 0.45));
  }

  // Ad blimps with a shared animated screen.
  const ad = Object.assign(document.createElement('canvas'), { width: 512, height: 154 });
  const adG = ad.getContext('2d'), adTex = new THREE.CanvasTexture(ad);
  adTex.colorSpace = THREE.SRGBColorSpace;
  const hull = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.6, roughness: 0.4 });
  const screenMat = new THREE.MeshBasicMaterial({ map: adTex, color: new THREE.Color(2, 2, 2), side: THREE.DoubleSide });
  const navMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 0.4, 0.3) });
  const blimps = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), hull);
    body.scale.set(16, 14, 60);
    g.add(body);
    for (const sx of [-1, 1]) {
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(44, 13), screenMat);
      sc.position.set(sx * 15.6, -1, 0);
      sc.rotation.y = sx * Math.PI / 2;
      g.add(sc);
    }
    const lights = [new THREE.Vector3(0, -12, 0), new THREE.Vector3(0, 0, -60), new THREE.Vector3(0, 0, 60)].map((p) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), navMat);
      l.position.copy(p); g.add(l); return l;
    });
    group.add(g);
    const ph = (i / 3) * Math.PI * 2, alt = 230 + i * 30, next = new THREE.Vector3();
    const at = (t, v) => v.set(Math.cos(t * 0.008 + ph) * 650, alt, Math.sin(t * 0.008 + ph) * 520);
    blimps.push({ g, lights });
    anims.push((t) => { at(t, g.position); g.lookAt(at(t + 1, next)); lights.forEach((l) => (l.visible = (t * 0.8 + i) % 1 < 0.15)); });
  }
  let adT = 0;
  const drawAd = (t) => {
    const hue = (t * 12) % 360, name = BRANDS_H[Math.floor(t / 6) % BRANDS_H.length];
    const grd = adG.createLinearGradient(0, 0, 512, 0);
    grd.addColorStop(0, `hsl(${hue},80%,18%)`); grd.addColorStop(1, `hsl(${(hue + 80) % 360},80%,10%)`);
    adG.fillStyle = grd; adG.fillRect(0, 0, 512, 154);
    adG.fillStyle = '#fff'; adG.font = '600 46px "Segoe UI", sans-serif'; adG.textBaseline = 'middle';
    const x = 512 - ((t * 60) % (512 + adG.measureText(name).width + 40));
    adG.fillText(name, x, 62);
    adG.font = '22px "Yu Gothic", "Meiryo", sans-serif'; adG.fillStyle = `hsl(${(hue + 180) % 360},90%,70%)`;
    adG.fillText('明日はもっと良くなる · TOMORROW, IMPROVED', 16, 122);
    adG.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 154; y += 4) adG.fillRect(0, y, 512, 1);
    adTex.needsUpdate = true;
  };

  return {
    group,
    festival,
    update(time, dt) {
      for (const a of anims) a(time);
      if ((adT -= dt) <= 0) { adT = 0.1; drawAd(time); }
    },
  };
}
