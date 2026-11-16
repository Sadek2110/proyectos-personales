import * as THREE from 'three';

/* ---------------------------------------------------------------
   The five materials the device is made of. They are shared across
   parts so the whole shell can be dissolved with one uniform write
   when the camera dives into the core.

   Every material is authored `transparent: true` on purpose: three
   bakes the opaque/transparent flag into the shader permutation, so
   flipping it at runtime would recompile mid-scroll and stutter.
   --------------------------------------------------------------- */

export function createMaterials(quality) {
  const glass = quality.transmission
    ? new THREE.MeshPhysicalMaterial({
        // `color` tints everything the glass transmits, so it stays white and
        // all of the smoke comes from Beer-Lambert attenuation over thickness
        color: 0xffffff,
        metalness: 0,
        roughness: 0.06,
        transmission: 0.94,
        thickness: 0.36,
        ior: 1.46,
        attenuationColor: new THREE.Color(0x1b1240),
        attenuationDistance: 0.62,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.35,
        transparent: true,
        side: THREE.FrontSide,
      })
    : // low tier: smoked glass without the transmission render pass
      new THREE.MeshPhysicalMaterial({
        color: 0x0e0e17,
        metalness: 0.15,
        roughness: 0.11,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.9,
        transparent: true,
        opacity: 0.78,
        side: THREE.FrontSide,
      });

  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0x0b0b0d,
    metalness: 0.28,
    roughness: 0.44,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    envMapIntensity: 1,
    transparent: true,
  });

  const chrome = new THREE.MeshStandardMaterial({
    color: 0xc9c9d4,
    metalness: 1,
    roughness: 0.14,
    envMapIntensity: 1.6,
    transparent: true,
  });

  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x33333d,
    metalness: 1,
    roughness: 0.34,
    envMapIntensity: 1.6,
    transparent: true,
    // shared by open shapes (the equator band, the sensor annulus)
    side: THREE.DoubleSide,
  });

  const brushed = new THREE.MeshStandardMaterial({
    color: 0x9a9aa8,
    metalness: 1,
    roughness: 0.34,
    envMapIntensity: 1.75,
    transparent: true,
  });

  const emissiveDot = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(0x7c5cff),
    emissiveIntensity: 2.6,
    roughness: 1,
    metalness: 0,
    transparent: true,
    toneMapped: true,
  });

  const shellSet = [glass, ceramic, chrome, darkMetal, brushed, emissiveDot];
  const baseOpacity = shellSet.map((m) => m.opacity);

  return {
    glass,
    ceramic,
    chrome,
    darkMetal,
    brushed,
    emissiveDot,

    /** 1 = solid product, 0 = fully dissolved (used for the core dive) */
    setShellOpacity(v) {
      for (let i = 0; i < shellSet.length; i++) {
        shellSet[i].opacity = baseOpacity[i] * v;
      }
      // the refraction pass is the single most expensive thing on screen;
      // switch it off entirely once the glass is barely there
      if (quality.transmission) {
        glass.transmission = v < 0.05 ? 0 : 0.92 * v;
      }
    },

    dispose() {
      shellSet.forEach((m) => m.dispose());
    },
  };
}
