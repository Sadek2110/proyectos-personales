import { gsap } from 'gsap';
import { revealNow } from '../animation/reveal.js';
import { env } from '../utils/env.js';

/* Section 01 — the title dissolves upward as the product takes over. */

export function initHero() {
  const section = document.getElementById('hero');
  const content = section.querySelector('.hero');
  const cue = document.getElementById('cue');
  const cueParts = cue.querySelectorAll('.cue__label, .cue__line');

  gsap.set(cueParts, { opacity: 0 });

  gsap.to(content, {
    opacity: 0,
    y: env.reducedMotion ? 0 : -70,
    scale: env.reducedMotion ? 1 : 0.985,
    ease: 'none',
    scrollTrigger: { trigger: section, start: 'top top', end: '46% top', scrub: 0.4 },
  });

  // the cue is the first thing to go — it has done its job by then
  gsap.to(cue, {
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: section, start: 'top top', end: '10% top', scrub: 0.3 },
  });

  return {
    intro() {
      revealNow(section, { delay: 0.1, step: 0.14 });
      gsap.to(cueParts, {
        opacity: 1,
        duration: 1.1,
        ease: 'power2.out',
        stagger: 0.12,
        delay: env.reducedMotion ? 0.2 : 1.15,
      });
    },
  };
}
