import * as THREE from 'three';
import { lotAt, solidAt } from '../world/city.js';

const insideBuilding = (city, p) => solidAt(lotAt(city, p.x, p.z), p.x, p.y, p.z, 1);

const MODES = ['chase', 'cockpit', 'cinematic'];
const SHOTS = ['orbit', 'flyby', 'side', 'high', 'low'];
const EYE = new THREE.Vector3(-0.42, 0.85, 0.35); // driver's seat (left) in the Blender car

export class CameraRig {
  constructor(camera, car, dom, city) {
    this.camera = camera;
    this.car = car;
    this.city = city;
    this.dom = dom;
    this.mode = 'chase';
    this.lookYaw = 0; this.lookPitch = 0;
    this.tmp = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.qLook = new THREE.Quaternion();
    this.shot = { kind: 'orbit', t: 0, a: 0, anchor: new THREE.Vector3() };
    this.eLook = new THREE.Euler(0, 0, 0, 'YXZ');
    dom.addEventListener('click', () => { if (this.mode === 'cockpit') dom.requestPointerLock?.(); });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.lookYaw = THREE.MathUtils.clamp(this.lookYaw - e.movementX * 0.0025, -1.7, 1.7);
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - e.movementY * 0.0025, -0.8, 0.6);
    });
    camera.position.set(0, 95, 55);
  }

  cycle() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    if (this.mode !== 'cockpit' && document.pointerLockElement) document.exitPointerLock();
    if (this.mode === 'cinematic') { this.shot.t = 0; this.shot.fresh = true; }
    return this.mode;
  }

  setMode(m) { while (this.mode !== m) this.cycle(); }

  // Cinematic: hard cuts between slow shots every ~10 s (orbit, fixed-point flyby, side track, high wide, low).
  newShot() {
    const sh = this.shot, car = this.car, s = Math.sin(car.yaw), c = Math.cos(car.yaw);
    sh.kind = SHOTS[(SHOTS.indexOf(sh.kind) + 1 + Math.floor(Math.random() * (SHOTS.length - 1))) % SHOTS.length];
    sh.t = 9 + Math.random() * 6;
    sh.a = Math.random() * Math.PI * 2;
    sh.side = Math.random() < 0.5 ? -1 : 1;
    sh.fresh = true; // a cut, not a glide
    const ahead = 30 + car.speed * 4; // flyby: wait where the car will be, off to one side
    sh.anchor.set(car.pos.x - s * ahead + c * 14 * sh.side, car.pos.y + 2 + Math.random() * 6, car.pos.z - c * ahead - s * 14 * sh.side);
  }

  cinematic(dt) {
    const { camera: cam, car, shot: sh } = this;
    if ((sh.t -= dt) <= 0) this.newShot();
    const s = Math.sin(car.yaw), c = Math.cos(car.yaw), p = this.tmp;
    if (sh.kind === 'orbit') { sh.a += dt * 0.18; p.set(car.pos.x + Math.cos(sh.a) * 16, car.pos.y + 3.5, car.pos.z + Math.sin(sh.a) * 16); }
    else if (sh.kind === 'flyby') p.copy(sh.anchor);
    else if (sh.kind === 'side') p.set(car.pos.x + c * 12 * sh.side - s * 4, car.pos.y + 1.5, car.pos.z - s * 12 * sh.side - c * 4);
    else if (sh.kind === 'high') p.set(car.pos.x + s * 45, car.pos.y + 28, car.pos.z + c * 45);
    else p.set(car.pos.x - s * 18 + c * 6 * sh.side, car.pos.y - 0.4, car.pos.z - c * 18 - s * 6 * sh.side); // low, well ahead, glancing back (not under the underglow)
    if (sh.kind === 'flyby' || sh.fresh) cam.position.copy(p); else cam.position.lerp(p, 1 - Math.exp(-dt * 3));
    sh.fresh = false;
    for (let i = 0; i < 10 && insideBuilding(this.city, cam.position); i++) cam.position.lerp(car.pos, 0.25);
    if (sh.kind === 'flyby' && cam.position.distanceTo(car.pos) > 140) sh.t = 0;
    cam.lookAt(this.target.copy(car.pos).setY(car.pos.y + 0.6));
    cam.fov = THREE.MathUtils.lerp(cam.fov, sh.kind === 'flyby' ? 38 : sh.kind === 'high' ? 50 : 58, 1 - Math.exp(-dt * 3));
  }

  update(dt) {
    const { camera: cam, car } = this;
    const speed = car.speed;
    if (this.mode === 'cinematic') this.cinematic(dt);
    else if (this.mode === 'chase') {
      const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
      this.tmp.set(car.pos.x + s * 11, car.pos.y + 3.2, car.pos.z + c * 11);
      cam.position.lerp(this.tmp, 1 - Math.exp(-dt * 5));
      // Don't let walls swallow the camera: slide it in toward the car until it's in open air.
      for (let i = 0; i < 10 && insideBuilding(this.city, cam.position); i++) cam.position.lerp(car.pos, 0.25);
      this.target.set(car.pos.x - s * 8, car.pos.y + 1.2, car.pos.z - c * 8);
      cam.lookAt(this.target);
      cam.fov = THREE.MathUtils.lerp(cam.fov, 62 + Math.min(speed, 120) * 0.12, 1 - Math.exp(-dt * 2));
    } else {
      if (document.pointerLockElement !== this.dom) { // drift back to centre when not mouse-looking
        this.lookYaw *= Math.exp(-dt * 1.5); this.lookPitch *= Math.exp(-dt * 1.5);
      }
      car.group.updateMatrixWorld();
      cam.position.copy(car.eye ?? EYE).applyMatrix4(car.group.matrixWorld); // Eye empty in car.blend
      this.qLook.setFromEuler(this.eLook.set(this.lookPitch - 0.05, this.lookYaw, 0));
      cam.quaternion.copy(car.group.quaternion).multiply(this.qLook);
      cam.fov = THREE.MathUtils.lerp(cam.fov, 60, 1 - Math.exp(-dt * 4)); // 72 read as fisheye
    }
    cam.updateProjectionMatrix();
  }
}
