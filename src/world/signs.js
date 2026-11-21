import * as THREE from 'three';
import { SIGN_SLOTS } from './city.js';

// All brands are invented.
export const BRANDS_H = [
  'KŌSEN DYNAMICS', 'SOMA NOODLE', 'HALCYON BIO', 'YŪREI TEA HOUSE', 'ORBITAL KARAOKE', 'MIRAI PHARMA',
  'VESPER AIRWAYS', 'TOKUMEI BANK', 'LOTUS SYNTHETICS', 'GHOST RAMEN', 'AKARI HOTEL', 'PARALLAX ARCADE',
];
const BRANDS_V = ['ラーメン', '酒場', '夜市', 'ホテル', '電脳', '未来', '薬局', '茶', '雨宿り', 'OPEN', 'BAR', '24H', 'SOMA', '麺', 'カラオケ', '愛'];

const S = 1024, HW = 512, HH = 96, VW = 64, VH = 448, VY = 576;
let atlas = null;

// One canvas atlas: 12 horizontal slots (2×6) on top, 16 vertical slots along the bottom.
export function getAtlas() {
  if (atlas) return atlas;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const panel = (x, y, w, h) => { g.fillStyle = '#121218'; g.fillRect(x + 2, y + 2, w - 4, h - 4); };
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  BRANDS_H.forEach((name, i) => {
    const x = (i % 2) * HW, y = Math.floor(i / 2) * HH;
    panel(x, y, HW, HH);
    g.fillStyle = '#fff'; g.shadowBlur = 10;
    g.font = '600 54px "Segoe UI", sans-serif';
    const k = Math.min(1, (HW - 40) / g.measureText(name).width);
    g.save(); g.translate(x + HW / 2, y + HH / 2); g.scale(k, 1); g.fillText(name, 0, 2); g.restore();
    g.fillRect(x + 14, y + 8, HW - 28, 3); g.fillRect(x + 14, y + HH - 11, HW - 28, 3); // neon tube rails
    g.shadowBlur = 0;
  });
  BRANDS_V.forEach((word, i) => {
    const x = i * VW, chars = [...word], step = Math.min(56, (VH - 20) / chars.length);
    panel(x, VY, VW, VH);
    g.fillStyle = '#fff'; g.shadowBlur = 8;
    g.font = `600 ${Math.round(step * 0.82)}px "Yu Gothic", "Meiryo", "Segoe UI", sans-serif`;
    chars.forEach((ch, j) => g.fillText(ch, x + VW / 2, VY + 10 + step * (j + 0.5)));
    g.shadowBlur = 0;
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const rect = (vertical, slot) => (vertical
    ? [(slot * VW) / S, 1 - (VY + VH) / S, VW / S, VH / S]
    : [((slot % 2) * HW) / S, 1 - (Math.floor(slot / 2) * HH + HH) / S, HW / S, HH / S]);
  atlas = { tex, rect };
  return atlas;
}
if (BRANDS_H.length !== SIGN_SLOTS.h || BRANDS_V.length !== SIGN_SLOTS.v) throw new Error('sign atlas slot mismatch');

// Instanced sign boards. Broken ones flicker; uPulse lets the music make them throb (Phase 4).
export function createSigns(signs, uniforms) {
  const { tex, rect } = getAtlas();
  const n = signs.length;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uPulse = uniforms.uPulse;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRect; attribute float aFlick; varying float vFlick; varying float vPh;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = uv * aRect.zw + aRect.xy; vFlick = aFlick;
        #ifdef USE_INSTANCING
          vPh = instanceMatrix[3].x * 0.11 + instanceMatrix[3].y * 0.7;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uPulse; varying float vFlick; varying float vPh;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float fl = step(0.35, fract(sin(floor(uTime * 9.0 + vPh * 13.0) * 12.9898) * 43758.5453));
        float drop = step(0.08, fract(uTime * 0.13 + vPh));
        diffuseColor.rgb *= mix(1.0, fl * drop, vFlick) * (1.0 + uPulse * 0.35);`);
  };
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, Math.max(1, n));
  mesh.count = n;
  const rects = new Float32Array(n * 4), flick = new Float32Array(n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  signs.forEach((sg, i) => {
    mesh.setMatrixAt(i, m.compose(p.set(sg.x, sg.y, sg.z), q.setFromAxisAngle(up, sg.rotY), s.set(sg.w, sg.h, 1)));
    mesh.setColorAt(i, c.setRGB(sg.color[0] * sg.k, sg.color[1] * sg.k, sg.color[2] * sg.k));
    rects.set(rect(sg.vertical, sg.slot), i * 4);
    flick[i] = sg.flick;
  });
  mesh.geometry.setAttribute('aRect', new THREE.InstancedBufferAttribute(rects, 4));
  mesh.geometry.setAttribute('aFlick', new THREE.InstancedBufferAttribute(flick, 1));
  return mesh;
}
