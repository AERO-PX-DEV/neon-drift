import * as THREE from 'three';

// Volumetric-looking light cone: apex at the origin, extends down −Y. Additive, fades along its length.
export function makeBeam(length, radius, color, intensity = 0.35) {
  const geo = new THREE.ConeGeometry(radius, length, 24, 1, true).translate(0, -length / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uLen: { value: length }, uInt: { value: intensity } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `uniform float uLen; varying float vV; varying float vEdge;
      void main(){
        vV = -position.y / uLen;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vEdge = abs(dot(n, normalize(cameraPosition - wp.xyz)));
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uInt; varying float vV; varying float vEdge;
      void main(){ float a = pow(1.0 - vV, 1.6) * pow(vEdge, 1.5) * uInt; gl_FragColor = vec4(uColor * a, 1.0); }`,
  });
  return new THREE.Mesh(geo, mat);
}
