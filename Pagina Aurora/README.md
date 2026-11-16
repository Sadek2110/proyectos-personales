# Aurora Studios

Web premium para **Aurora Studios**, un estudio digital ficticio. Construida con Astro, React, TypeScript, Tailwind CSS y GSAP.

## Requisitos

- Node.js 20+
- npm

## Arranque

```bash
npm install
npm run dev
```

Abre `http://localhost:4321`.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run preview` | Previsualiza el build |
| `npm run check` | Comprueba TypeScript / Astro |

## Estructura

```
src/
  components/   UI y secciones
  data/         Contenido
  layouts/      Layout base (SEO, cursor, preloader)
  pages/        Inicio, contacto, 404
  styles/       Tokens y estilos globales
  utils/        Helpers
public/assets/  Logos, proyectos y fondos
```

## Notas

- Cursor personalizado solo en puntero fino (escritorio).
- `prefers-reduced-motion` desactiva Lenis, GSAP y el preloader.
- El formulario de contacto es front-end (estado de éxito local).
