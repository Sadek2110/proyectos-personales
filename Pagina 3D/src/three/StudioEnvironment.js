import * as THREE from 'three';

/* ---------------------------------------------------------------
   Procedural studio environment.

   Instead of shipping an HDRI we build a tiny dark room with four
   emissive panels and pre-filter it through PMREM. That single
   texture is what gives the metal its long specular streaks and the
   glass its soft falloff — it is the difference between "3D shapes"
   and "a photographed product".

   Layout (looking from the camera):
     · a wide white softbox overhead      -> the top highlight
     · a tall violet panel on the left    -> the accent rim
     · a narrow cyan panel on the right   -> the cold counter-rim
     · a dim white panel behind camera    -> the front reflection
   --------------------------------------------------------------- */

function panel(scene, { w, h, color, intensity, position, rotation }) {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  scene.add(mesh);
  return mesh;
}

export function createStudioEnvironment(renderer) {
  const scene = new THREE.Scene();

  // the room itself — almost black, just enough to avoid a void
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(14, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0x07070a, side: THREE.BackSide, toneMapped: false })
  );
  scene.add(room);

  // key softbox, overhead and slightly forward
  panel(scene, {
    w: 7,
    h: 5,
    color: 0xffffff,
    intensity: 3.4,
    position: [0, 5.6, 1.4],
    rotation: [Math.PI / 2, 0, 0],
  });

  // violet accent, left wall
  panel(scene, {
    w: 9,
    h: 3.4,
    color: 0x7c5cff,
    intensity: 2.6,
    position: [-5.6, 0.4, 0],
    rotation: [0, Math.PI / 2, 0],
  });

  // cyan counter-rim, right wall, deliberately weaker
  panel(scene, {
    w: 8,
    h: 2.2,
    color: 0x5ce1e6,
    intensity: 0.45,
    position: [5.6, -0.6, 0],
    rotation: [0, -Math.PI / 2, 0],
  });

  // front fill — reads as the long vertical highlight down the glass
  panel(scene, {
    w: 1.6,
    h: 8,
    color: 0xffffff,
    intensity: 1.35,
    position: [-1.6, 0.6, 6.4],
    rotation: [0, Math.PI, 0],
  });

  // floor bounce, very low
  panel(scene, {
    w: 8,
    h: 8,
    color: 0xb9b2ff,
    intensity: 0.16,
    position: [0, -5.4, 0],
    rotation: [-Math.PI / 2, 0, 0],
  });

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.035, 0.1, 60);

  // the source scene has done its job — nothing below is kept alive
  scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  });
  pmrem.dispose();

  return target.texture;
}
