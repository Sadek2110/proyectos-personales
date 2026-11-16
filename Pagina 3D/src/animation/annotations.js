import * as THREE from 'three';

/* ---------------------------------------------------------------
   Exploded-view annotations.

   The labels are DOM, the leader lines are SVG, and both are driven
   by projecting a 3D anchor that belongs to the layer it names — so
   they stay welded to the part as it drifts out and the product
   keeps turning. Nothing here reads layout, it only writes
   transforms, which keeps the whole overlay off the critical path.
   --------------------------------------------------------------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Annotations {
  constructor({ svg, host, device }) {
    this.svg = svg;
    this.host = host;
    this.opacity = -1;
    this._v = new THREE.Vector3();

    this.items = device.annotated.map((layer, index) => {
      const el = document.createElement('div');
      el.className = `label label--${layer.side}`;
      el.innerHTML =
        '<span class="label__inner">' +
        `<span class="label__title">${layer.label}</span>` +
        `<span class="label__meta">${String(index + 1).padStart(2, '0')} — ${layer.meta}</span>` +
        '</span>';
      host.appendChild(el);

      const path = document.createElementNS(SVG_NS, 'path');
      svg.appendChild(path);

      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('r', '5');
      svg.appendChild(ring);

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', '1.6');
      dot.setAttribute('class', 'dot');
      svg.appendChild(dot);

      return { layer, el, path, ring, dot, width: 0 };
    });

    this.measure();
  }

  /** cache label widths so the per-frame clamp never has to read layout */
  measure() {
    this.items.forEach((item) => {
      item.width = item.el.offsetWidth || 150;
    });
  }

  update(camera, width, height, opacity) {
    const visible = opacity > 0.004;

    if (!visible) {
      if (this.opacity !== 0) {
        this.opacity = 0;
        this.svg.style.opacity = '0';
        this.items.forEach((item) => {
          item.el.style.opacity = '0';
        });
      }
      return;
    }

    this.opacity = opacity;
    this.svg.style.opacity = String(opacity);

    // shorter leaders on small screens so nothing runs off the edge
    const compact = width < 760;
    const run = compact ? 26 : 54;
    const tail = compact ? 40 : 78;
    const pad = 14;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const { layer } = item;

      this._v.copy(layer.anchor);
      layer.object.localToWorld(this._v);
      this._v.project(camera);

      // behind the camera, or outside the frustum by a wide margin
      if (this._v.z > 1 || Math.abs(this._v.x) > 1.6 || Math.abs(this._v.y) > 1.6) {
        item.el.style.opacity = '0';
        item.path.setAttribute('d', '');
        item.ring.setAttribute('r', '0');
        item.dot.setAttribute('r', '0');
        continue;
      }

      const sx = (this._v.x * 0.5 + 0.5) * width;
      const sy = (-this._v.y * 0.5 + 0.5) * height;

      const dir = layer.side === 'left' ? -1 : 1;
      const dy = compact ? layer.dy * 0.55 : layer.dy;

      let elbowX = sx + dir * run;
      const elbowY = sy + dy;
      let endX = elbowX + dir * tail;

      // keep the whole label inside the viewport — clamping the leader's end
      // point alone still lets the text itself run off the edge
      const minX = dir < 0 ? item.width + pad : pad;
      const maxX = dir < 0 ? width - pad : width - item.width - pad;
      const clamped = Math.min(Math.max(endX, minX), Math.max(minX, maxX));
      if (clamped !== endX) {
        elbowX += clamped - endX;
        endX = clamped;
      }

      item.path.setAttribute('d', `M${sx.toFixed(1)},${sy.toFixed(1)} L${elbowX.toFixed(1)},${elbowY.toFixed(1)} L${endX.toFixed(1)},${elbowY.toFixed(1)}`);
      item.ring.setAttribute('r', '5');
      item.ring.setAttribute('cx', sx.toFixed(1));
      item.ring.setAttribute('cy', sy.toFixed(1));
      item.dot.setAttribute('r', '1.6');
      item.dot.setAttribute('cx', sx.toFixed(1));
      item.dot.setAttribute('cy', sy.toFixed(1));

      item.el.style.transform = `translate3d(${(endX + dir * 10).toFixed(1)}px, ${elbowY.toFixed(1)}px, 0)`;
      item.el.style.opacity = String(opacity);
    }
  }

  dispose() {
    this.items.forEach((item) => {
      item.el.remove();
      item.path.remove();
      item.ring.remove();
      item.dot.remove();
    });
    this.items = [];
  }
}
