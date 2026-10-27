import Tramite from "../models/Tramite.js";
import Evento from "../models/Evento.js";
import Usuario from "../models/Usuario.js";
import Notificacion from "../models/Notificacion.js";
import Configuracion from "../models/Configuracion.js";
import { ACCIONES, ESTADOS, ErrorFlujo, accionesDisponibles, etiquetaAccion } from "../services/flujo.js";
import { registrarAccion } from "../services/registrarAccion.js";
import { despacharDeEvento } from "../services/correo/despachador.js";
import { valorLegible } from "../services/correo/plantillas.js";
import { ahora, partesBogota } from "../services/tiempo.js";

const FINALES = ["LIBERADO", "ANULADO"];

// "30 h", "12 min", "3 días"
export const esperaDe = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`);

// Valor por defecto del campo de hora declarada: ahora, en Bogotá (AAAA-MM-DDTHH:MM)
const ahoraLocal = () => {
  const p = partesBogota(ahora());
  return `${p.fecha}T${p.hora}`;
};

async function personas() {
  const lista = await Usuario.find({}, { nombre: 1, rol: 1, activo: 1, subsecretaria: 1 }).sort({ nombre: 1 }).lean();
  return {
    nombres: Object.fromEntries(lista.map((u) => [u._id, u.nombre])),
    directores: lista.filter((u) => u.activo && u.rol === "director"),
    ordenadores: lista.filter((u) => u.activo && u.rol === "subsecretario"),
  };
}

// Agrega a cada trámite quién debe actuar y cuánto lleva esperando
export async function conEspera(tramites) {
  const { nombres } = await personas();
  const conf = await Configuracion.actual();
  const instante = ahora().getTime();
  return tramites.map((t) => {
    const campo = ESTADOS[t.estado].responsable;
    const horas = (instante - new Date(t.ultimoEventoEn).getTime()) / 3600000;
    return {
      ...t,
      esperaDe: campo === "revisor" ? "Equipo revisor" : campo ? nombres[t[campo]] ?? t[campo] : null,
      horasEspera: horas,
      detenido: !FINALES.includes(t.estado) && horas >= conf.horasDetenido,
    };
  });
}

// Envía de una vez el correo del paso recién registrado. Si falla, queda en cola
// y el despachador lo reintenta: el registro del paso ya quedó guardado.
async function enviarAhora(evento) {
  try {
    await despacharDeEvento(evento._id);
  } catch (err) {
    console.error("No se pudo enviar el correo de inmediato:", err.message);
  }
}

// --------------------------------------------------------------------------
// Lista de trámites (todos los roles)
// --------------------------------------------------------------------------
export async function lista(req, res) {
  const estado = ESTADOS[req.query.estado] || req.query.estado === "activos" ? req.query.estado : "activos";
  const q = String(req.query.q ?? "").trim().slice(0, 40);
  const filtro = estado === "activos" ? { estado: { $nin: FINALES } } : { estado };
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filtro.$or = [{ _id: re }, { wfActual: re }, { wfAnteriores: re }, { lote: re }, { documentosContables: re }, { segmento: re }];
  }
  const tramites = await Tramite.find(filtro).sort({ ultimoEventoEn: -1 }).limit(300).lean();
  res.render("tramites/lista", {
    titulo: "Trámites",
    tramites: await conEspera(tramites),
    filtros: { estado, q },
    estados: ESTADOS,
    esperaDe,
  });
}

// --------------------------------------------------------------------------
// Nuevo trámite (revisor)
// --------------------------------------------------------------------------
async function verNuevo(res, { errores = {}, valores = {}, mensaje = null, status = 200 } = {}) {
  const p = await personas();
  res.status(status).render("tramites/nuevo", {
    titulo: "Nuevo trámite",
    accion: ACCIONES.REGISTRAR_WF,
    directores: p.directores,
    ordenadores: p.ordenadores,
    errores,
    valores: { horaDeclarada: ahoraLocal(), ...valores },
    mensaje,
  });
}

export const nuevo = (req, res) => verNuevo(res);

export async function crear(req, res) {
  try {
    const { tramiteId, evento } = await registrarAccion({
      accion: "REGISTRAR_WF",
      usuario: req.session.usuario,
      datos: req.body,
      horaDeclarada: req.body.horaDeclarada,
      observacion: req.body.observacion,
      ip: req.ip,
      agente: req.get("user-agent"),
    });
    await enviarAhora(evento);
    res.redirect(`/tramites/${tramiteId}?registrado=REGISTRAR_WF`);
  } catch (err) {
    if (!(err instanceof ErrorFlujo)) throw err;
    await verNuevo(res, { errores: err.errores, valores: req.body, mensaje: err.message, status: 422 });
  }
}

// --------------------------------------------------------------------------
// Detalle con línea de tiempo y acciones disponibles
// --------------------------------------------------------------------------
async function verDetalle(req, res, { errores = {}, valores = {}, accionConError = null, mensaje = null, status = 200 } = {}) {
  const tramite = await Tramite.findById(req.params.id).lean();
  if (!tramite) return res.status(404).render("errores/404", { titulo: "Trámite no encontrado" });

  const [eventos, notificaciones, p] = await Promise.all([
    Evento.find({ tramite: tramite._id }).sort({ secuencia: 1 }).lean(),
    Notificacion.find({ tramite: tramite._id }, { cuerpoHtml: 0 }).lean(),
    personas(),
  ]);
  const correoDe = new Map(notificaciones.map((n) => [String(n.evento), n]));
  const [conDatos] = await conEspera([tramite]);

  const linea = eventos.map((e) => {
    const campos = ACCIONES[e.accion]?.campos ?? {};
    const diferenciaMin = e.horaDeclaradaBogdata ? Math.round((new Date(e.registradoEn) - new Date(e.horaDeclaradaBogdata)) / 60000) : null;
    return {
      ...e,
      titulo: etiquetaAccion(e.accion),
      detalles:
        e.accion === "TRAMITE_REASIGNADO"
          ? [
              ["Rol", e.datos.rol === "director" ? "Responsable de presupuesto" : "Ordenador del gasto"],
              ["Antes", p.nombres[e.datos.de] ?? e.datos.de],
              ["Ahora", p.nombres[e.datos.a] ?? e.datos.a],
              ...(e.datos.motivo ? [["Motivo", e.datos.motivo]] : []),
            ]
          : Object.entries(e.datos ?? {}).map(([k, v]) => [campos[k]?.etiqueta ?? k, valorLegible(campos[k], v, p.nombres)]),
      correo: correoDe.get(String(e._id)) ?? null,
      diferenciaMin,
    };
  });

  const disponibles = accionesDisponibles(tramite, req.session.usuario).map((codigo) => ({ codigo, ...ACCIONES[codigo] }));
  const ultimoRechazo = tramite.estado === "DEVUELTO" ? [...eventos].reverse().find((e) => e.accion === "RECHAZAR") : null;

  res.status(status).render("tramites/detalle", {
    titulo: tramite._id,
    t: conDatos,
    linea,
    disponibles,
    nombres: p.nombres,
    ultimoRechazo,
    errores,
    valores: { horaDeclarada: ahoraLocal(), ...valores },
    accionConError,
    mensaje,
    registrado: ACCIONES[req.query.registrado] ? { titulo: etiquetaAccion(req.query.registrado), evento: linea.at(-1) } : null,
    esperaDe,
  });
}

export const detalle = (req, res) => verDetalle(req, res);

export async function ejecutarAccion(req, res) {
  const accion = String(req.body.accion ?? "");
  if (!ACCIONES[accion] || accion === "REGISTRAR_WF") {
    return verDetalle(req, res, { mensaje: "Acción no válida", status: 400 });
  }
  try {
    const { evento } = await registrarAccion({
      tramiteId: req.params.id,
      accion,
      usuario: req.session.usuario,
      datos: req.body,
      horaDeclarada: req.body.horaDeclarada,
      observacion: req.body.observacion,
      ip: req.ip,
      agente: req.get("user-agent"),
    });
    await enviarAhora(evento);
    res.redirect(`/tramites/${encodeURIComponent(req.params.id)}?registrado=${accion}`);
  } catch (err) {
    if (!(err instanceof ErrorFlujo)) throw err;
    await verDetalle(req, res, { errores: err.errores, valores: req.body, accionConError: accion, mensaje: err.message, status: 422 });
  }
}
