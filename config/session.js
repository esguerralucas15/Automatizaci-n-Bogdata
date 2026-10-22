import session from "express-session";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import { SESSION_SECRET, EN_PRODUCCION } from "./config.js";

const DURACION_SESION_SEG = 10 * 60 * 60; // 10 horas: una jornada laboral

// Igual que en Horas-Compensacion: las sesiones se guardan en la colección
// "sessions" reutilizando la conexión de Mongoose. En la sesión solo se guarda
// { correo, nombre, rol }.
export default session({
  name: "bitacora.sid",
  secret: SESSION_SECRET,
  store: MongoStore.create({
    clientPromise: mongoose.connection.asPromise().then((conexion) => conexion.getClient()),
    collectionName: "sessions",
    ttl: DURACION_SESION_SEG,
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: EN_PRODUCCION,
    maxAge: DURACION_SESION_SEG * 1000,
  },
});
