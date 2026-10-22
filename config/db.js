// Conexión a MongoDB Atlas con Mongoose
import mongoose from "mongoose";
import { MONGODB_URI } from "./config.js";
import Usuario from "../models/Usuario.js";
import Tramite from "../models/Tramite.js";
import Evento from "../models/Evento.js";
import Notificacion from "../models/Notificacion.js";
import Configuracion from "../models/Configuracion.js";
import Contador from "../models/Contador.js";

mongoose.set("strictQuery", true);

mongoose.connection.on("disconnected", () => console.warn("MongoDB desconectado"));
mongoose.connection.on("reconnected", () => console.log("MongoDB reconectado"));
mongoose.connection.on("error", (err) => console.error("Error de MongoDB:", err.message));

export async function conectarDB(uri = MONGODB_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  // Crea las colecciones e índices declarados en los modelos si todavía no existen.
  // Las colecciones se crean antes de usarlas porque dentro de una transacción
  // MongoDB no puede crear colecciones nuevas.
  const modelos = [Usuario, Tramite, Evento, Notificacion, Configuracion, Contador];
  for (const modelo of modelos) await modelo.createCollection().catch(() => {});
  await Promise.all(modelos.map((m) => m.init()));

  console.log(`MongoDB conectado a la base "${mongoose.connection.name}"`);
  return mongoose.connection;
}

export async function desconectarDB() {
  await mongoose.disconnect();
}
