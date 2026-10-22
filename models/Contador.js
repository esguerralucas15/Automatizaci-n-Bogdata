// Consecutivos: trámites por año (TR-2026-0001) y eventos (cadena de hashes)
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const contadorSchema = new Schema(
  { _id: { type: String, required: true }, valor: { type: Number, default: 0 } },
  { collection: "contadores", versionKey: false }
);

// Siguiente valor de un contador. Usar dentro de la transacción del evento
// para que el consecutivo no quede "gastado" si la transacción falla.
contadorSchema.statics.siguiente = async function (nombre, session) {
  const doc = await this.findOneAndUpdate(
    { _id: nombre },
    { $inc: { valor: 1 } },
    { upsert: true, new: true, session }
  ).lean();
  return doc.valor;
};

export default model("Contador", contadorSchema);
