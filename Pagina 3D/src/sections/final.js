import { gsap } from 'gsap';
import { crossfade, revealGroup } from '../animation/reveal.js';
import { env } from '../utils/env.js';

/* Section 06 — wide shot, negative space, one call to action. */

export function initFinal({ onPulse } = {}) {
  const section = document.getElementById('final');
  const content = section.querySelector('.final');
  const footer = section.querySelector('.footer');
  const button = document.getElementById('experienceBtn');

  // nothing follows, so this panel never fades back out
  crossfade(section, content, { inStart: 'top 88%', inEnd: 'top 52%', fadeOut: false });

  revealGroup(section, { start: 'top 70%', step: 0.12 });

  gsap.set(footer, { opacity: 0 });
  gsap.to(footer, {
    opacity: 1,
    ease: 'none',
    scrollTrigger: { trigger: section, start: 'top 60%', end: 'top 30%', scrub: 0.4 },
  });

  button.addEventListener('click', () => {
    if (onPulse) onPulse();
    window.scrollTo({ top: 0, behavior: env.reducedMotion ? 'auto' : 'smooth' });
  });
}
