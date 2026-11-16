/* ---------------------------------------------------------------
   Quality tiers.
   The scene is authored once and then trimmed to fit the device:
   pixel ratio, MSAA, bloom resolution, grain, shadows, transmission
   and dust count all come from here. Nothing about the storyboard
   changes — the experience is identical, only the cost differs.
   --------------------------------------------------------------- */

import { env } from '../utils/env.js';

const TIERS = {
  high: {
    name: 'high',
    dpr: 2,
    msaa: 4,
    bloom: true,
    bloomScale: 0.5,
    grain: true,
    shadows: true,
    shadowSize: 1024,
    transmission: true,
    dust: 700,
    pointer: true,
    sphereSeg: [96, 64],
  },
  mid: {
    name: 'mid',
    dpr: 1.75,
    msaa: 0,
    bloom: true,
    bloomScale: 0.34,
    grain: true,
    shadows: false,
    shadowSize: 512,
    transmission: true,
    dust: 450,
    pointer: true,
    sphereSeg: [72, 48],
  },
  low: {
    name: 'low',
    dpr: 1.5,
    msaa: 0,
    bloom: false,
    bloomScale: 0.3,
    grain: false,
    shadows: false,
    shadowSize: 0,
    transmission: false,
    dust: 220,
    pointer: false,
    sphereSeg: [56, 36],
  },
};

export function detectQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  // deviceMemory is Chromium-only; assume a healthy machine when unknown and
  // let the watchdog demote us if that turns out to be optimistic.
  const memory = navigator.deviceMemory || 8;
  const width = window.innerWidth;

  if (env.coarsePointer || width < 820 || cores <= 4 || memory <= 3) {
    return { ...TIERS.low };
  }
  if (width < 1400 || cores <= 8 || memory <= 4) {
    return { ...TIERS.mid };
  }
  return { ...TIERS.high };
}

/**
 * Rolling FPS watchdog. Fires `onDemote` at most twice, giving the renderer a
 * chance to shed the two most expensive effects before we start cutting pixels.
 */
export class PerfWatchdog {
  constructor(onDemote, { sampleSize = 90, threshold = 45, maxSteps = 3 } = {}) {
    this.onDemote = onDemote;
    this.sampleSize = sampleSize;
    this.threshold = threshold;
    this.maxSteps = maxSteps;
    this.step = 0;
    this.frames = 0;
    this.elapsed = 0;
    this.strikes = 0;
    this.warmup = 60; // ignore the first second (shader compilation, layout)
  }

  update(dt) {
    if (this.step >= this.maxSteps) return;
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }

    this.frames++;
    this.elapsed += dt;
    if (this.frames < this.sampleSize) return;

    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;

    if (fps < this.threshold) {
      this.strikes++;
      if (this.strikes >= 2) {
        this.strikes = 0;
        this.step++;
        this.onDemote(this.step);
      }
    } else {
      this.strikes = 0;
    }
  }
}
