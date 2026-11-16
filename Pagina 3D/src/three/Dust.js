import * as THREE from 'three';

/* ---------------------------------------------------------------
   Suspended particles.

   Pure depth cue: they parallax against the product as the camera
   moves and give the void a scale. Drift is done in the vertex
   shader, so the CPU never touches the buffer after upload.
   --------------------------------------------------------------- */

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;

  attribute float aSeed;
  attribute float aScale;

  varying float vSeed;

  void main() {
    vSeed = aSeed;

    vec3 p = position;
    float t = uTime * 0.5;
    p.x += cos(t * 0.21 + aSeed * 6.2831) * 0.35;
    p.y += sin(t * 0.17 + aSeed * 4.1) * 0.45;
    p.z += sin(t * 0.13 + aSeed * 2.7) * 0.25;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * aScale * uPixelRatio * (10.0 / -mv.z), 1.0, 22.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying float vSeed;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.06, d) * uOpacity * (0.22 + 0.78 * vSeed);
    gl_FragColor = vec4(uColor, a);
  }
`;

export class Dust {
  constructor(quality) {
    const count = quality.dust;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // a slab wider than it is deep — most motes stay near the product plane
      positions[i * 3 + 0] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 1.5;
      seeds[i] = Math.random();
      scales[i] = 0.35 + Math.random() * 0.9;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 2.6 },
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Color(0xb9b9c6) },
        uOpacity: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  setPixelRatio(dpr) {
    this.material.uniforms.uPixelRatio.value = dpr;
  }

  setOpacity(v) {
    this.material.uniforms.uOpacity.value = v;
  }

  update(elapsed, reducedMotion) {
    if (!reducedMotion) this.material.uniforms.uTime.value = elapsed;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
