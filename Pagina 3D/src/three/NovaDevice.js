import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Core } from './Core.js';
import { clamp, easings } from '../utils/math.js';

/* ---------------------------------------------------------------
   NOVA ONE — procedural product.

   A vertical rounded disc: two spherical caps meeting at a machined
   equator, with the working parts stacked along local +Z behind the
   glass, and a levitating plinth underneath.

   Every part belongs to a *layer*. A layer knows where it rests,
   where it travels to when the product is exploded, and (optionally)
   where its annotation should be anchored. That single list is what
   section 3 animates.
   --------------------------------------------------------------- */

const RADIUS = 1.0;
const CAP_DEPTH = 0.24;

/** Hemisphere pointing down local +Z (dir 1) or -Z (dir -1). */
function capGeometry(radius, depth, seg, dir) {
  const g = new THREE.SphereGeometry(
    1,
    seg[0],
    Math.max(14, Math.round(seg[1] * 0.6)),
    0,
    Math.PI * 2,
    0,
    Math.PI / 2
  );
  // the pole runs along +Y before we tip it over, so Y carries the depth
  g.scale(radius, depth, radius);
  g.rotateX((dir > 0 ? 1 : -1) * (Math.PI / 2));
  return g;
}

function ringGeometry(radius, tube, radialSeg) {
  return new THREE.TorusGeometry(radius, tube, 6, radialSeg);
}

