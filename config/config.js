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
