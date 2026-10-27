import Usuario from "../models/Usuario.js";
import Tramite from "../models/Tramite.js";
import Configuracion from "../models/Configuracion.js";
import { ROLES } from "../models/roles.js";
import { partesBogota, aFechaHora, ahora } from "../services/tiempo.js";
import { conEspera, esperaDe } from "./tramiteController.js";
import { accionesDeCopia, ETIQUETA_ETAPA } from "../services/copias.js";
import Evento from "../models/Evento.js";
import { pasosConEspera, indicadores, tiemposPorTramite, duracionTexto, ETAPAS } from "../services/tiempos.js";
import { periodoDe } from "../services/periodo.js";
import { libroTiempos } from "../services/reporteExcel.js";
import { verificarBitacora } from "../services/bitacora.js";
import { ACCIONES, etiquetaAccion } from "../services/flujo.js";
import { ACCIONES_ADMIN } from "../models/Evento.js";

export async function dashboard(req, res) {
  const conf = await Configuracion.actual();
  const limite = new Date(ahora().getTime() - conf.horasDetenido * 3600000);
  const mes = partesBogota(ahora()).fecha.slice(0, 7);
  const inicioMes = aFechaHora(`${mes}-01`, "00:00");

  const [usuariosActivos, enCurso, detenidos, liberadosMes] = await Promise.all([
    Usuario.countDocuments({ activo: true }),
    Tramite.countDocuments({ estado: { $nin: ["LIBERADO", "ANULADO"] } }),
    Tramite.countDocuments({ estado: { $nin: ["LIBERADO", "ANULADO"] }, ultimoEventoEn: { $lt: limite } }),
    Tramite.countDocuments({ estado: "LIBERADO", ultimoEventoEn: { $gte: inicioMes } }),
  ]);

  // En curso: los que más llevan esperando primero
  const activos = await Tramite.find({ estado: { $nin: ["LIBERADO", "ANULADO"] } }).sort({ ultimoEventoEn: 1 }).limit(50).lean();

  res.render("admin/dashboard", {
    titulo: "Dashboard",
    tramites: await conEspera(activos),
    esperaDe,
    usuariosActivos, enCurso, detenidos, liberadosMes,
    horasDetenido: conf.horasDetenido,
  });
}

export async function usuarios(req, res) {
  const rol = ROLES.includes(req.query.rol) ? req.query.rol : "";
  const lista = await Usuario.find(rol ? { rol } : {}).sort({ activo: -1, rol: 1, nombre: 1 }).lean();
  const conf = await Configuracion.actual();
  res.render("admin/usuarios", {
    titulo: "Usuarios",
    lista,
    roles: ROLES,
    filtros: { rol },
    copias: conf.destinatariosCopia.map((c) => ({ ...c, etapas: accionesDeCopia(c.recibe).map((a) => ETIQUETA_ETAPA[a]) })),
  });
}

// ---------------------------------------------------------------------------
// Tiempos de respuesta (por persona, por etapa y por trámite) y exportación a Excel
// ---------------------------------------------------------------------------
async function datosTiempos(query) {
  const periodo = periodoDe(query);
  const instante = ahora();
  const enRango = await Evento.find(
    { tramite: { $ne: null }, registradoEn: { $gte: periodo.inicio, $lt: periodo.fin } },
    { tramite: 1 }
  ).lean();
  const ids = [...new Set(enRango.map((e) => e.tramite))];

  // Se traen todos los eventos de esos trámites: el tiempo de un paso depende del anterior,
  // aunque el anterior haya sido antes del periodo.
  const [todos, tramitesRango, activos, usuarios] = await Promise.all([
    Evento.find({ tramite: { $in: ids } }).sort({ secuencia: 1 }).lean(),
    Tramite.find({ _id: { $in: ids } }).sort({ ultimoEventoEn: -1 }).lean(),
    Tramite.find({ estado: { $nin: ["LIBERADO", "ANULADO"] } }).lean(),
    Usuario.find({}, { nombre: 1, rol: 1 }).lean(),
  ]);
  const nombres = Object.fromEntries(usuarios.map((u) => [u._id, u.nombre]));
  const roles = Object.fromEntries(usuarios.map((u) => [u._id, u.rol]));
  const pasos = pasosConEspera(todos);
  const pasosRango = pasos.filter((p) => p.registradoEn >= periodo.inicio && p.registradoEn < periodo.fin);

  return {
    periodo,
    ind: indicadores({ pasos: pasosRango, tramites: activos, ahora: instante, nombres, roles }),
    porTramite: tiemposPorTramite(tramitesRango, pasos, instante),
    pasos: pasosRango,
    nombres,
  };
}

export async function tiempos(req, res) {
  const d = await datosTiempos(req.query);
  if (req.query.formato === "xlsx") {
    const buffer = await libroTiempos(d);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="bitacora-tiempos-${d.periodo.desde}-a-${d.periodo.hasta}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }
  res.render("admin/tiempos", { titulo: "Tiempos de respuesta", ...d, duracionTexto, etapasMedidas: ETAPAS.slice(0, 6) });
}

// ---------------------------------------------------------------------------
// Bitácora completa: todos los pasos registrados, con filtros y verificación de integridad
// ---------------------------------------------------------------------------
const POR_PAGINA = 100;

export async function bitacora(req, res) {
  const periodo = periodoDe(req.query);
  const filtros = {
    q: String(req.query.q ?? "").trim().slice(0, 30),
    persona: String(req.query.persona ?? ""),
    accion: ACCIONES[req.query.accion] || ACCIONES_ADMIN.includes(req.query.accion) ? req.query.accion : "",
    desde: periodo.desde,
    hasta: periodo.hasta,
  };
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);

  const filtro = { registradoEn: { $gte: periodo.inicio, $lt: periodo.fin } };
  if (filtros.persona) filtro["usuario.correo"] = filtros.persona;
  if (filtros.accion) filtro.accion = filtros.accion;
  if (filtros.q) {
    const re = new RegExp(filtros.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const coinciden = await Tramite.find({ $or: [{ _id: re }, { wfActual: re }, { wfAnteriores: re }, { lote: re }] }, { _id: 1 }).lean();
    filtro.tramite = { $in: coinciden.map((t) => t._id) };
  }

  const [total, eventos, personas] = await Promise.all([
    Evento.countDocuments(filtro),
    Evento.find(filtro).sort({ secuencia: -1 }).skip((pagina - 1) * POR_PAGINA).limit(POR_PAGINA).lean(),
    Usuario.find({}, { nombre: 1 }).sort({ nombre: 1 }).lean(),
  ]);

  // Tiempo de respuesta de cada paso (necesita el paso anterior de su trámite)
  const ids = [...new Set(eventos.map((e) => e.tramite).filter(Boolean))];
  const deEsosTramites = await Evento.find({ tramite: { $in: ids } }, { tramite: 1, secuencia: 1, registradoEn: 1, accion: 1, usuario: 1 }).lean();
  const espera = new Map(pasosConEspera(deEsosTramites).map((p) => [p.secuencia, p.esperaMin]));

  const verificacion = req.query.verificar ? await verificarBitacora() : null;

  res.render("admin/bitacora", {
    titulo: "Bitácora",
    eventos: eventos.map((e) => ({ ...e, titulo: etiquetaAccion(e.accion), esperaMin: espera.get(e.secuencia) ?? null })),
    total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    filtros, personas,
    acciones: [...Object.keys(ACCIONES), ...ACCIONES_ADMIN],
    verificacion, duracionTexto, etiquetaAccion,
  });
}
