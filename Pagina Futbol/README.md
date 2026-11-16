# La Jugada — campo de fútbol 3D con scroll

Experiencia web 3D ambientada en un estadio nocturno. Al hacer scroll, los futbolistas
encadenan dos pases, el extremo conduce y recorta, y la jugada termina en la escuadra ante
la estirada del portero. La cámara sigue el balón, el marcador avanza y el gol activa una
celebración de luz y partículas.

El campo y el balón proceden de Blender. Las gradas, el público, los focos, los jugadores
articulados, el microrelieve del césped, las briznas, la atmósfera, el rastro y los efectos
del gol se generan de forma eficiente en Three.js.

## Arrancar

```bash
npm install      # solo la primera vez
npm run dev      # servidor local (abre la URL que muestra la terminal)
npm run build    # versión final en dist/
npm run preview  # probar la versión de dist/
```

## Estructura

```
index.html            secciones de texto de la página
src/main.js           escena Three.js, ruta del balón y cámaras según el scroll
src/style.css         estilos (marcador, tarjetas, carga)
public/models/        campo.glb exportado desde Blender
blender/
  crear_campo.py      genera el campo, las porterías y el balón optimizado en Blender
  campo_futbol.blend  escena de Blender
  exportar_glb.py     hornea el césped y exporta public/models/campo.glb
  cesped_color.jpg    textura horneada del césped
```

## Ajustar la jugada

En `src/main.js`:

- `path`: puntos por los que pasa el balón, en coordenadas de Blender `B(x, y, altura)`.
  El campo va de x = -52,5 a 52,5 y de y = -34 a 34; la portería de la derecha está en x = 52,5.
- `BALL_TIMELINE`: cuánto avanza el balón según el progreso del scroll.
- `SHOTS`: planos de cámara; los que tienen `follow: true` son relativos al balón.

## Regenerar el modelo desde Blender

```bash
cd blender
blender -b -P crear_campo.py                       # crea campo_futbol.blend (y renders)
blender -b campo_futbol.blend -P exportar_glb.py   # crea ../public/models/campo.glb
```
