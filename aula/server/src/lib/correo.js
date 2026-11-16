import nodemailer from 'nodemailer';
import { config } from '../config.js';

// El envío normal de invitaciones lo hace n8n con su nodo de Gmail (evento invitacion.creada).
// Si además se configura SMTP (por ejemplo, Gmail con contraseña de aplicación), la app
// envía el correo directamente.
const transporte = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

export const smtpConfigurado = () => Boolean(transporte);

export function textoInvitacion({ nombre, enlace, tipo, profesor }) {
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';
  if (tipo === 'reset') {
    return {
      asunto: 'Nueva contraseña para el Aula Conserjería',
      texto: `${saludo}\n\nPara poner una contraseña nueva, abre este enlace:\n${enlace}\n\nEl enlace caduca en 7 días.\n\nCámara de Comercio de Ceuta`,
    };
  }
  return {
    asunto: 'Te invito al curso de Competencias Digitales para conserjería',
    texto: `${saludo}\n\nTe invito al curso de Competencias Digitales para conserjería de la Cámara de Comercio de Ceuta.\n\nPara crear tu cuenta, abre este enlace y elige una contraseña:\n${enlace}\n\nSolo tienes que hacerlo una vez. El enlace caduca en 7 días.\n\nUn saludo,\n${profesor || 'El profesor del curso'}`,
  };
}

export async function enviarCorreo({ para, asunto, texto }) {
  if (!transporte) return false;
  await transporte.sendMail({ from: config.smtp.from, to: para, subject: asunto, text: texto });
  return true;
}
