import * as THREE from 'three';

/* ---------------------------------------------------------------
   Analytic lights on top of the environment map.
   The env map does the ambient and the reflections; these four only
   shape the form: one key with a soft shadow, two coloured accents
   and a cold back rim to separate the silhouette from the void.
   --------------------------------------------------------------- */

export function createLights(scene, quality) {
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(3.4, 4.6, 5.4);

  if (quality.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.022;
    const c = key.shadow.camera;
    c.near = 2;
    c.far = 18;
    c.left = -2.6;
    c.right = 2.6;
    c.top = 2.6;
    c.bottom = -2.6;
    c.updateProjectionMatrix();
  }
  scene.add(key);

  const violet = new THREE.PointLight(0x7c5cff, 24, 16, 2);
  violet.position.set(-2.8, 1.5, 2.4);
  scene.add(violet);

  const cyan = new THREE.PointLight(0x5ce1e6, 5, 14, 2);
  cyan.position.set(3.3, -1.5, 2.4);
  scene.add(cyan);

  // cold back rim — draws the outline of the shell against the black
  const rim = new THREE.DirectionalLight(0xa8b6ff, 1.5);
  rim.position.set(-2.2, 0.4, -5);
  scene.add(rim);

  const ambient = new THREE.AmbientLight(0x22222f, 1.4);
  scene.add(ambient);

  return {
    key,
    violet,
    cyan,
    rim,
    ambient,
    /** dimmed while the camera is inside the core — the core lights itself */
    setExposureFactor(f) {
      key.intensity = 2.6 * f;
      violet.intensity = 24 * f;
      cyan.intensity = 5 * f;
      rim.intensity = 1.5 * f;
    },
  };
}
