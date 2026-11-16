import { crossfade, revealGroup } from '../animation/reveal.js';

/* Section 03 — the copy holds the top-left corner while the product
   comes apart in the middle. Annotations are drawn by the 3D layer,
   not here, because they are anchored to parts rather than to text. */

export function initExploded() {
  const section = document.getElementById('exploded');
  const content = section.querySelector('.col--text');

  crossfade(section, content, {
    inStart: 'top 92%',
    inEnd: 'top 58%',
    outStart: 'bottom 54%',
    outEnd: 'bottom 14%',
  });

  revealGroup(section, { start: 'top 74%' });
}
