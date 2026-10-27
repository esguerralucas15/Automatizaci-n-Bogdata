// Gestión de usuarios desde la app (administración): crear, editar, cambiar rol,
// desactivar/reactivar y reasignar los trámites de un firmante. Cada cambio queda en la
// bitácora en la misma transacción, con quién lo hizo y cuándo.
import mongoose from "mongoose";
import Usuario from "../models/Usuario.js";
import Tramite from "../models/Tramite.js";
import Notificacion from "../models/Notificacion.js";
import { ROLES, NOMBRE_ROL, CORREO } from "../models/roles.js";
import { ErrorFlujo, ESTADOS } from "./flujo.js";
import { insertarEvento } from "./bitacora.js";
import { armarCorreo } from "./correo/plantillas.js";
import { horaTexto } from "./registrarAccion.js";

const FINALES = ["LIBERADO", "ANULADO"];
// Rol del usuario -> campo del trámite donde queda asignado como firmante
export const CAMPO_DE_ROL = { director: "director", subsecretario: "ordenador" };

const texto = (v, max = 200) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// ---------------------------------------------------------------------------
// Reglas (sin base de datos)
// ---------------------------------------------------------------------------
export function validarDatosUsuario(datos = {}, { nuevo = false } = {}) {
  const errores = {};
  const limpios = {
    nombre: texto(datos.nombre, 120),
    cargo: texto(datos.cargo, 120),
    rol: String(datos.rol ?? ""),
    subsecretaria: texto(datos.subsecretaria, 120),
    observaciones: String(datos.observaciones ?? "").trim().slice(0, 500),
  };
  if (nuevo) {
    limpios._id = String(datos.correo ?? "").trim().toLowerCase();
    if (!CORREO.test(limpios._id)) errores.correo = "Escribe un correo válido";
  }
  if (!limpios.nombre) errores.nombre = "Este dato es obligatorio";
  if (!ROLES.includes(limpios.rol)) errores.rol = "Elige un rol";
  if (limpios.rol === "subsecretario" && !limpios.subsecretaria) errores.subsecretaria = "Indica la subsecretaría del ordenador del gasto";
  if (limpios.rol !== "subsecretario") limpios.subsecretaria = "";
  if (Object.keys(errores).length) throw new ErrorFlujo("Revisa los datos marcados", errores);
  return limpios;
}

const CAMPOS = ["nombre", "cargo", "rol", "subsecretaria", "observaciones"];

// Qué cambió y con qué evento queda en la bitácora (null si nada cambió)
export function tipoDeCambio(actual, nuevo) {
  const cambios = Object.fromEntries(
    CAMPOS.filter((k) => (actual[k] ?? "") !== (nuevo[k] ?? "")).map((k) => [k, { antes: actual[k] ?? "", ahora: nuevo[k] ?? "" }])
  );
  if (!Object.keys(cambios).length) return null;
  return { accion: cambios.rol ? "ROL_CAMBIADO" : "USUARIO_ACTUALIZADO", cambios };
}

// Protege contra quedarse sin administración o dejar trámites sin firmante
export function validarCambioSensible({ actual, rolNuevo, activoNuevo, autor, adminsActivos, asignados }) {
  const pierdeAdmin = actual.rol === "admin" && actual.activo && (rolNuevo !== "admin" || !activoNuevo);
  if (autor?.correo === actual._id && pierdeAdmin) {
    throw new ErrorFlujo("No puedes quitarte tu propio rol de administración ni desactivarte. Pídeselo a otra persona con ese rol.");
  }
  if (pierdeAdmin && adminsActivos <= 1) {
    throw new ErrorFlujo("Debe quedar al menos una persona activa con rol de administración.");
  }
  const dejaDeFirmar = CAMPO_DE_ROL[actual.rol] && (rolNuevo !== actual.rol || !activoNuevo);
  if (dejaDeFirmar && asignados > 0) {
    throw new ErrorFlujo(
      `${actual.nombre} tiene ${asignados} ${asignados === 1 ? "trámite en curso asignado" : "trámites en curso asignados"} como ${NOMBRE_ROL[actual.rol].toLowerCase()}. ` +
        "Reasígnalos primero a otra persona (sección «Reasignar trámites»)."
    );
  }
}

// ---------------------------------------------------------------------------
// Operaciones (transacción + evento en la bitácora)
// ---------------------------------------------------------------------------
async function enTransaccion(fn) {
  const session = await mongoose.startSession();
  let r;
  try {
    await session.withTransaction(async () => { r = await fn(session); });
  } finally {
    await session.endSession();
  }
  return r;
}

const contarAsignados = (u, session) =>
  CAMPO_DE_ROL[u.rol]
    ? Tramite.countDocuments({ [CAMPO_DE_ROL[u.rol]]: u._id, estado: { $nin: FINALES } }).session(session)
    : 0;

export async function crearUsuario({ datos, autor, ip = "", agente = "" }) {
  const nuevo = { ...validarDatosUsuario(datos, { nuevo: true }), activo: true };
  return enTransaccion(async (session) => {
    const existe = await Usuario.findById(nuevo._id).session(session).lean();
    if (existe) {
      throw new ErrorFlujo("Revisa los datos marcados", {
        correo: existe.activo ? "Ya existe un usuario con este correo" : "Este correo ya existe pero está desactivado: reactívalo desde su ficha",
      });
    }
    await Usuario.create([nuevo], { session });
    await insertarEvento({ accion: "USUARIO_CREADO", usuario: autor, datos: nuevo, ip, agente }, session);
    return nuevo;
  });
}

