import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from './http.js';

const EXTENSIONES = new Set(['.docx', '.doc', '.xlsx', '.xls', '.pdf', '.jpg', '.jpeg', '.png', '.heic', '.zip', '.txt', '.odt', '.ods']);

fs.mkdirSync(config.uploadsDir, { recursive: true });

export const subida = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    // Nombre interno aleatorio; el original se guarda en la base de datos
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // multer recibe el nombre en latin1; lo pasamos a UTF-8 para conservar tildes
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONES.has(ext)) return cb(new HttpError(400, 'Ese tipo de archivo no se admite. Sube un Word, Excel, PDF, foto o ZIP.'));
    cb(null, true);
  },
});

export function rutaArchivo(nombreInterno) {
  // basename evita que un nombre manipulado salga de la carpeta de subidas
  return path.join(config.uploadsDir, path.basename(nombreInterno));
}

export function borrarArchivo(nombreInterno) {
  if (!nombreInterno) return;
  fs.rm(rutaArchivo(nombreInterno), { force: true }, () => {});
}

export function enviarArchivo(res, nombreInterno, nombreDescarga) {
  const ruta = rutaArchivo(nombreInterno);
  if (!fs.existsSync(ruta)) throw new HttpError(404, 'El archivo ya no está disponible.');
  res.download(ruta, nombreDescarga);
}
