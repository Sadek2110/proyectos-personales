import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { crossfade, revealGroup } from '../animation/reveal.js';

/* Section 02 — copy on the left, product parked on the right. */

export function initDesigned() {
  const section = document.getElementById('designed');
  const content = section.querySelector('.col--text');

  crossfade(section, content);
  revealGroup(section, { start: 'top 76%' });

  // the hairlines draw themselves in after the words land
  const rules = section.querySelectorAll('.spec__rule');
  gsap.set(rules, { scaleX: 0 });

  ScrollTrigger.create({
    trigger: section,
    start: 'top 62%',
    once: true,
    onEnter: () =>
      gsap.to(rules, {
        scaleX: 1,
        duration: 0.9,
        ease: 'expo.out',
        stagger: 0.09,
        delay: 0.45,
      }),
  });
}
