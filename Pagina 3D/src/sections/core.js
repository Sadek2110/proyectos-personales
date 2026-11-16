import { crossfade, revealGroup } from '../animation/reveal.js';

/* Section 04 — the camera is inside the device; the type arrives as
   the core opens up and leaves before it closes again. */

export function initCore() {
  const section = document.getElementById('core');
  const content = section.querySelector('.core');

  crossfade(section, content, {
    inStart: 'top 78%',
    inEnd: 'top 34%',
    outStart: 'bottom 52%',
    outEnd: 'bottom 12%',
  });

  revealGroup(section, { start: 'top 62%', step: 0.14 });
}
