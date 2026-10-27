// Configuración general de la aplicación.
// Los valores sensibles se leen del archivo .env (ver .env.example).
import "dotenv/config";

export const PORT = process.env.PORT || 3000;

// En Render (o cualquier servidor) se define NODE_ENV=production
export const EN_PRODUCCION = process.env.NODE_ENV === "production";

// Dirección pública de la aplicación: se usa en los enlaces de los correos
export const URL_APP = (process.env.URL_APP || `http://localhost:${PORT}`).replace(/\/$/, "");

// Cadena de conexión a MongoDB Atlas (base bitacora_pagos, mismo cluster de Horas)
export const MONGODB_URI = process.env.MONGODB_URI;

export const SESSION_SECRET = process.env.SESSION_SECRET;

// _id del documento de la colección configuracion
export const CONFIG_ID = "general";

// Correo. Proveedor "gmail" (API de Gmail, recomendado) o "brevo".
// Si falta la configuración del proveedor, los correos quedan en cola y no se envían.
const vacio = (v) => !v || String(v).includes("<");
export const CORREO = {
  proveedor: (process.env.CORREO_PROVEEDOR || (process.env.GMAIL_REFRESH_TOKEN ? "gmail" : "brevo")).trim().toLowerCase(),
  remitente: (process.env.CORREO_REMITENTE || "").trim().toLowerCase(),
  nombreRemitente: process.env.NOMBRE_REMITENTE || "Bitácora de Pagos",
  // A dónde van las respuestas (p. ej. la administración). Opcional.
  responderA: (process.env.CORREO_RESPONDER_A || "").trim().toLowerCase(),
  // Solo para pruebas: si tiene un correo, TODOS los envíos van a esa dirección
  // (los usuarios de prueba @prueba.gov.co no existen).
  redirigirA: (process.env.CORREO_REDIRIGIR_A || "").trim().toLowerCase(),
  apiKey: process.env.BREVO_API_KEY || "",
  gmail: {
    clientId: (process.env.GMAIL_CLIENT_ID || "").trim(),
    clientSecret: (process.env.GMAIL_CLIENT_SECRET || "").trim(),
    refreshToken: (process.env.GMAIL_REFRESH_TOKEN || "").trim(),
  },
};

// Qué falta para poder enviar (vacío = listo)
export function faltaParaCorreo(c = CORREO) {
  const falta = [];
  if (vacio(c.remitente)) falta.push("CORREO_REMITENTE");
  if (c.proveedor === "gmail") {
    if (vacio(c.gmail.clientId)) falta.push("GMAIL_CLIENT_ID");
    if (vacio(c.gmail.clientSecret)) falta.push("GMAIL_CLIENT_SECRET");
    if (vacio(c.gmail.refreshToken)) falta.push("GMAIL_REFRESH_TOKEN (npm run autorizar-gmail)");
  } else if (c.proveedor === "brevo") {
    if (vacio(c.apiKey)) falta.push("BREVO_API_KEY");
  } else {
    falta.push(`CORREO_PROVEEDOR válido (gmail o brevo, no "${c.proveedor}")`);
  }
  return falta;
}
export const correoActivo = () => faltaParaCorreo().length === 0;

// Se valida aparte para que las pruebas que no usan la base no exijan el .env
export function validarConfiguracion() {
  if (!MONGODB_URI || MONGODB_URI.includes("<")) {
    throw new Error(
      "Falta MONGODB_URI en el archivo .env (copia .env.example y pon el usuario y la clave de Atlas)."
    );
  }
  if (!SESSION_SECRET || SESSION_SECRET.includes("<")) {
    throw new Error("Falta SESSION_SECRET en el archivo .env.");
  }
}
