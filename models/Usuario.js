// Personas que participan en el trámite. El _id es el correo en minúsculas:
// así el login es una búsqueda directa (como la cédula en Horas-Compensacion).
import mongoose from "mongoose";
import { ROLES, CORREO } from "./roles.js";

const { Schema, model } = mongoose;

const usuarioSchema = new Schema(
  {
    _id: { type: String, required: true, lowercase: true, trim: true, match: CORREO }, // correo
    nombre: { type: String, required: true, trim: true },
    cargo: { type: String, default: "", trim: true },
    rol: { type: String, enum: ROLES, required: true },
    // Solo para el rol subsecretario
    subsecretaria: { type: String, default: "", trim: true },
    observaciones: { type: String, default: "" },
    // Al retirarse se desactiva, nunca se borra: sus eventos lo referencian
    activo: { type: Boolean, default: true },
  },
  { collection: "usuarios", versionKey: false, timestamps: true }
);

usuarioSchema.index({ rol: 1, activo: 1 }, { name: "rol_activo" });

usuarioSchema.virtual("correo").get(function () {
  return this._id;
});

export default model("Usuario", usuarioSchema);
