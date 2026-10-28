// Parámetros editables sin tocar el código (un solo documento, como en Horas).
import mongoose from "mongoose";
import { CONFIG_ID } from "../config/config.js";
import { CORREO } from "./roles.js";

const { Schema, model } = mongoose;

const copiaSchema = new Schema(
  {
    correo: { type: String, required: true, lowercase: true, trim: true, match: CORREO },
    nombre: { type: String, default: "" },
    // Qué correos recibe: "Todos" o la descripción que dio el área (p. ej. "Liberación para pago")
    recibe: { type: String, default: "Todos" },
    // Opcional: solo recibe copia de los trámites dirigidos a esta subsecretaría
    subsecretaria: { type: String, default: "" },
  },
  { _id: false }
);

const configuracionSchema = new Schema(
  {
    _id: { type: String, required: true },
    area: { type: String, default: "Área de Tesorería y Contabilidad" },
    zonaHoraria: { type: String, default: "America/Bogota" },
    // Horas en la misma etapa para considerar un trámite "detenido"
    horasDetenido: { type: Number, default: 24, min: 1 },
    destinatariosCopia: { type: [copiaSchema], default: [] },
  },
  { collection: "configuracion", versionKey: false, timestamps: true }
);

// Devuelve la configuración vigente; si no existe la crea con los valores por defecto
configuracionSchema.statics.actual = async function () {
  const conf = await this.findById(CONFIG_ID).lean();
  if (conf) return conf;
  return (await this.create({ _id: CONFIG_ID })).toObject();
};

export default model("Configuracion", configuracionSchema);
