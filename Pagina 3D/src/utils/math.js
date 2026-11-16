/* Small math helpers shared by the scene and the storyboard sampler. */

export const clamp = (v, min = 0, max = 1) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is roughly "how many e-folds per second" — 6 is silky, 14 is snappy.
 */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
};

/* Easings used by the storyboard. Kept as named strings in keyframes.js so the
   timeline stays readable. */
export const easings = {
  linear: (t) => t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
};
