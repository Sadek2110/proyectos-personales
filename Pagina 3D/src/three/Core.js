import * as THREE from 'three';

/* ---------------------------------------------------------------
   The luminous core.

   Three parts: an emissive sphere whose fragment colour deliberately
   exceeds 1.0 so the bloom threshold catches it, a camera-facing
   halo for the volumetric bleed, and a thin wireframe cage plus two
   rings that give the light something to be measured against.
   --------------------------------------------------------------- */

const coreVertex = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vObjectNormal;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    vObjectNormal = normal;
    gl_Position = projectionMatrix * mv;
  }
`;

const coreFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uPulse;
  uniform vec3 uInner;
  uniform vec3 uOuter;

  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vObjectNormal;

  void main() {
    float facing = clamp(dot(normalize(vNormalView), normalize(vViewDir)), 0.0, 1.0);
    float centre = pow(facing, 4.0);

    // cheap sine bands read as slow convection; the second, faster set only
    // becomes visible when the core is scaled up to fill the frame
    vec3 n = vObjectNormal;
    float plasma =
      sin(n.x * 6.2 + uTime * 0.70) *
      sin(n.y * 5.4 - uTime * 0.52) *
      sin(n.z * 4.8 + uTime * 0.63);
    float detail = sin(n.x * 13.0 - uTime * 0.9) * sin(n.y * 11.0 + uTime * 0.66);

    vec3 col = mix(uOuter, uInner, centre);
    col *= 0.84 + 0.16 * plasma + 0.07 * detail;
    col *= uIntensity * uPulse;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const haloVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const haloFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float falloff = pow(clamp(1.0 - d, 0.0, 1.0), 3.0);
    float a = falloff * uOpacity;
    gl_FragColor = vec4(uColor * falloff * uIntensity, a);
  }
`;

export class Core {
  constructor(quality) {
    this.group = new THREE.Group();
    this.quality = quality;
    this.hover = 0;

    const seg = quality.name === 'low' ? [32, 24] : [64, 48];

    this.material = new THREE.ShaderMaterial({
      vertexShader: coreVertex,
      fragmentShader: coreFragment,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uPulse: { value: 1 },
        uInner: { value: new THREE.Vector3(2.9, 2.6, 3.6) },
        uOuter: { value: new THREE.Vector3(0.45, 0.22, 1.15) },
      },
    });

    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(0.18, seg[0], seg[1]), this.material);
    this.group.add(this.sphere);

    // camera-facing bleed
    this.haloMaterial = new THREE.ShaderMaterial({
      vertexShader: haloVertex,
      fragmentShader: haloFragment,
      uniforms: {
        uColor: { value: new THREE.Color(0x7c5cff) },
        uIntensity: { value: 1 },
        uOpacity: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.haloMaterial);
    this.halo.scale.setScalar(1.7);
    this.group.add(this.halo);

    // containment cage
    const cageGeometry = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.255, 1));
    this.cageMaterial = new THREE.LineBasicMaterial({
      color: 0x7c5cff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    this.cage = new THREE.LineSegments(cageGeometry, this.cageMaterial);
    this.group.add(this.cage);

    // two gyroscope rings
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x8f77ff).multiplyScalar(1.35),
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    const ringGeometry = new THREE.TorusGeometry(0.295, 0.003, 6, quality.name === 'low' ? 64 : 128);
    this.ringA = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.ringB = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.ringA.rotation.set(0.6, 0.2, 0);
    this.ringB.rotation.set(-0.35, 1.1, 0.4);
    this.group.add(this.ringA, this.ringB);
  }

  /** 0..1, raised while the pointer is over the device */
  setHover(v) {
    this.hover = v;
  }

  /** the core grows to fill the frame in section 4 rather than the camera
      flying through the surface of an emissive sphere, which renders as a
      flat wall of colour from the inside */
  setScale(v) {
    this.group.scale.setScalar(v);
  }

  update(dt, elapsed, intensity, reducedMotion) {
    const boost = 1 + this.hover * 0.28;
    const pulse = reducedMotion
      ? 1
      : 0.94 + 0.06 * Math.sin(elapsed * 0.85) + 0.022 * Math.sin(elapsed * 2.15);

    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uPulse.value = pulse;
    this.material.uniforms.uIntensity.value = intensity * boost;

    // the halo only earns its cost once the core is actually bright
    // the billboard is the no-bloom fallback only: where the post chain runs,
    // real bloom around the emissive sphere looks like light, this looks like
    // a grey disc pasted behind the glass
    const haloAmount = this.quality.bloom ? 0 : Math.max(0, intensity - 0.35) * boost;
    this.haloMaterial.uniforms.uIntensity.value = haloAmount * 0.75;
    this.haloMaterial.uniforms.uOpacity.value = Math.min(0.9, haloAmount * 0.42);
    this.halo.scale.setScalar(1.5 + haloAmount * 1.35);

    this.cageMaterial.opacity = 0.04 + Math.min(0.16, intensity * 0.06);
    this.ringMaterial.opacity = 0.22 + Math.min(0.45, intensity * 0.22);

    if (!reducedMotion) {
      this.cage.rotation.y += dt * 0.09;
      this.cage.rotation.x += dt * 0.05;
      this.ringA.rotation.z += dt * 0.16;
      this.ringB.rotation.x += dt * 0.11;
    }
  }

  /**
   * The halo is a billboard, but it lives inside a group that rotates and
   * tilts, so the camera orientation has to be brought back into local space.
   */
  faceCamera(camera) {
    if (!this._parentQuat) {
      this._parentQuat = new THREE.Quaternion();
      this._cameraQuat = new THREE.Quaternion();
    }
    this.halo.parent.getWorldQuaternion(this._parentQuat).invert();
    camera.getWorldQuaternion(this._cameraQuat);
    this.halo.quaternion.copy(this._parentQuat).multiply(this._cameraQuat);
  }

  dispose() {
    this.sphere.geometry.dispose();
    this.halo.geometry.dispose();
    this.cage.geometry.dispose();
    this.ringA.geometry.dispose();
    this.material.dispose();
    this.haloMaterial.dispose();
    this.cageMaterial.dispose();
    this.ringMaterial.dispose();
  }
}
