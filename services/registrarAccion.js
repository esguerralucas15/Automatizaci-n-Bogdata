// Registra un paso del trámite: en UNA transacción actualiza el trámite,
// inserta el evento en la bitácora y deja el correo en cola (outbox).
// Si cualquier parte falla, no queda nada a medias.
import mongoose from "mongoose";
import Tramite from "../models/Tramite.js";
import Usuario from "../models/Usuario.js";
import Notificacion from "../models/Notificacion.js";
import Contador from "../models/Contador.js";
import Configuracion from "../models/Configuracion.js";
import { aplicarAccion, ErrorFlujo } from "./flujo.js";
import { insertarEvento } from "./bitacora.js";
import { resolverDestinatarios } from "./destinatarios.js";
import { copiasPara } from "./copias.js";
import { armarCorreo } from "./correo/plantillas.js";
import { ahora, aFechaHora, partesBogota, fechaLegible, horaLegible } from "./tiempo.js";

const FINALES = ["LIBERADO", "ANULADO"];

// "2026-10-25T09:30" (campo datetime-local, hora de Bogotá) -> Date
// Opcional. No puede ser futura ni anterior al último paso del trámite.
export function validarHoraDeclarada(texto, { instante, desde = null }) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(t);
  if (!m) throw new ErrorFlujo("Revisa los datos marcados", { horaDeclaradaBogdata: "Fecha y hora no válidas" });
  const fecha = aFechaHora(m[1], m[2]);
  // Se compara por minuto: el formulario no envía segundos
  if (fecha.getTime() > instante.getTime() + 60_000) {
    throw new ErrorFlujo("Revisa los datos marcados", { horaDeclaradaBogdata: "No puede ser una hora futura" });
  }
  if (desde && fecha.getTime() < Math.floor(new Date(desde).getTime() / 60_000) * 60_000) {
    throw new ErrorFlujo("Revisa los datos marcados", {
      horaDeclaradaBogdata: "No puede ser anterior al paso previo del trámite",
    });
  }
  return fecha;
}

export const horaTexto = (instante) => {
  const p = partesBogota(new Date(instante));
  return `${fechaLegible(p.fecha)}, ${horaLegible(p.hora)}`;
};

// Valida que los firmantes asignados existan, estén activos y tengan el rol correcto
async function validarAsignados(datos, session) {
  const [director, ordenador] = await Promise.all([
    Usuario.findOne({ _id: datos.director, activo: true }).session(session).lean(),
    Usuario.findOne({ _id: datos.ordenador, activo: true }).session(session).lean(),
  ]);
  const errores = {};
  if (director?.rol !== "director") errores.director = "Elige un responsable de presupuesto activo";
  if (ordenador?.rol !== "subsecretario") errores.ordenador = "Elige un ordenador del gasto activo";
  if (Object.keys(errores).length) throw new ErrorFlujo("Revisa los datos marcados", errores);
}

// Un WF solo puede estar en un trámite activo a la vez
async function validarWfLibre(wf, session, excepto = null) {
  const otro = await Tramite.findOne({ wfActual: wf, estado: { $nin: FINALES }, _id: { $ne: excepto } })
    .session(session)
    .lean();
  if (otro) {
    throw new ErrorFlujo("Revisa los datos marcados", { wf: `El WF ${wf} ya está en el trámite ${otro._id}` });
  }
}

// Campos del trámite que cambian con cada acción
function cambiosDelTramite(accion, datos, tramite) {
  switch (accion) {
    case "REGISTRAR_LOTE":
      return { lote: datos.lote, documentosContables: datos.documentosContables };
    case "REGISTRAR_LIBERACION":
      return { avisoEmbargos: datos.avisoEmbargos };
    case "REINICIAR":
      // Rechazado: BOGDATA exige un nuevo cargue (nuevo WF) y un nuevo lote
      return {
        wfActual: datos.wf,
        wfAnteriores: [...tramite.wfAnteriores, tramite.wfActual],
        lote: null,
        documentosContables: [],
        avisoEmbargos: null,
      };
    default:
      return {};
  }
}

