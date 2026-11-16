import * as THREE from 'three';

/* ---------------------------------------------------------------
   Atmosphere.

   A single plane far behind the product carrying two very soft
   radial pools of light. It is what stops the black from reading as
   an empty canvas — and it dims to nothing while the camera is
   inside the core, so the core is the only light source left.
   Dithered on purpose: 8-bit gradients this dark band badly.
   --------------------------------------------------------------- */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uBase;
  uniform vec2 uCenterA;
  uniform vec2 uCenterB;
  uniform float uAspect;
  uniform float uIntensity;
  uniform float uTime;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 p = (vUv - uCenterA) * vec2(uAspect, 1.0);
    float d2 = dot(p, p);

    vec3 col = uColorA * (exp(-d2 * 42.0) * 0.85 + exp(-d2 * 7.0) * 0.25);

    vec2 q = (vUv - uCenterB) * vec2(uAspect, 1.0);
    col += uColorB * exp(-dot(q, q) * 14.0) * 0.5;

    col += uBase;
    col *= uIntensity;

    // break up the ramp before it reaches an 8-bit buffer
    col += (hash(vUv * 1024.0 + fract(uTime)) - 0.5) * 0.0032;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Backdrop {
  constructor() {
    // sized so the visible slice is about half the plane — any larger and
    // the falloff flattens into a single wash of colour
    const width = 64;
    const height = 34;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uColorA: { value: new THREE.Vector3(0.013, 0.0085, 0.036) },
        uColorB: { value: new THREE.Vector3(0.003, 0.011, 0.013) },
        uBase: { value: new THREE.Vector3(0.0035, 0.0035, 0.005) },
        uCenterA: { value: new THREE.Vector2(0.5, 0.52) },
        uCenterB: { value: new THREE.Vector2(0.68, 0.36) },
        uAspect: { value: width / height },
        uIntensity: { value: 1 },
        uTime: { value: 0 },
      },
      depthWrite: false,
      depthTest: false,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.mesh.position.z = -16;
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  /** `x` and `y` are normalised screen coordinates (-1..1) of the product */
  setFocus(x, y) {
    this.material.uniforms.uCenterA.value.set(0.5 + x * 0.16, 0.52 + y * 0.12);
    this.material.uniforms.uCenterB.value.set(0.66 - x * 0.1, 0.38 + y * 0.08);
  }

  setIntensity(v) {
    this.material.uniforms.uIntensity.value = v;
  }

  update(elapsed) {
    this.material.uniforms.uTime.value = elapsed;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
