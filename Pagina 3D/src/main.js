import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { detectQuality } from './three/quality.js';
import { Stage } from './three/Stage.js';
import { createStudioEnvironment } from './three/StudioEnvironment.js';
import { createLights } from './three/lights.js';
import { createMaterials } from './three/materials.js';
import { NovaDevice } from './three/NovaDevice.js';
import { Backdrop } from './three/Backdrop.js';
import { Dust } from './three/Dust.js';

import { STOPS } from './animation/keyframes.js';
import { Storyboard, createState } from './animation/sampler.js';
import { initScroll, scrollState } from './animation/scroll.js';
import { Pointer } from './animation/pointer.js';
import { Annotations } from './animation/annotations.js';

import { initSections } from './sections/index.js';
import { initNav } from './components/nav.js';
import { createLoader } from './components/loader.js';

import { clamp, damp } from './utils/math.js';
import { env, onEnvChange } from './utils/env.js';

gsap.registerPlugin(ScrollTrigger);

async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!window.location.hash) window.scrollTo(0, 0);

  const loader = createLoader();
  const quality = detectQuality();

  /* ------------------------- scene ------------------------- */
  const stage = new Stage(document.getElementById('gl'), quality);
  loader.set(0.18);

  stage.scene.environment = createStudioEnvironment(stage.renderer);
  const lights = createLights(stage.scene, quality);
  loader.set(0.42);

  const materials = createMaterials(quality);
  const device = new NovaDevice(quality, materials);
  stage.scene.add(device.group);

  const backdrop = new Backdrop();
  stage.scene.add(backdrop.mesh);

  const dust = new Dust(quality);
  dust.setPixelRatio(stage.dpr);
  stage.scene.add(dust.points);
  loader.set(0.66);

  /* ----------------------- storyboard ---------------------- */
  const storyboard = new Storyboard(STOPS);
  const state = createState();

  const annotations = new Annotations({
    svg: document.getElementById('leaders'),
    host: document.getElementById('labels'),
    device,
  });

  const pointer = new Pointer(quality.pointer && !env.reducedMotion);
  onEnvChange(() => pointer.setEnabled(quality.pointer && !env.reducedMotion));

  /* -------------------------- DOM -------------------------- */
  let pulse = 0;
  const { heroIntro } = initSections({ onPulse: () => (pulse = 1) });
  const nav = initNav();

  initScroll((s) => storyboard.layout(s.metrics, s.vh));

  stage.onResize(() => {
    annotations.measure();
    ScrollTrigger.refresh();
  });
  stage.onDprChange((dpr) => dust.setPixelRatio(dpr));

  /* ------------------------- frame ------------------------- */
  const scrim = document.getElementById('scrim');
  const cameraTarget = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const proxy = new THREE.Sphere(new THREE.Vector3(), 1.25);

  let smoothY = scrollState.y;
  let hover = 0;
  let lastScrim = -1;

  stage.onFrame((dt, elapsed) => {
    // scroll position is read from a cache, so nothing here forces a layout.
    // A jump (anchor link, keyboard End, restored position) is teleported
    // rather than eased — easing across ten sections looks broken, not smooth.
    smoothY =
      Math.abs(scrollState.y - smoothY) > scrollState.vh * 1.5
        ? scrollState.y
        : damp(smoothY, scrollState.y, 8, dt);
    storyboard.sample(smoothY, state);

    const narrow = scrollState.narrow;
    const reduced = env.reducedMotion;

    // narrow viewports stack: the product keeps the upper half of the frame
    const devFX = narrow ? 0 : state.devFX;
    const devY = narrow ? state.devY + state.stackY : state.devY;
    const scale = narrow ? state.scale * state.stackScale : state.scale;
    const camZ = narrow ? state.camZ * 1.06 : state.camZ;

    /* ---- camera ---- */
    pointer.update(dt);
    const parallax = state.shell; // no parallax once we are inside the core
    stage.camera.position.set(
      state.camX + pointer.x * 0.2 * parallax,
      state.camY - pointer.y * 0.13 * parallax,
      camZ
    );
    cameraTarget.set(state.tgtX, state.tgtY, state.tgtZ);
    stage.camera.lookAt(cameraTarget);
    stage.setFov(state.fov);

    /* ---- product placement ---- */
    const distance = Math.max(0.4, camZ - state.devZ);
    const halfWidth =
      Math.tan(THREE.MathUtils.degToRad(state.fov) * 0.5) * distance * stage.aspect;
    const float = reduced ? 0 : Math.sin(elapsed * 0.55) * 0.035;

    device.group.position.set(devFX * halfWidth, devY + float, state.devZ);
    device.group.rotation.set(
      state.rotX + (reduced ? 0 : pointer.y * 0.05 * parallax),
      state.rotY + (reduced ? 0 : pointer.x * 0.08 * parallax),
      state.rotZ + (reduced ? 0 : Math.sin(elapsed * 0.4) * 0.008)
    );
    device.group.scale.setScalar(scale);

    /* ---- cursor over the product ---- */
    if (quality.pointer && pointer.inside && !reduced) {
      ndc.set(
        (pointer.clientX / stage.width) * 2 - 1,
        -(pointer.clientY / stage.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, stage.camera);
      proxy.center.copy(device.group.position);
      proxy.radius = 1.25 * scale;
      hover = damp(hover, raycaster.ray.intersectsSphere(proxy) ? 1 : 0, 5.5, dt);
    } else {
      hover = damp(hover, 0, 5.5, dt);
    }

    /* ---- channels ---- */
    pulse = damp(pulse, 0, 2.4, dt);
    device.setExplode(state.explode);
    device.core.setHover(hover);
    device.update(dt, elapsed, {
      coreIntensity: state.glow + pulse * 1.4,
      coreScale: state.coreScale,
      reducedMotion: reduced,
      camera: stage.camera,
    });

    materials.setShellOpacity(state.shell);
    lights.setExposureFactor(state.light);
    stage.setBloom(state.bloom * (1 + hover * 0.12 + pulse * 0.5));

    backdrop.setIntensity(state.atmo);
    backdrop.setFocus(devFX * 0.85, devY * 0.2);
    backdrop.update(elapsed);

    dust.setOpacity(state.dust);
    dust.update(elapsed, reduced);

    /* ---- overlays (DOM writes only, after every read) ---- */
    const scrimValue = clamp(state.scrim);
    if (Math.abs(scrimValue - lastScrim) > 0.004) {
      scrim.style.opacity = scrimValue.toFixed(3);
      lastScrim = scrimValue;
    }

    device.group.updateMatrixWorld(true);
    annotations.update(stage.camera, stage.width, stage.height, clamp(state.labels));
  });

  // dev-only handle for tuning the look from the console
  if (import.meta.env.DEV) {
    window.__nova = {
      stage,
      device,
      materials,
      lights,
      backdrop,
      dust,
      state,
      quality,
      storyboard,
      /** jump the whole experience to an absolute scroll offset, no easing */
      seek(y) {
        window.scrollTo({ top: y, behavior: 'instant' });
        scrollState.y = y;
        smoothY = y;
        ScrollTrigger.update();
      },
    };
  }

  /* -------------------------- go --------------------------- */
  loader.set(0.86);
  stage.warm();
  stage.start();

  await loader.finish();

  // measurements taken while the body was scroll-locked are now stale
  ScrollTrigger.refresh();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      annotations.measure();
      ScrollTrigger.refresh();
    });
  }

  nav.intro(0.05);
  heroIntro();
}

boot().catch((error) => {
  // never leave the visitor staring at a loading bar that will not move
  console.error('[NOVA] boot failed', error);
  document.body.classList.remove('is-loading');
  const el = document.getElementById('loader');
  if (el) el.classList.add('is-done');
});
