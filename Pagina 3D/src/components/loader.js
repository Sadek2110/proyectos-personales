import { gsap } from 'gsap';
import { clamp } from '../utils/math.js';

/* ---------------------------------------------------------------
   Boot overlay. Real progress, not a fake timer: main.js reports
   each step of scene construction, and the last tick only happens
   once a frame has actually been rendered with the shaders compiled.
   --------------------------------------------------------------- */

export function createLoader() {
  const el = document.getElementById('loader');
  const fill = document.getElementById('loaderFill');
  const pct = document.getElementById('loaderPct');
  const proxy = { v: 0 };

  const write = () => {
    fill.style.transform = `scaleX(${proxy.v})`;
    pct.textContent = String(Math.round(proxy.v * 100)).padStart(2, '0');
  };

  write();

  return {
    set(value) {
      gsap.to(proxy, {
        v: clamp(value),
        duration: 0.22,
        ease: 'power2.out',
        onUpdate: write,
      });
    },

    /** resolves once the overlay is gone and the page can scroll */
    finish() {
      return new Promise((resolve) => {
        gsap.to(proxy, {
          v: 1,
          duration: 0.32,
          ease: 'power2.inOut',
          onUpdate: write,
          onComplete: () => {
            el.classList.add('is-done');
            document.body.classList.remove('is-loading');
            el.setAttribute('aria-hidden', 'true');
            setTimeout(resolve, 260);
          },
        });
      });
    },
  };
}