export class NovaDevice {
  constructor(quality, materials) {
    this.quality = quality;
    this.materials = materials;
    this.group = new THREE.Group();
    this.layers = [];
    this.boundsRadius = 1.25;

    const seg = quality.sphereSeg;
    const ringSeg = quality.name === 'low' ? 64 : 128;
    const shadows = quality.shadows;

    /* ---------------- layer 1 — glass shell ---------------- */
    const shellFront = new THREE.Mesh(
      capGeometry(RADIUS, CAP_DEPTH, seg, 1),
      materials.glass
    );
    shellFront.castShadow = false; // transmissive: a cast shadow would read as a blob
    this._layer('shellFront', shellFront, [0, 0, 0.005], [0, 0.34, 1.5], { stagger: 0 });

    /* ---------------- layer 2 — spatial sensors ---------------- */
    const sensors = new THREE.Group();

    const annulus = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.585, ringSeg),
      materials.darkMetal
    );
    sensors.add(annulus);

    const sensorRing = new THREE.Mesh(ringGeometry(0.585, 0.012, ringSeg), materials.chrome);
    sensors.add(sensorRing);

    // three emitters at 90 / 210 / 330 degrees, merged into one draw call
    const dotGeometries = [];
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      const g = new THREE.SphereGeometry(0.021, 12, 8);
      g.translate(Math.cos(a) * 0.585, Math.sin(a) * 0.585, 0.014);
      dotGeometries.push(g);
    }
    const dots = new THREE.Mesh(mergeGeometries(dotGeometries), materials.emissiveDot);
    dotGeometries.forEach((g) => g.dispose());
    sensors.add(dots);

    if (shadows) {
      annulus.castShadow = true;
      sensorRing.castShadow = true;
    }

    this._layer('sensors', sensors, [0, 0, 0.1], [0.05, 0.16, 0.86], {
      stagger: 0.06,
      spin: -0.32,
      anchor: [0.414, 0.414, 0.02],
      label: 'Spatial Sensors',
      meta: '9 × time-of-flight',
      side: 'right',
      dy: -78,
    });

    /* ---------------- layer 3 — adaptive processor ---------------- */
    const processor = new THREE.Group();

    const board = new THREE.Mesh(
      new THREE.CylinderGeometry(0.66, 0.66, 0.04, ringSeg / 2, 1),
      materials.brushed
    );
    board.rotation.x = Math.PI / 2;
    processor.add(board);

    const traceGeometries = [0.3, 0.44, 0.58].map((r) => {
      const g = ringGeometry(r, 0.005, ringSeg);
      g.translate(0, 0, 0.024);
      return g;
    });
    const traces = new THREE.Mesh(mergeGeometries(traceGeometries), materials.chrome);
    traceGeometries.forEach((g) => g.dispose());
    processor.add(traces);

    const screwGeometries = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6 + Math.PI / 6;
      const g = new THREE.CylinderGeometry(0.018, 0.018, 0.055, 10);
      g.rotateX(Math.PI / 2);
      g.translate(Math.cos(a) * 0.615, Math.sin(a) * 0.615, 0.01);
      screwGeometries.push(g);
    }
    const screws = new THREE.Mesh(mergeGeometries(screwGeometries), materials.darkMetal);
    screwGeometries.forEach((g) => g.dispose());
    processor.add(screws);

    if (shadows) {
      board.castShadow = true;
      board.receiveShadow = true;
    }

    this._layer('processor', processor, [0, 0, -0.02], [-0.06, -0.04, 0.34], {
      stagger: 0.12,
      spin: 0.46,
      anchor: [-0.47, -0.44, 0.04],
      label: 'Adaptive Processor',
      meta: '18 TOPS · on device',
      side: 'left',
      dy: 62,
    });

    /* ---------------- layer 4 — neural core ---------------- */
    this.core = new Core(quality);
    this._layer('core', this.core.group, [0, 0, 0], [0, 0, 0], {
      stagger: 0,
      anchor: [0.2, 0.17, 0.16],
      label: 'Neural Core',
      meta: 'Always on',
      side: 'right',
      dy: 34,
    });

    /* ---------------- layer 5 — structural frame ---------------- */
    const frame = new THREE.Group();

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(1.004, 1.004, 0.132, seg[0], 1, true),
      materials.darkMetal
    );
    band.rotation.x = Math.PI / 2;
    frame.add(band);

    const edgeGeometries = [0.066, -0.066].map((z) => {
      const g = ringGeometry(1.006, 0.0075, seg[0]);
      g.translate(0, 0, z);
      return g;
    });
    const edges = new THREE.Mesh(mergeGeometries(edgeGeometries), materials.chrome);
    edgeGeometries.forEach((g) => g.dispose());
    frame.add(edges);

    if (shadows) {
      band.castShadow = true;
      edges.castShadow = true;
    }

    this._layer('frame', frame, [0, 0, 0], [0, -0.18, -0.44], { stagger: 0.1 });

    /* ---------------- layer 6 — ceramic back ---------------- */
    const shellBack = new THREE.Mesh(capGeometry(RADIUS, CAP_DEPTH, seg, -1), materials.ceramic);
    if (shadows) {
      shellBack.castShadow = true;
      shellBack.receiveShadow = true;
    }
    this._layer('shellBack', shellBack, [0, 0, -0.005], [0, -0.34, -1.05], { stagger: 0.16 });

    /* ---------------- layer 7 — acoustic base ---------------- */
    const base = new THREE.Group();

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.8, 0.1, ringSeg / 2, 1),
      materials.darkMetal
    );
    base.add(plinth);

    const lip = new THREE.Mesh(ringGeometry(0.7, 0.008, ringSeg), materials.chrome);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.05;
    base.add(lip);

    const glowLine = new THREE.Mesh(ringGeometry(0.756, 0.004, ringSeg), materials.emissiveDot);
    glowLine.rotation.x = Math.PI / 2;
    glowLine.position.y = -0.012;
    base.add(glowLine);

    if (shadows) {
      plinth.receiveShadow = true;
      plinth.castShadow = true;
    }

    this._layer('base', base, [0, -1.34, 0], [0, -0.28, -1.24], {
      stagger: 0.22,
      anchor: [-0.62, 0.02, 0.26],
      label: 'Acoustic Layer',
      meta: '360° dispersion',
      side: 'left',
      dy: 46,
    });

    this.annotated = this.layers.filter((l) => l.label);
  }

  _layer(id, object, rest, offset, opts = {}) {
    object.position.set(rest[0], rest[1], rest[2]);
    this.group.add(object);

    const layer = {
      id,
      object,
      rest: new THREE.Vector3(rest[0], rest[1], rest[2]),
      offset: new THREE.Vector3(offset[0], offset[1], offset[2]),
      stagger: opts.stagger ?? 0,
      spin: opts.spin ?? 0,
      baseSpin: object.rotation.z,
      anchor: opts.anchor ? new THREE.Vector3(...opts.anchor) : null,
      label: opts.label ?? null,
      meta: opts.meta ?? null,
      side: opts.side ?? 'right',
      dy: opts.dy ?? 0,
    };
    this.layers.push(layer);
    return layer;
  }

  /**
   * 0 = assembled product, 1 = full exploded view.
   * Layers leave in sequence rather than all at once — the stagger is what
   * makes it read as disassembly instead of a scale-up.
   */
  setExplode(t) {
    const amount = clamp(t);
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const span = 1 - layer.stagger;
      const local = easings.inOutCubic(clamp((amount - layer.stagger) / span));
      layer.object.position.set(
        layer.rest.x + layer.offset.x * local,
        layer.rest.y + layer.offset.y * local,
        layer.rest.z + layer.offset.z * local
      );
      if (layer.spin) layer.object.rotation.z = layer.baseSpin + layer.spin * local;
    }
  }

  update(dt, elapsed, { coreIntensity, coreScale = 1, reducedMotion, camera }) {
    this.core.setScale(coreScale);
    this.core.update(dt, elapsed, coreIntensity, reducedMotion);
    this.core.faceCamera(camera);
  }

  dispose() {
    this.core.dispose();
    this.group.traverse((o) => {
      if (o.isMesh || o.isLineSegments) o.geometry.dispose();
    });
  }
}
