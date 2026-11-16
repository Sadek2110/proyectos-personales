import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { env } from '../utils/env.js';

/* ---------------------------------------------------------------
   Type entrances.

   Two primitives, used by every section:
     · revealGroup  — one-shot, line-by-line, when the track enters
     · crossfade    — scrubbed opacity so a sticky panel hands over
                      to the next one instead of cutting

   Triggers always reference the *section track*, never the sticky
   child: ScrollTrigger measures document positions, and a sticky
   element's position is a moving target.
   --------------------------------------------------------------- */

const targetsOf = (el) => {
  const lines = el.querySelectorAll('.line > span');
  return lines.length ? Array.from(lines) : [el];
};

export function prepareReveals(scope = document) {
  scope.querySelectorAll('[data-reveal]').forEach((el) => {
    const targets = targetsOf(el);
    const isLines = targets[0] !== el;
    if (env.reducedMotion) gsap.set(targets, { opacity: 0 });
    else gsap.set(targets, isLines ? { yPercent: 120, opacity: 0 } : { y: 26, opacity: 0 });
  });
}

function playIn(el, { delay = 0, stagger = 0.085 } = {}) {
  const targets = targetsOf(el);
  const isLines = targets[0] !== el;
  const vars = {
    opacity: 1,
    duration: env.reducedMotion ? 0.5 : 1.15,
    ease: 'expo.out',
    delay,
    stagger: isLines ? stagger : 0,
    overwrite: 'auto',
    onComplete: () => el.classList.add('is-revealed'),
  };
  if (!env.reducedMotion) {
    if (isLines) vars.yPercent = 0;
    else vars.y = 0;
  }
  return gsap.to(targets, vars);
}

/** Play immediately — used for the hero once the loader is gone. */
export function revealNow(scope, { delay = 0, step = 0.1 } = {}) {
  const els = Array.from(scope.querySelectorAll('[data-reveal]'));
  els.forEach((el, i) => playIn(el, { delay: delay + i * step }));
}

/** Play once, when the section track reaches `start`. */
export function revealGroup(section, { start = 'top 74%', step = 0.09, delay = 0 } = {}) {
  const els = Array.from(section.querySelectorAll('[data-reveal]'));
  if (!els.length) return;

  ScrollTrigger.create({
    trigger: section,
    start,
    once: true,
    onEnter: () => els.forEach((el, i) => playIn(el, { delay: delay + i * step })),
  });
}

/**
 * Scrubbed opacity for a sticky panel. The in and out ranges never
 * overlap, so two panels are never both fighting for the same pixels.
 */
export function crossfade(
  section,
  content,
  {
    inStart = 'top 94%',
    inEnd = 'top 62%',
    outStart = 'bottom 56%',
    outEnd = 'bottom 16%',
    fadeOut = true,
  } = {}
) {
  gsap.set(content, { opacity: 0 });

  gsap.fromTo(
    content,
    { opacity: 0 },
    {
      opacity: 1,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: { trigger: section, start: inStart, end: inEnd, scrub: 0.4 },
    }
  );

  // the last panel has nothing to hand over to, and a zero-length out range
  // gets clamped to the end of the document — which silently hides it
  if (!fadeOut) return;

  gsap.to(content, {
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: section, start: outStart, end: outEnd, scrub: 0.4 },
  });
}