// Devuelve { tramiteId, evento }
export async function registrarAccion({ tramiteId = null, accion, usuario, datos = {}, horaDeclarada, observacion = "", ip = "", agente = "" }) {
  const session = await mongoose.startSession();
  let resultado;
  try {
    await session.withTransaction(async () => {
      const tramite = tramiteId ? await Tramite.findById(tramiteId).session(session).lean() : null;
      if (tramiteId && !tramite) throw new ErrorFlujo("El trámite no existe");

      const r = aplicarAccion({ tramite, accion, usuario, datos });
      const instante = ahora();
      const hora = validarHoraDeclarada(horaDeclarada, { instante, desde: tramite?.ultimoEventoEn });

      let id = tramite?._id;
      if (accion === "REGISTRAR_WF") {
        await validarAsignados(r.datos, session);
        await validarWfLibre(r.datos.wf, session);
        const anio = partesBogota(instante).fecha.slice(0, 4);
        const n = await Contador.siguiente(`tramites-${anio}`, session);
        id = `TR-${anio}-${String(n).padStart(4, "0")}`;
      }
      if (accion === "REINICIAR") {
        if (r.datos.wf === tramite.wfActual || tramite.wfAnteriores.includes(r.datos.wf)) {
          throw new ErrorFlujo("Revisa los datos marcados", { wf: "El reinicio necesita un WF nuevo" });
        }
        await validarWfLibre(r.datos.wf, session, tramite._id);
      }

      const evento = await insertarEvento(
        {
          tramite: id,
          accion,
          estadoAnterior: r.estadoAnterior,
          estadoNuevo: r.estadoNuevo,
          usuario,
          datos: r.datos,
          observacion: String(observacion ?? "").trim().slice(0, 1000),
          horaDeclaradaBogdata: hora,
          ip,
          agente: String(agente ?? "").slice(0, 300),
        },
        session
      );

      let actualizado;
      if (accion === "REGISTRAR_WF") {
        const [creado] = await Tramite.create(
          [{
            _id: id,
            wfActual: r.datos.wf,
            segmento: r.datos.segmento,
            valorTotal: r.datos.valorTotal,
            numRegistros: r.datos.numRegistros,
            descripcion: r.datos.descripcion ?? "",
            estado: r.estadoNuevo,
            revisor: usuario.correo,
            director: r.datos.director,
            ordenador: r.datos.ordenador,
            ultimoEventoEn: evento.registradoEn,
          }],
          { session }
        );
        actualizado = creado.toObject();
      } else {
        // Condicional: si otra persona registró este paso un instante antes, no coincide el estado
        actualizado = await Tramite.findOneAndUpdate(
          { _id: tramite._id, estado: r.estadoAnterior },
          { $set: { estado: r.estadoNuevo, ultimoEventoEn: evento.registradoEn, ...cambiosDelTramite(accion, r.datos, tramite) } },
          { new: true, session }
        ).lean();
        if (!actualizado) throw new ErrorFlujo("Este paso ya fue registrado por otra persona. Actualiza la página.");
      }

      // Correo en cola (outbox)
      const [admins, conf, personas] = await Promise.all([
        Usuario.find({ rol: "admin", activo: true }, { _id: 1 }).session(session).lean(),
        Configuracion.actual(),
        Usuario.find({ _id: { $in: [actualizado.director, actualizado.ordenador, actualizado.revisor] } }, { nombre: 1 }).session(session).lean(),
      ]);
      const { para, cc } = resolverDestinatarios(r.notificar, actualizado, {
        admins: admins.map((a) => a._id),
        copias: copiasPara(accion, conf.destinatariosCopia),
        autor: usuario.correo,
      });
      if (para.length || cc.length) {
        const nombres = Object.fromEntries(personas.map((p) => [p._id, p.nombre]));
        const { asunto, cuerpoHtml } = armarCorreo({ tramite: actualizado, evento, horaTexto: horaTexto(evento.registradoEn), nombres });
        await Notificacion.create(
          [{ evento: evento._id, tramite: id, para: para.length ? para : cc, cc: para.length ? cc : [], asunto, cuerpoHtml }],
          { session }
        );
      }

      resultado = { tramiteId: id, evento: evento.toObject() };
    });
  } finally {
    await session.endSession();
  }
  return resultado;
}
