# NOVA ONE — Architecture & storyboard

Written before implementation, as the brief asks, and kept in sync with the
final values in `src/animation/keyframes.js`.

## 1. Architecture

Vite + Three.js (vanilla, ES modules) + GSAP/ScrollTrigger. No external assets:
geometry, materials, the lighting environment and the typeface are either
procedural or self-hosted, so the demo runs offline on first load.

    index.html            real semantic markup (works, and reads, without JS)
    src/main.js           bootstrap: quality -> scene -> sections -> one loop
    src/three/            Stage (renderer/camera/composer/loop), StudioEnvironment,
                          lights, materials, NovaDevice, Core, Backdrop, Dust, quality
    src/three/passes/     GrainPass (grain + vignette + chromatic aberration)
    src/animation/        scroll (metrics), keyframes (the storyboard), sampler,
                          pointer, reveal, annotations
    src/components/       nav, loader
    src/sections/         one controller per section — copy animation only
    src/styles/           tokens, base, layout, components
    src/utils/            math (damp/easings), env (reduced-motion, coarse pointer)

**One source of truth for the render.** Scroll position produces a pixel offset,
`sampler` interpolates the storyboard at that offset, and the render loop damps
the current state toward it. No tween owns the scene, so the 3D can never drift
out of sync with the scrollbar. GSAP/ScrollTrigger governs everything in the DOM.

Read-then-write discipline in the loop: the scroll position is served from a
cache written by a passive listener, so the frame never forces a layout, and all
DOM writes (scrim opacity, annotation transforms) happen after every read.

## 2. The object — NOVA ONE

A vertical rounded disc, radius 1.0, depth 0.48, radially symmetric about local
Z. Seven separable layers, front to back:

| # | Layer          | Geometry                          | Material                       | Label              |
|---|----------------|-----------------------------------|--------------------------------|--------------------|
| 1 | Glass shell    | flattened spherical cap           | smoked glass (transmission)    | —                  |
| 2 | Sensor ring    | annulus + ring + 3 emitters       | dark anodised metal            | Spatial Sensors    |
| 3 | Processor      | disc, 3 concentric traces, screws | brushed metal (metalness 1)    | Adaptive Processor |
| 4 | Neural core    | shader sphere + cage + 2 rings    | emissive, above 1.0 for bloom  | Neural Core        |
| 5 | Frame          | equator band + 2 chrome edges     | dark metal + polished chrome   | —                  |
| 6 | Ceramic back   | flattened spherical cap           | soft-touch ceramic             | —                  |
| 7 | Acoustic base  | levitating plinth + glow line     | dark metal + violet emissive   | Acoustic Layer     |

~24k triangles, zero textures. Lighting comes from a PMREM environment built at
runtime (a dark box with four emissive panels: white key overhead, violet left,
cyan right, white front fill) plus one shadowed directional key, two coloured
point lights and a cold back rim.

Two details that carry most of the realism:

* the glass keeps a **white base colour** — `color` multiplies whatever the
  material transmits, so a dark tint would extinguish the core behind it. The
  smoke comes from Beer-Lambert attenuation over thickness instead.
* the core's fresnel is **inverted and steep** (`pow(facing, 4.0)`): hot white
  only at the centre, violet everywhere else. A conventional rim-bright fresnel
  pushes the whole sphere above 1.0 and bloom turns it into a shapeless blob.

## 3. Camera

FOV 32 at rest, 44 at the core. Horizontal offsets are expressed as a **fraction
of the half visible width**, not in world units, so the framing is identical on
21:9 and on a phone. On viewports ≤900px the product keeps the top of the frame
and the copy stacks underneath (`stackY` / `stackScale` per stop).

| Moment            | cam (x, y, z)      | target        | fov |
|-------------------|--------------------|---------------|-----|
| Hero              | 0.00, 0.05, 6.20   | 0, -0.10, 0   | 32  |
| Hand-off          | 0.16, 0.08, 5.55   | 0.05, -0.10   | 32  |
| Designed          | 0.02, 0.04, 5.20   | 0, -0.08, 0   | 32  |
| Exploded          | 0.06, 0.42, 7.40   | 0, -0.04, 0   | 31  |
| Core approach     | 0.00, 0.06, 2.60   | 0, 0.16, 0    | 38  |
| Core peak         | 0.00, 0.06, 1.35   | 0, 0.38, 0    | 44  |
| Reconstruction    | -0.10, 0.05, 5.55  | 0, -0.06, 0   | 32  |
| Final             | 0.00, 0.03, 8.40   | 0, -0.05, 0   | 30  |

## 4. Scroll timeline (≈10.5 viewport heights)

| Scroll  | Section     | Object                                       | Camera          |
|---------|-------------|----------------------------------------------|-----------------|
| 0–16%   | Hero        | centred low, slow turn, float                | far, static     |
| 16–32%  | Designed    | grows, turns to 3/4, slides right            | steps in        |
| 32–53%  | Exploded    | 7 layers fan across the frame + annotations  | pulls back/up   |
| 53–68%  | Core        | shell dissolves, core grows to fill the frame| dives in        |
| 68–85%  | Interaction | reassembles, moves left                      | back out        |
| 85–100% | Final       | wide shot, facing the viewer                 | far             |

**Rotation is one full revolution across the page**, and the fast 250° of it is
spent between 53% and 68% — while the camera is inside a dissolved shell and
nobody can see the product spin:

    hero -0.35 -> 0.42 | designed 0.5 -> 0.9 | exploded 1.15 -> 1.42
    core 2.3 -> 4.9 (hidden) | interaction 5.5 -> 6.0 | final 6.28 -> 6.6 rad

Exploded view sits at ~1.2 rad (about 70°) on purpose: the layer stack travels
along local +Z, so at that angle it fans *across* the frame instead of straight
at the lens, and the faces stay readable.

Stops are placed at a fraction of each section's **pinned window**, so the file
contains no pixel values and the timeline survives any viewport height. The gaps
between one section's last stop and the next section's first are a full viewport
of scroll — that is what makes the sections blend rather than cut.

## 5. Performance

Three profiles (`src/three/quality.js`), chosen from pointer type, width, cores
and memory, with automatic demotion if the rolling FPS drops below 45.

|                  | high | mid  | low                          |
|------------------|------|------|------------------------------|
| devicePixelRatio | 2    | 1.75 | 1.5                          |
| MSAA             | 4x   | off  | off (renderer AA instead)    |
| Bloom            | 1/2  | 1/3  | off — additive halo fallback |
| Grain / vignette | yes  | yes  | no                           |
| Shadows          | 1024 | off  | off                          |
| Transmission     | yes  | yes  | off (tinted opaque glass)    |
| Dust motes       | 700  | 450  | 220                          |
| Pointer parallax | yes  | yes  | off                          |

Demotion order is deliberate: grain first (nobody consciously notices), then
pixel ratio and shadows, and bloom only as a last resort — the core is the point
of the page.

## 6. Accessibility

`prefers-reduced-motion` removes idle float, pointer parallax, dust drift, core
pulse and ring rotation, and turns line reveals into short fades; the
scroll-driven 3D remains because the user is the one driving it. Native anchors,
a skip link, visible focus rings, real heading order, and a `<noscript>` fallback
that unlocks scrolling and renders the page as a plain document.
