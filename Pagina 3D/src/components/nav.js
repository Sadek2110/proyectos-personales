import { gsap } from 'gsap';
import { env } from '../utils/env.js';

/* ---------------------------------------------------------------
   Navigation. Anchors stay native (keyboard and back-button keep
   working); the only scripted part is the entrance and a slight
   recede once the hero is behind you.
   --------------------------------------------------------------- */

export function initNav() {
  const nav = document.getElementById('nav');
  const items = nav.querySelectorAll('.nav__mark, .nav__links a, .nav__cta');

  gsap.set(items, { opacity: 0, y: env.reducedMotion ? 0 : -12 });

  const intro = (delay = 0) =>
    gsap.to(items, {
      opacity: 1,
      y: 0,
      duration: env.reducedMotion ? 0.4 : 1,
      ease: 'expo.out',
      stagger: 0.06,
      delay,
    });

  return { intro, element: nav };
}
