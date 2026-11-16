import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGrainPass } from './passes/GrainPass.js';
import { PerfWatchdog } from './quality.js';
import { env } from '../utils/env.js';

/* ---------------------------------------------------------------
   Renderer, camera, post chain and the single animation loop.

   Everything that costs GPU time is owned here so there is exactly
   one place that can shed load when the watchdog asks for it.
   --------------------------------------------------------------- */

/**
 * The visible viewport, excluding the classic scrollbar. `window.innerWidth`
 * includes it, which would stretch the drawing buffer a few pixels wider than
 * the fixed canvas actually is — enough to skew the aspect ratio and to push
 * screen-projected overlays under the scrollbar.
 */
const viewport = () => ({
  width: document.documentElement.clientWidth,
  height: document.documentElement.clientHeight,
});

export class Stage {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;
    const size = viewport();
    this.width = size.width;
    this.height = size.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, quality.dpr);

    this.usePost = quality.bloom || quality.grain;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.usePost,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x050505, 1);

    if (quality.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = true;
    }

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(32, this.width / this.height, 0.08, 140);
    this.camera.position.set(0, 0, 6.2);
    this.target = new THREE.Vector3(0, 0, 0);

    if (this.usePost) this._buildComposer();

    this._clock = { last: performance.now() / 1000, elapsed: 0 };
    this._resizeQueued = false;
    this._callbacks = { frame: null, resize: null, dpr: null };

    this.watchdog = new PerfWatchdog((step) => this._demote(step));

    this._onResize = () => this._queueResize();
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onResize, { passive: true });

    // context loss should degrade to a black page, never to a JS error storm
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.renderer.setAnimationLoop(null);
    });
  }

  _buildComposer() {
    const rt = new THREE.WebGLRenderTarget(
      Math.round(this.width * this.dpr),
      Math.round(this.height * this.dpr),
      {
        type: THREE.HalfFloatType,
        samples: this.quality.msaa,
      }
    );

    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(this.width, this.height);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    if (this.quality.bloom) {
      const scale = this.quality.bloomScale;
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.width * scale, this.height * scale),
        0.62, // strength — driven by the storyboard from here on
        0.72, // radius
        0.72 // threshold: low enough that the core still blooms through glass
      );
      // UnrealBloomPass halves whatever it is given, so pre-double the request
      // to keep the blur chain at `bloomScale` of the frame instead of 1/2.
      const protoSetSize = UnrealBloomPass.prototype.setSize;
      this.bloomPass.setSize = function (w, h) {
        protoSetSize.call(this, Math.round(w * scale * 2), Math.round(h * scale * 2));
      };
      this.bloomPass.setSize(this.width * this.dpr, this.height * this.dpr);
      this.composer.addPass(this.bloomPass);
    }

    // tone mapping + colour space conversion happen here, not in the materials
    this.composer.addPass(new OutputPass());

    if (this.quality.grain) {
      this.grainPass = createGrainPass();
      this.composer.addPass(this.grainPass);
    }
  }

  onFrame(fn) {
    this._callbacks.frame = fn;
  }

  onResize(fn) {
    this._callbacks.resize = fn;
  }

  onDprChange(fn) {
    this._callbacks.dpr = fn;
  }

  get aspect() {
    return this.width / this.height;
  }

  setFov(fov) {
    if (Math.abs(this.camera.fov - fov) > 0.002) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setBloom(strength) {
    if (this.bloomPass) this.bloomPass.strength = strength;
  }

  start() {
    this.renderer.setAnimationLoop(() => this._tick());
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  _tick() {
    const now = performance.now() / 1000;
    // a tab regaining focus must not teleport the storyboard
    const dt = Math.min(now - this._clock.last, 1 / 20);
    this._clock.last = now;
    this._clock.elapsed += dt;

    if (this._callbacks.frame) this._callbacks.frame(dt, this._clock.elapsed);

    if (this.grainPass) this.grainPass.uniforms.uTime.value = this._clock.elapsed;

    if (this.usePost) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);

    this.watchdog.update(dt);
  }

  /** one render outside the loop — used to warm shaders before the reveal */
  warm() {
    this.renderer.compile(this.scene, this.camera);
    if (this.usePost) this.composer.render(0.016);
    else this.renderer.render(this.scene, this.camera);
  }

  _queueResize() {
    if (this._resizeQueued) return;
    this._resizeQueued = true;
    requestAnimationFrame(() => {
      this._resizeQueued = false;
      this.resize();
    });
  }

  resize() {
    const { width: w, height: h } = viewport();

    // mobile browsers fire resize while the URL bar slides away; reacting to
    // that reallocates every render target for a few pixels of height
    if (env.coarsePointer && w === this.width && Math.abs(h - this.height) < 140) return;
    if (w === this.width && h === this.height) return;

    this.width = w;
    this.height = h;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h, false);
    if (this.usePost) this.composer.setSize(w, h);

    if (this._callbacks.resize) this._callbacks.resize(w, h);
  }

  _setDpr(dpr) {
    if (Math.abs(dpr - this.dpr) < 0.01) return;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    if (this.usePost) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(this.width, this.height);
    }
    if (this._callbacks.dpr) this._callbacks.dpr(dpr);
  }

  /**
   * Called by the watchdog when the frame budget is being missed.
   * Order matters: shed the effects nobody consciously notices before
   * touching resolution, and only kill bloom as a last resort — the core
   * is the whole point of the page.
   */
  _demote(step) {
    if (step === 1 && this.grainPass) {
      this.grainPass.enabled = false;
    } else if (step === 2) {
      this._setDpr(Math.min(this.dpr, 1.25));
      if (this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false;
        this.scene.traverse((o) => {
          if (o.isMesh) o.castShadow = o.receiveShadow = false;
        });
      }
    } else if (step === 3 && this.bloomPass) {
      this.bloomPass.enabled = false;
    }
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    if (this.composer) this.composer.dispose();
    this.renderer.dispose();
  }
}
