/* ---------------------------------------------------------------
   The storyboard.

   One ordered list of stops. Each stop says "at this point of this
   section, the scene looks like this"; anything it does not mention
   is carried over from the previous stop, and `ease` describes how
   we travel *into* it.

   `at` is normalised against the section's pinned window, so the
   whole thing survives any viewport height without a single pixel
   value in this file.

   Channels
     camX/Y/Z    camera position
     tgtX/Y/Z    what the camera looks at
     fov         field of view
     devFX       product offset as a fraction of the half visible width
     devY/devZ   product offset in world units
     rotX/Y/Z    product rotation (radians, continuous — never wraps)
     scale       product scale
     explode     0 assembled ... 1 fully exploded
     glow        core emissive intensity
     coreScale   how far the core is grown out of the product (section 4)
     bloom       bloom strength
     shell       product opacity (0 = camera is inside the core)
     atmo        backdrop intensity
     scrim       DOM radial scrim behind the type
     labels      exploded-view annotation opacity
     dust        particle opacity
     light       analytic light multiplier
     stackY      extra Y offset applied only on narrow viewports
     stackScale  scale multiplier applied only on narrow viewports
   --------------------------------------------------------------- */

export const SECTION_IDS = ['hero', 'designed', 'exploded', 'core', 'interaction', 'final'];

export const DEFAULT_STATE = {
  camX: 0,
  camY: 0.05,
  camZ: 6.2,
  tgtX: 0,
  tgtY: -0.1,
  tgtZ: 0,
  fov: 32,
  devFX: 0,
  devY: -0.4,
  devZ: 0,
  rotX: 0.03,
  rotY: -0.35,
  rotZ: 0,
  scale: 0.8,
  explode: 0,
  glow: 0.8,
  coreScale: 1,
  bloom: 0.6,
  shell: 1,
  atmo: 1,
  scrim: 0,
  labels: 0,
  dust: 0.5,
  light: 1,
  stackY: 0.12,
  stackScale: 0.86,
};

