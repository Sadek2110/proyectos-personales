import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SECTION_IDS } from './keyframes.js';

/* ---------------------------------------------------------------
   Scroll plumbing.

   Native scrolling only — no hijacking, no virtual scroller. We keep
   a cached scroll position (written from a passive listener, never
   read inside the render loop, so the loop never forces a layout)
   plus the measured geometry of every section track.
   --------------------------------------------------------------- */

export const scrollState = {
  y: 0,
  vh: 0,
  vw: 0,
  metrics: {},
  narrow: false,
};

export function initScroll(onLayout) {
  const elements = {};
  SECTION_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) elements[id] = el;
  });

  const measure = () => {
    scrollState.vh = window.innerHeight;
    scrollState.vw = window.innerWidth;
    scrollState.narrow = window.innerWidth <= 900;
    const offset = window.scrollY;

    for (const id in elements) {
      const el = elements[id];
      const rect = el.getBoundingClientRect();
      scrollState.metrics[id] = { top: rect.top + offset, height: el.offsetHeight };
    }

    if (onLayout) onLayout(scrollState);
  };

  const readScroll = () => {
    scrollState.y = window.scrollY;
  };

  window.addEventListener('scroll', readScroll, { passive: true });
  ScrollTrigger.addEventListener('refresh', measure);

  measure();
  readScroll();

  return { measure, refresh: () => ScrollTrigger.refresh() };
}
