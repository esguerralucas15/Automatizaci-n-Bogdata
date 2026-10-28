// Estado actual de cada trámite. Se actualiza en la misma transacción en que
// se inserta el evento de la bitácora; la historia completa está en "eventos".
import mongoose from "mongoose";
import { ESTADOS } from "../services/flujo.js";

const { Schema, model } = mongoose;

const tramiteSchema = new Schema(
  {
    _id: { type: String, required: true }, // TR-2026-0001
    wfActual: { type: String, required: true },
    wfAnteriores: { type: [String], default: [] },
    segmento: { type: String, required: true },
    valorTotal: { type: Number, required: true, min: 0 },
    numRegistros: { type: Number, required: true, min: 1 },
    descripcion: { type: String, default: "" },
    lote: { type: String, default: null },
    documentosContables: { type: [String], default: [] },
    avisoEmbargos: { type: Boolean, default: null },
    estado: { type: String, enum: Object.keys(ESTADOS), required: true },
    // Correos de las personas asignadas
    revisor: { type: String, required: true },
    director: { type: String, required: true },
    ordenador: { type: String, required: true },
    // Subsecretaría a la que va dirigido (la del ordenador del gasto elegido por el revisor).
    // No cambia si se reasigna el firmante por un encargo.
    subsecretaria: { type: String, default: "" },
    ultimoEventoEn: { type: Date, required: true },
  },
  { collection: "tramites", versionKey: false, timestamps: true }
);

tramiteSchema.index({ estado: 1, ultimoEventoEn: 1 }, { name: "estado_ultimoEvento" });
tramiteSchema.index({ director: 1, estado: 1 }, { name: "director_estado" });
tramiteSchema.index({ ordenador: 1, estado: 1 }, { name: "ordenador_estado" });
tramiteSchema.index({ wfActual: 1 }, { name: "wf" });

export default model("Tramite", tramiteSchema);
