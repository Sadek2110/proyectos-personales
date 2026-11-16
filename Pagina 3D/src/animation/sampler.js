import { DEFAULT_STATE } from './keyframes.js';
import { easings } from '../utils/math.js';

/* ---------------------------------------------------------------
   Turns the storyboard into a function of scroll position.

   `layout()` resolves every stop to an absolute pixel offset using
   the measured sections, and carries values forward so each stop is
   a complete state. `sample()` then finds the surrounding pair and
   eases between them — no GSAP tween owns the scene, which means
   the 3D can never drift out of sync with the scrollbar.
   --------------------------------------------------------------- */

export const CHANNELS = Object.keys(DEFAULT_STATE);

export class Storyboard {
  constructor(stops) {
    this.stops = stops;
    this.resolved = [];
    this.cursor = 1;
  }

  /**
   * @param {Object} metrics  id -> { top, height } in document pixels
   * @param {number} viewportHeight
   */
  layout(metrics, viewportHeight) {
    const placed = this.stops
      .map((stop) => {
        const m = metrics[stop.section];
        if (!m) return null;
        // the pinned window is the part of the track where the section is
        // actually filling the viewport
        const window = Math.max(1, m.height - viewportHeight);
        return { t: m.top + stop.at * window, ease: stop.ease, values: stop.values };
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);

    let carried = { ...DEFAULT_STATE };
    this.resolved = placed.map((stop) => {
      carried = { ...carried, ...stop.values };
      return { t: stop.t, ease: easings[stop.ease] || easings.inOutCubic, values: carried };
    });

    this.cursor = 1;
    return this.resolved;
  }

  sample(y, out) {
    const stops = this.resolved;
    const n = stops.length;
    if (n === 0) return Object.assign(out, DEFAULT_STATE);

    if (y <= stops[0].t) return Object.assign(out, stops[0].values);
    if (y >= stops[n - 1].t) return Object.assign(out, stops[n - 1].values);

    // scroll is near-monotonic, so walking from the last hit beats a search
    let i = Math.min(Math.max(this.cursor, 1), n - 1);
    while (i > 1 && stops[i - 1].t > y) i--;
    while (i < n - 1 && stops[i].t < y) i++;
    this.cursor = i;

    const a = stops[i - 1];
    const b = stops[i];
    const span = b.t - a.t;
    const t = span <= 0 ? 1 : (y - a.t) / span;
    const e = b.ease(t);

    for (let c = 0; c < CHANNELS.length; c++) {
      const key = CHANNELS[c];
      const from = a.values[key];
      out[key] = from + (b.values[key] - from) * e;
    }
    return out;
  }
}

export const createState = () => ({ ...DEFAULT_STATE });
