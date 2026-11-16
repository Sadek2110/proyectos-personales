# NOVA ONE

An interactive 3D product page for a fictional personal-intelligence device.
The object is the page: it is modelled procedurally in Three.js and every
section drives its position, rotation, scale, lighting and camera from the real
scroll position — no scroll hijacking, no virtual scroller.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
```

```bash
npm run build     # -> dist/
npm run preview   # serve the production build on :4173
```

Requires Node 18+. Nothing is fetched at runtime: Inter is bundled from
`@fontsource-variable/inter`, and the product, its environment map and the
atmosphere are all generated in code.

## What is where

| Path                   | What it owns                                                      |
|------------------------|-------------------------------------------------------------------|
| `index.html`           | The document. Real markup, readable without JS.                   |
| `src/three/`           | Renderer, camera, post chain, the product, lights, materials.     |
| `src/animation/`       | The storyboard and everything that reads scroll.                  |
| `src/sections/`        | One controller per section — copy animation only.                 |
| `src/components/`      | Nav and boot loader.                                              |
| `src/styles/`          | Tokens, reset/type, layout, components.                           |
| `DESIGN.md`            | Architecture, the object, camera positions, the scroll timeline.  |

## Tuning it

Everything about the choreography lives in one file: **`src/animation/keyframes.js`**.
Each stop says "at this fraction of this section, the scene looks like this";
anything a stop does not mention carries forward from the previous one. Move a
number there and the whole page follows — the 3D, the atmosphere, the bloom and
the annotation overlay all read from the same sampled state.

In dev, `window.__nova` exposes the live scene plus `__nova.seek(y)` to jump the
whole experience to an absolute scroll offset without easing.

## Notes

* Headings are set in sentence case to match the rest of the type system. The
  brief writes the hero in capitals — `text-transform: uppercase` on
  `.hero__title` in `src/styles/layout.css` is the one-line switch.
* Copy, specifications and the product itself are invented. NOVA ONE does not
  exist and is not modelled on any shipping device.