export const STOPS = [
  /* ---------------- 01 · hero ---------------- */
  { section: 'hero', at: 0, values: {} },
  {
    section: 'hero',
    at: 0.55,
    ease: 'inOutSine',
    values: { camZ: 6.0, rotY: 0.0, scale: 0.82, devY: -0.38, glow: 0.85 },
  },
  {
    // the hand-off: grows, turns, slides right, camera steps in
    section: 'hero',
    at: 1,
    ease: 'inOutSine',
    values: {
      camX: 0.16,
      camY: 0.08,
      camZ: 5.55,
      tgtX: 0.05,
      rotX: 0.05,
      rotY: 0.35,
      devFX: 0.2,
      devY: -0.1,
      scale: 0.95,
      glow: 0.95,
      bloom: 0.62,
      stackY: 0.3,
      stackScale: 0.7,
    },
  },

  /* ------------- 02 · designed around you ------------- */
  {
    section: 'designed',
    at: 0.25,
    ease: 'inOutCubic',
    values: {
      camX: 0.02,
      camY: 0.04,
      camZ: 5.2,
      tgtX: 0,
      tgtY: -0.08,
      rotX: 0.06,
      rotY: 0.5,
      devFX: 0.42,
      devY: 0.14,
      scale: 0.9,
      glow: 0.72,
      dust: 0.55,
      stackY: 0.9,
      stackScale: 0.56,
    },
  },
  {
    // slow continuous turn — a different part of the product the whole way down
    section: 'designed',
    at: 1,
    ease: 'linear',
    values: { camY: 0.02, rotY: 0.9, devFX: 0.4, scale: 0.92 },
  },

  /* ---------------- 03 · exploded view ---------------- */
  {
    section: 'exploded',
    at: 0.12,
    ease: 'inOutCubic',
    values: {
      camX: 0.06,
      camY: 0.42,
      camZ: 7.4,
      tgtY: -0.04,
      fov: 31,
      rotX: 0.15,
      rotY: 1.15,
      devFX: 0.05,
      devY: 0.16,
      scale: 0.92,
      explode: 0,
      stackY: 0.72,
      stackScale: 0.5,
    },
  },
  {
    section: 'exploded',
    at: 0.58,
    ease: 'inOutCubic',
    values: { camZ: 7.6, camY: 0.4, rotY: 1.28, explode: 1, labels: 1, glow: 0.85 },
  },
  {
    section: 'exploded',
    at: 0.86,
    ease: 'linear',
    values: { camZ: 7.3, rotY: 1.35, explode: 1, labels: 1 },
  },
  {
    section: 'exploded',
    at: 1,
    ease: 'inOutSine',
    values: { camZ: 6.2, camY: 0.24, tgtY: 0, rotY: 1.42, explode: 0.94, labels: 0, glow: 1 },
  },

  /* ------------------- 04 · the core ------------------- */
  {
    // approach: the shell opens and the camera commits
    section: 'core',
    at: 0.34,
    ease: 'inOutQuint',
    values: {
      camX: 0,
      camY: 0.06,
      camZ: 2.6,
      tgtY: 0.16,
      fov: 38,
      rotX: 0.02,
      rotY: 2.3,
      devFX: 0.04,
      scale: 1.0,
      explode: 0.92,
      shell: 0.32,
      glow: 0.95,
      coreScale: 1.35,
      bloom: 1.0,
      atmo: 0.3,
      scrim: 0.35,
      dust: 0.25,
      light: 0.55,
      stackY: 0,
      stackScale: 0.9,
    },
  },
  {
    // inside
    section: 'core',
    at: 0.66,
    ease: 'inOutSine',
    values: {
      camZ: 1.35,
      tgtY: 0.38,
      fov: 44,
      rotY: 3.9,
      shell: 0,
      glow: 0.62,
      coreScale: 1.7,
      bloom: 0.9,
      atmo: 0.04,
      scrim: 0.6,
      dust: 0.1,
      light: 0.2,
    },
  },
  {
    section: 'core',
    at: 1,
    ease: 'inOutCubic',
    values: {
      camZ: 2.4,
      tgtY: 0.18,
      fov: 40,
      rotY: 4.9,
      shell: 0.22,
      glow: 0.8,
      coreScale: 1.5,
      bloom: 0.85,
      atmo: 0.16,
      scrim: 0.4,
      light: 0.35,
    },
  },

  /* ----------------- 05 · interaction ----------------- */
  {
    // reassembly
    section: 'interaction',
    at: 0.28,
    ease: 'inOutQuint',
    values: {
      camX: -0.1,
      camY: 0.05,
      camZ: 5.55,
      tgtY: -0.06,
      fov: 32,
      rotX: 0.05,
      rotY: 5.5,
      devFX: -0.4,
      devY: 0.24,
      scale: 0.88,
      explode: 0.22,
      shell: 1,
      glow: 0.85,
      coreScale: 1,
      bloom: 0.8,
      atmo: 0.85,
      scrim: 0,
      dust: 0.5,
      light: 1,
      stackY: 1.05,
      stackScale: 0.55,
    },
  },
  {
    section: 'interaction',
    at: 0.62,
    ease: 'inOutCubic',
    values: { rotY: 5.8, explode: 0 },
  },
  {
    section: 'interaction',
    at: 1,
    ease: 'linear',
    values: { camZ: 5.9, rotY: 6.0, devFX: -0.36 },
  },

  /* -------------------- 06 · final -------------------- */
  {
    section: 'final',
    at: 0.4,
    ease: 'inOutCubic',
    values: {
      camX: 0,
      camY: 0.03,
      camZ: 8.4,
      tgtY: -0.05,
      fov: 30,
      rotX: 0.03,
      rotY: 6.28,
      devFX: 0,
      devY: 0.85,
      scale: 0.78,
      glow: 0.72,
      bloom: 0.62,
      atmo: 1,
      dust: 0.55,
      stackY: 0.18,
      stackScale: 0.85,
    },
  },
  {
    section: 'final',
    at: 1,
    ease: 'linear',
    values: { camZ: 8.55, rotY: 6.6 },
  },
];
