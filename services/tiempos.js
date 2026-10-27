// Tiempos de respuesta a partir de la bitácora (sin base de datos: recibe eventos y trámites).
//
// Regla: cuando un paso queda registrado, el trámite pasa a esperar a la siguiente persona.
// El tiempo de respuesta de un paso = hora de su registro − hora del paso anterior del mismo
// trámite. Ese tiempo se le atribuye a quien registró el paso (era su turno).
// Son horas calendario (incluyen noches y fines de semana).
import { ESTADOS } from "./flujo.js";

// Etapas que se miden (el cargue inicial no tiene paso anterior)
export const ETAPAS = [
  { accion: "APROBAR_WF_PRESUPUESTO", etiqueta: "Firma WF · Presupuesto", corta: "Firma WF P." },
  { accion: "APROBAR_WF_ORDENADOR", etiqueta: "Firma WF · Ordenador", corta: "Firma WF O." },
  { accion: "REGISTRAR_LOTE", etiqueta: "Generación del lote", corta: "Lote" },
  { accion: "FIRMAR_LOTE_PRESUPUESTO", etiqueta: "Firma lote · Presupuesto", corta: "Firma lote P." },
  { accion: "FIRMAR_LOTE_ORDENADOR", etiqueta: "Firma lote · Ordenador", corta: "Firma lote O." },
  { accion: "REGISTRAR_LIBERACION", etiqueta: "Liberación", corta: "Liberación" },
  { accion: "RECHAZAR", etiqueta: "Rechazo", corta: "Rechazo" },
  { accion: "REINICIAR", etiqueta: "Reinicio con nuevo WF", corta: "Reinicio" },
  { accion: "ANULAR", etiqueta: "Anulación", corta: "Anulación" },
];
const MEDIDAS = new Set(ETAPAS.map((e) => e.accion));

const min = (a, b) => (new Date(b) - new Date(a)) / 60000;

// "45 min" · "3 h 20 min" · "2 d 4 h"
export function duracionTexto(minutos) {
  if (minutos === null || minutos === undefined || Number.isNaN(minutos)) return "—";
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

const resumen = (valores) => {
  if (!valores.length) return { n: 0, promedio: null, maximo: null, mediana: null };
  const ord = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ord.length / 2);
  return {
    n: valores.length,
    promedio: valores.reduce((s, v) => s + v, 0) / valores.length,
    maximo: ord.at(-1),
    mediana: ord.length % 2 ? ord[mitad] : (ord[mitad - 1] + ord[mitad]) / 2,
  };
};

// Pasos con su tiempo de respuesta. eventos: de uno o varios trámites (se ordenan por secuencia).
export function pasosConEspera(eventos) {
  const porTramite = new Map();
  for (const e of [...eventos].sort((a, b) => a.secuencia - b.secuencia)) {
    if (!e.tramite) continue;
    if (!porTramite.has(e.tramite)) porTramite.set(e.tramite, []);
    porTramite.get(e.tramite).push(e);
  }
  const pasos = [];
  for (const lista of porTramite.values()) {
    lista.forEach((e, i) => {
      const anterior = lista[i - 1];
      pasos.push({
        ...e,
        esperaMin: anterior ? min(anterior.registradoEn, e.registradoEn) : null,
        // Minutos entre lo que la persona dice que hizo en BOGDATA y el registro en la app
        tardanzaMin: e.horaDeclaradaBogdata ? Math.max(0, min(e.horaDeclaradaBogdata, e.registradoEn)) : null,
      });
    });
  }
  return pasos;
}

// Indicadores. pasos: salida de pasosConEspera YA filtrada por el periodo.
// tramites: trámites con estado (para lo que está pendiente ahora). nombres: { correo: nombre }
export function indicadores({ pasos, tramites = [], ahora = new Date(), nombres = {}, roles = {} }) {
  // Por etapa
  const porEtapa = ETAPAS.map((et) => ({
    ...et,
    ...resumen(pasos.filter((p) => p.accion === et.accion && p.esperaMin !== null).map((p) => p.esperaMin)),
  })).filter((e) => e.n > 0 || ["APROBAR_WF_PRESUPUESTO", "APROBAR_WF_ORDENADOR", "REGISTRAR_LOTE", "FIRMAR_LOTE_PRESUPUESTO", "FIRMAR_LOTE_ORDENADOR", "REGISTRAR_LIBERACION"].includes(e.accion));

  // Pendiente ahora: a quién espera cada trámite activo y desde cuándo
  const pendientes = tramites
    .filter((t) => !ESTADOS[t.estado]?.final && ESTADOS[t.estado]?.responsable)
    .map((t) => {
      const campo = ESTADOS[t.estado].responsable;
      return { tramite: t._id, estado: t.estado, quien: campo === "revisor" ? "revisores" : t[campo], esperaMin: min(t.ultimoEventoEn, ahora) };
    });

  // Por persona
  const personas = new Map();
  const persona = (correo, nombre, rol) => {
    if (!personas.has(correo)) personas.set(correo, { correo, nombre: nombre ?? nombres[correo] ?? correo, rol: rol ?? roles[correo] ?? "", tiempos: [], tardanzas: [], pasos: 0, pendientes: [] });
    return personas.get(correo);
  };
  for (const p of pasos) {
    if (!p.usuario?.correo || p.usuario.rol === "sistema") continue;
    const per = persona(p.usuario.correo, p.usuario.nombre, p.usuario.rol);
    per.pasos++;
    if (MEDIDAS.has(p.accion) && p.esperaMin !== null) per.tiempos.push(p.esperaMin);
    if (p.tardanzaMin !== null) per.tardanzas.push(p.tardanzaMin);
  }
  for (const pe of pendientes) {
    if (pe.quien === "revisores") continue; // turno de cualquier revisor: no se atribuye a una persona
    persona(pe.quien).pendientes.push(pe);
  }
  const porPersona = [...personas.values()]
    .map((p) => ({
      ...p,
      ...resumen(p.tiempos),
      tardanzaPromedio: p.tardanzas.length ? p.tardanzas.reduce((s, v) => s + v, 0) / p.tardanzas.length : null,
      esperaMasLarga: p.pendientes.length ? Math.max(...p.pendientes.map((x) => x.esperaMin)) : null,
    }))
    .sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));

  return { porEtapa, porPersona, pendientes };
}

// Una fila por trámite: tiempo en cada etapa (si hubo reinicios, se suman) y total
export function tiemposPorTramite(tramites, pasos, ahora = new Date()) {
  const deTramite = new Map();
  for (const p of pasos) (deTramite.get(p.tramite) ?? deTramite.set(p.tramite, []).get(p.tramite)).push(p);
  return tramites.map((t) => {
    const lista = (deTramite.get(t._id) ?? []).sort((a, b) => a.secuencia - b.secuencia);
    const etapas = {};
    for (const p of lista) if (p.esperaMin !== null) etapas[p.accion] = (etapas[p.accion] ?? 0) + p.esperaMin;
    const inicio = lista[0]?.registradoEn ?? t.createdAt;
    const fin = ESTADOS[t.estado]?.final ? lista.at(-1)?.registradoEn ?? t.ultimoEventoEn : ahora;
    return {
      ...t,
      etapas,
      reinicios: lista.filter((p) => p.accion === "REINICIAR").length,
      rechazos: lista.filter((p) => p.accion === "RECHAZAR").length,
      totalMin: inicio ? min(inicio, fin) : null,
      abierto: !ESTADOS[t.estado]?.final,
    };
  });
}
