// Bitácora de auditoría: un documento por cada paso registrado.
// Solo se inserta. Nunca se modifica ni se borra: los errores se corrigen con
// un evento nuevo. Además del bloqueo en el código, el usuario de la app en
// Atlas debería tener solo find + insert sobre esta colección (ver docs).
import mongoose from "mongoose";
import { ESTADOS, ACCIONES } from "../services/flujo.js";

const { Schema, model } = mongoose;

const eventoSchema = new Schema(
  {
    secuencia: { type: Number, required: true, unique: true }, // base de la cadena de hashes
    tramite: { type: String, default: null, index: true }, // null en eventos de usuarios
    accion: { type: String, required: true, enum: [...Object.keys(ACCIONES), ...EVENTOS_ADMIN()] },
    estadoAnterior: { type: String, enum: [...Object.keys(ESTADOS), null], default: null },
    estadoNuevo: { type: String, enum: [...Object.keys(ESTADOS), null], default: null },
    usuario: {
      correo: { type: String, required: true },
      nombre: { type: String, required: true },
      rol: { type: String, required: true },
    },
    registradoEn: { type: Date, required: true }, // hora del servidor
    horaDeclaradaBogdata: { type: Date, default: null },
    datos: { type: Schema.Types.Mixed, default: {} },
    observacion: { type: String, default: "" },
    ip: { type: String, default: "" },
    agente: { type: String, default: "" },
    hashAnterior: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { collection: "eventos", versionKey: false, minimize: false }
);

// Eventos de administración (no cambian el estado de un trámite). TRAMITE_REASIGNADO sí
// lleva el trámite: cambia quién debe firmarlo (encargos, retiros, vacaciones).
function EVENTOS_ADMIN() {
  return ["USUARIO_CREADO", "USUARIO_ACTUALIZADO", "ROL_CAMBIADO", "USUARIO_DESACTIVADO", "USUARIO_REACTIVADO", "TRAMITE_REASIGNADO"];
}

const BLOQUEADO = "La bitácora no se puede modificar ni borrar";
const bloquear = function () {
  throw new Error(BLOQUEADO);
};
for (const op of [
  "updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace",
  "deleteOne", "deleteMany", "findOneAndDelete",
]) {
  eventoSchema.pre(op, { document: false, query: true }, bloquear);
}
eventoSchema.pre("deleteOne", { document: true, query: false }, bloquear);
eventoSchema.pre("save", function () {
  if (!this.isNew) throw new Error(BLOQUEADO);
});

eventoSchema.index({ tramite: 1, secuencia: 1 }, { name: "tramite_secuencia" });
eventoSchema.index({ "usuario.correo": 1, registradoEn: -1 }, { name: "usuario_fecha" });

export const MENSAJE_BLOQUEO = BLOQUEADO;
export const ACCIONES_ADMIN = EVENTOS_ADMIN();
export default model("Evento", eventoSchema);
