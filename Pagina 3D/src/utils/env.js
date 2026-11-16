/* Environment capabilities. Read once at boot, kept live where it matters. */

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarseQuery = window.matchMedia('(pointer: coarse)');

export const env = {
  reducedMotion: motionQuery.matches,
  coarsePointer: coarseQuery.matches,
  get hoverCapable() {
    return !coarseQuery.matches;
  },
};

const listeners = new Set();

motionQuery.addEventListener('change', (e) => {
  env.reducedMotion = e.matches;
  listeners.forEach((fn) => fn(env));
});

coarseQuery.addEventListener('change', (e) => {
  env.coarsePointer = e.matches;
  listeners.forEach((fn) => fn(env));
});

export const onEnvChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
