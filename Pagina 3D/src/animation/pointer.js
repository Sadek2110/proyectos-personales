import { damp } from '../utils/math.js';
import { env } from '../utils/env.js';

/* ---------------------------------------------------------------
   Pointer parallax.

   Two damped values in -1..1. They move the camera by a couple of
   centimetres, never more: the goal is that the product feels like
   it is behind glass, not that it follows the mouse.
   Disabled on touch and under reduced-motion.
   --------------------------------------------------------------- */

export class Pointer {
  constructor(enabled) {
    this.enabled = enabled;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.clientX = -1;
    this.clientY = -1;
    this.inside = false;

    this._onMove = (e) => {
      if (!this.enabled) return;
      this.clientX = e.clientX;
      this.clientY = e.clientY;
      this.inside = true;
      this.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      this.targetY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    this._onLeave = () => {
      this.inside = false;
      this.targetX = 0;
      this.targetY = 0;
    };

    window.addEventListener('pointermove', this._onMove, { passive: true });
    document.addEventListener('pointerleave', this._onLeave, { passive: true });
    window.addEventListener('blur', this._onLeave);
  }

  setEnabled(v) {
    this.enabled = v && !env.reducedMotion;
    if (!this.enabled) this._onLeave();
  }

  update(dt) {
    this.x = damp(this.x, this.enabled ? this.targetX : 0, 3.6, dt);
    this.y = damp(this.y, this.enabled ? this.targetY : 0, 3.6, dt);
  }

  dispose() {
    window.removeEventListener('pointermove', this._onMove);
    document.removeEventListener('pointerleave', this._onLeave);
    window.removeEventListener('blur', this._onLeave);
  }
}
