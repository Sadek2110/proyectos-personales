import { initHero } from './hero.js';
import { initDesigned } from './designed.js';
import { initExploded } from './exploded.js';
import { initCore } from './core.js';
import { initInteraction } from './interaction.js';
import { initFinal } from './final.js';
import { prepareReveals } from '../animation/reveal.js';

/* Registers every section controller. Each one owns its own copy
   animations and nothing else — the 3D storyboard is separate on
   purpose, so text timing can be tuned without touching the scene. */

export function initSections({ onPulse } = {}) {
  prepareReveals(document);

  const hero = initHero();
  initDesigned();
  initExploded();
  initCore();
  initInteraction();
  initFinal({ onPulse });

  return { heroIntro: hero.intro };
}