export async function actualizarUsuario({ correo, datos, autor, ip = "", agente = "" }) {
  const limpios = validarDatosUsuario(datos);
  return enTransaccion(async (session) => {
    const actual = await Usuario.findById(correo).session(session).lean();
    if (!actual) throw new ErrorFlujo("El usuario no existe");
    const cambio = tipoDeCambio(actual, limpios);
    if (!cambio) return { sinCambios: true };
    if (cambio.cambios.rol) {
      validarCambioSensible({
        actual, rolNuevo: limpios.rol, activoNuevo: actual.activo, autor,
        adminsActivos: await Usuario.countDocuments({ rol: "admin", activo: true }).session(session),
        asignados: await contarAsignados(actual, session),
      });
    }
    await Usuario.updateOne({ _id: correo }, { $set: limpios }, { session });
    await insertarEvento({ accion: cambio.accion, usuario: autor, datos: { correo, cambios: cambio.cambios }, ip, agente }, session);
    return { cambio };
  });
}

export async function cambiarEstado({ correo, activo, autor, ip = "", agente = "" }) {
  return enTransaccion(async (session) => {
    const actual = await Usuario.findById(correo).session(session).lean();
    if (!actual) throw new ErrorFlujo("El usuario no existe");
    if (actual.activo === activo) return { sinCambios: true };
    if (!activo) {
      validarCambioSensible({
        actual, rolNuevo: actual.rol, activoNuevo: false, autor,
        adminsActivos: await Usuario.countDocuments({ rol: "admin", activo: true }).session(session),
        asignados: await contarAsignados(actual, session),
      });
    }
    await Usuario.updateOne({ _id: correo }, { $set: { activo } }, { session });
    await insertarEvento(
      { accion: activo ? "USUARIO_REACTIVADO" : "USUARIO_DESACTIVADO", usuario: autor, datos: { correo, nombre: actual.nombre, rol: actual.rol }, ip, agente },
      session
    );
    return { activo };
  });
}

// Pasa todos los trámites en curso de un firmante (director o subsecretario) a otra persona
// del mismo rol. Si alguno estaba esperando su firma, se avisa por correo a la persona nueva.
// Devuelve { n, eventos } (ids de eventos con correo en cola, para despacharlos).
export async function reasignarTramites({ correo, reemplazo, motivo = "", autor, ip = "", agente = "" }) {
  const motivoLimpio = String(motivo ?? "").trim().slice(0, 300);
  return enTransaccion(async (session) => {
    const [actual, nuevo] = await Promise.all([
      Usuario.findById(correo).session(session).lean(),
      Usuario.findById(String(reemplazo ?? "").toLowerCase()).session(session).lean(),
    ]);
    if (!actual) throw new ErrorFlujo("El usuario no existe");
    const campo = CAMPO_DE_ROL[actual.rol];
    if (!campo) throw new ErrorFlujo("Solo se reasignan trámites de responsables de presupuesto u ordenadores del gasto");
    if (!nuevo || !nuevo.activo || nuevo.rol !== actual.rol || nuevo._id === actual._id) {
      throw new ErrorFlujo("Revisa los datos marcados", { reemplazo: `Elige otra persona activa con rol ${NOMBRE_ROL[actual.rol].toLowerCase()}` });
    }

    const tramites = await Tramite.find({ [campo]: correo, estado: { $nin: FINALES } }).session(session).lean();
    const conCorreo = [];
    for (const t of tramites) {
      const esperaba = ESTADOS[t.estado].responsable === campo;
      const evento = await insertarEvento(
        {
          tramite: t._id, accion: "TRAMITE_REASIGNADO", estadoAnterior: t.estado, estadoNuevo: t.estado, usuario: autor,
          datos: { rol: actual.rol, de: correo, a: nuevo._id, ...(motivoLimpio ? { motivo: motivoLimpio } : {}) },
          ip, agente,
        },
        session
      );
      // Si esperaba la firma de quien sale, el turno empieza ahora para la persona nueva
      const actualizado = await Tramite.findOneAndUpdate(
        { _id: t._id, estado: t.estado },
        { $set: { [campo]: nuevo._id, ...(esperaba ? { ultimoEventoEn: evento.registradoEn } : {}) } },
        { new: true, session }
      ).lean();
      if (!actualizado) throw new ErrorFlujo(`El trámite ${t._id} cambió mientras se reasignaba. Intenta de nuevo.`);
      if (esperaba) {
        const { asunto, cuerpoHtml } = armarCorreo({
          tramite: actualizado,
          evento: { ...evento.toObject(), datos: {} },
          horaTexto: horaTexto(evento.registradoEn),
        });
        await Notificacion.create([{ evento: evento._id, tramite: t._id, para: [nuevo._id], cc: [], asunto, cuerpoHtml }], { session });
        conCorreo.push(evento._id);
      }
    }
    return { n: tramites.length, eventos: conCorreo, nombreNuevo: nuevo.nombre };
  });
}
