import * as THREE from 'three';

// Exponential height fog for every built-in material: density D·e^(−b·y), integrated exactly
// along the view ray. Thick in the streets, thinning above the rooftops. Import before first render.
// World position comes from mvPosition (not `transformed`) so sprite shaders compile too.
const FALLOFF = '0.012';

THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogWP;\n#endif';
THREE.ShaderChunk.fog_vertex =
  '#ifdef USE_FOG\n vFogWP = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif';
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying vec3 vFogWP;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  vec3 fogRay = vFogWP - cameraPosition;
  float fogDist = length(fogRay);
  #ifdef FOG_EXP2
    float fogFy = fogRay.y * ${FALLOFF};
    float fogK = abs(fogFy) < 1e-3 ? fogDist : fogDist * (1.0 - exp(-fogFy)) / fogFy;
    float fogAmt = fogDensity * (exp(-${FALLOFF} * max(cameraPosition.y, 0.0)) * fogK + fogDist * 0.12);
    float fogFactor = 1.0 - exp(-fogAmt);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, fogDist);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;
