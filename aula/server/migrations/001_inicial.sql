-- Esquema inicial. Los IDs de negocio (ALU001, SES001, T01_E01, SES001_ALU001,
-- ALU001_T01_E01_I01) son los mismos que usa el Sheet de seguimiento, para que
-- n8n pueda actualizar por ID sin duplicar filas.

CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  alumno_id     TEXT UNIQUE,                 -- ALU001; solo alumnos
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  rol           TEXT NOT NULL CHECK (rol IN ('admin', 'profesor', 'alumno')),
  estado        TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
  grupo         TEXT,
  observaciones TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invitaciones (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  nombre      TEXT,
  rol         TEXT NOT NULL DEFAULT 'alumno' CHECK (rol IN ('admin', 'profesor', 'alumno')),
  grupo       TEXT,
  tipo        TEXT NOT NULL DEFAULT 'alta' CHECK (tipo IN ('alta', 'reset')),
  creada_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en   TIMESTAMPTZ NOT NULL,
  usada_en    TIMESTAMPTZ
);

CREATE TABLE unidades (
  id     TEXT PRIMARY KEY,                    -- U01
  titulo TEXT NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE temas (
  id           TEXT PRIMARY KEY,              -- T01
  unidad_id    TEXT NOT NULL REFERENCES unidades(id) ON UPDATE CASCADE,
  titulo       TEXT NOT NULL,
  objetivo     TEXT,
  contenido    TEXT NOT NULL DEFAULT '',      -- Markdown
  doc_url      TEXT,                          -- ficha original en Google Docs
  archivo      TEXT,                          -- archivo subido que sustituye a la descarga generada
  archivo_nombre TEXT,
  minutos      INTEGER,
  visible      BOOLEAN NOT NULL DEFAULT true,
  orden        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ejercicios (
  id            TEXT PRIMARY KEY,             -- T01_E01
  tema_id       TEXT NOT NULL REFERENCES temas(id) ON UPDATE CASCADE,
  titulo        TEXT NOT NULL,
  enunciado     TEXT NOT NULL DEFAULT '',     -- Markdown
  entrega       TEXT,                         -- qué tiene que entregar
  minutos       TEXT,
  fecha_limite  DATE,
  doc_url       TEXT,
  visible       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE sesiones (
  id           TEXT PRIMARY KEY,              -- SES001
  fecha        DATE NOT NULL,
  hora_inicio  TIME,
  hora_fin     TIME,
  titulo       TEXT NOT NULL,
  unidad_id    TEXT REFERENCES unidades(id) ON UPDATE CASCADE,
  tema_id      TEXT REFERENCES temas(id) ON UPDATE CASCADE,
  lugar        TEXT,
  estado       TEXT NOT NULL DEFAULT 'planificada' CHECK (estado IN ('planificada', 'cerrada')),
  observaciones TEXT
);

CREATE TABLE eventos (
  id      SERIAL PRIMARY KEY,
  fecha   DATE NOT NULL,
  titulo  TEXT NOT NULL,
  detalle TEXT,
  tipo    TEXT NOT NULL DEFAULT 'aviso' CHECK (tipo IN ('aviso', 'festivo', 'examen'))
);

CREATE TABLE fichajes (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha      DATE NOT NULL,
  entrada    TIMESTAMPTZ NOT NULL,
  salida     TIMESTAMPTZ,
  UNIQUE (usuario_id, fecha)
);

CREATE TABLE asistencia (
  id              TEXT PRIMARY KEY,           -- SES001_ALU001
  sesion_id       TEXT NOT NULL REFERENCES sesiones(id) ON UPDATE CASCADE ON DELETE CASCADE,
  alumno_id       TEXT NOT NULL REFERENCES usuarios(alumno_id) ON UPDATE CASCADE ON DELETE CASCADE,
  estado          TEXT NOT NULL CHECK (estado IN ('Presente', 'Retraso', 'Ausente', 'Justificada')),
  minutos_retraso INTEGER,
  observaciones   TEXT,
  origen          TEXT NOT NULL DEFAULT 'profesor' CHECK (origen IN ('profesor', 'fichaje'))
);

CREATE TABLE resultados (
  id               TEXT PRIMARY KEY,          -- ALU001_T01_E01_I01
  alumno_id        TEXT NOT NULL REFERENCES usuarios(alumno_id) ON UPDATE CASCADE ON DELETE CASCADE,
  ejercicio_id     TEXT NOT NULL REFERENCES ejercicios(id) ON UPDATE CASCADE,
  intento          INTEGER NOT NULL,
  fecha            TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado           TEXT NOT NULL DEFAULT 'Entregado' CHECK (estado IN ('Entregado', 'Revisado')),
  archivo          TEXT,
  archivo_nombre   TEXT,
  archivo_tipo     TEXT,
  mensaje          TEXT,                      -- mensaje del alumno al entregar
  entrega_url      TEXT,                      -- URL en Drive, la rellena n8n
  nivel_autonomia  INTEGER CHECK (nivel_autonomia BETWEEN 1 AND 4),
  nota_10          NUMERIC(4,2) CHECK (nota_10 BETWEEN 0 AND 10),
  dificultad       TEXT,
  accion_refuerzo  TEXT,
  comentario       TEXT,                      -- lo que ve el alumno
  revisado_en      TIMESTAMPTZ,
  UNIQUE (alumno_id, ejercicio_id, intento)
);

-- Cola de eventos hacia n8n. Se reintenta hasta entregarlo; el ID del registro
-- viaja en el payload para que n8n actualice sin duplicar.
CREATE TABLE eventos_n8n (
  id          BIGSERIAL PRIMARY KEY,
  evento      TEXT NOT NULL,
  payload     JSONB NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'error')),
  intentos    INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_en  TIMESTAMPTZ,
  proximo_intento TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX eventos_n8n_pendientes ON eventos_n8n (proximo_intento) WHERE estado <> 'enviado';
CREATE INDEX resultados_alumno ON resultados (alumno_id);
CREATE INDEX asistencia_sesion ON asistencia (sesion_id);
