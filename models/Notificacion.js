// Cola de correos (patrón outbox): se inserta en la misma transacción del evento
// y el despachador la envía. Si el envío falla queda pendiente y se reintenta.
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const notificacionSchema = new Schema(
  {
    evento: { type: Schema.Types.ObjectId, ref: "Evento", required: true },
    tramite: { type: String, default: null },
    para: { type: [String], required: true },
    cc: { type: [String], default: [] },
    asunto: { type: String, required: true },
    cuerpoHtml: { type: String, required: true },
    estado: { type: String, enum: ["pendiente", "enviado", "fallido"], default: "pendiente" },
    intentos: { type: Number, default: 0 },
    ultimoError: { type: String, default: "" },
    enviadoEn: { type: Date, default: null },
    // Para reintentos: no se intenta antes de esta hora (espera creciente tras cada fallo)
    proximoIntento: { type: Date, default: () => new Date() },
    // Evita que dos procesos envíen el mismo correo a la vez
    bloqueadoHasta: { type: Date, default: null },
    // Respuesta del proveedor (id del mensaje en Brevo) o "redirigido a ..." en pruebas
    detalleEnvio: { type: String, default: "" },
  },
  { collection: "notificaciones", versionKey: false, timestamps: true }
);

notificacionSchema.index({ estado: 1, createdAt: 1 }, { name: "estado_fecha" });
notificacionSchema.index({ estado: 1, proximoIntento: 1 }, { name: "estado_proximoIntento" });
notificacionSchema.index({ evento: 1 }, { name: "evento" });

export default model("Notificacion", notificacionSchema);
