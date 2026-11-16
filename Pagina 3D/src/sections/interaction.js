import { gsap } from 'gsap';
import { crossfade, revealGroup } from '../animation/reveal.js';
import { env } from '../utils/env.js';

/* Section 05 — the product reassembles while the three capabilities
   arrive one at a time, each tied to its own slice of the track. */

export function initInteraction() {
  const section = document.getElementById('interaction');
  const content = section.querySelector('.col--text');

  crossfade(section, content, { outStart: 'bottom 50%', outEnd: 'bottom 12%' });
  revealGroup(section, { start: 'top 76%' });

  const features = section.querySelectorAll('[data-feature]');
  gsap.set(features, { opacity: 0, y: env.reducedMotion ? 0 : 34 });

  features.forEach((feature, i) => {
    gsap.to(feature, {
      opacity: 1,
      y: 0,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section,
        start: `${16 + i * 13}% top`,
        end: `${33 + i * 13}% top`,
        scrub: 0.5,
      },
    });
  });
}
