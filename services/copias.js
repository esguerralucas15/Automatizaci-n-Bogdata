// Copias por etapa: la hoja "Solo copia" dice qué avisos recibe cada persona o área
// (columna "Qué correos debe recibir"). Se interpreta el texto escrito por el área:
//   "Registro de WF y Lote"               -> cuando el revisor registra el WF o el lote (y el reinicio con nuevo WF)
//   "Aprobación del WF y lote nivel 1"    -> cuando el responsable de presupuesto registra su firma
//   "Aprobación del WF y lote nivel 2"    -> cuando el ordenador del gasto registra su firma
//   "Liberación" / "Rechazo" / "Reinicio" / "Anulación" / "Todos"
// Si menciona solo "WF" o solo "lote", se limita a esa parte del trámite.
//
// Columna opcional "Subsecretaría": la persona solo recibe copia de los trámites dirigidos a
// esa subsecretaría (p. ej. quien apoya al subsecretario a firmar). Vacía = todos los trámites.

const GRUPOS = {
  registro: { WF: ["REGISTRAR_WF", "REINICIAR"], LOTE: ["REGISTRAR_LOTE"] },
  nivel1: { WF: ["APROBAR_WF_PRESUPUESTO"], LOTE: ["FIRMAR_LOTE_PRESUPUESTO"] },
  nivel2: { WF: ["APROBAR_WF_ORDENADOR"], LOTE: ["FIRMAR_LOTE_ORDENADOR"] },
};
const TODAS = [
  "REGISTRAR_WF", "APROBAR_WF_PRESUPUESTO", "APROBAR_WF_ORDENADOR", "REGISTRAR_LOTE",
  "FIRMAR_LOTE_PRESUPUESTO", "FIRMAR_LOTE_ORDENADOR", "REGISTRAR_LIBERACION", "RECHAZAR", "REINICIAR", "ANULAR",
];

export const ETIQUETA_ETAPA = {
  REGISTRAR_WF: "Registro del WF", REINICIAR: "Reinicio con nuevo WF", REGISTRAR_LOTE: "Registro del lote",
  APROBAR_WF_PRESUPUESTO: "Firma WF nivel 1", FIRMAR_LOTE_PRESUPUESTO: "Firma lote nivel 1",
  APROBAR_WF_ORDENADOR: "Firma WF nivel 2", FIRMAR_LOTE_ORDENADOR: "Firma lote nivel 2",
  REGISTRAR_LIBERACION: "Liberación", RECHAZAR: "Rechazo", ANULAR: "Anulación",
};

const normal = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Texto de la columna -> lista de acciones (vacía si no se entiende)
export function accionesDeCopia(texto) {
  const t = normal(texto);
  if (!t) return [];
  if (/\btod[oa]s?\b/.test(t)) return [...TODAS];

  const wf = /\bwf\b|work ?flow/.test(t);
  const lote = /\blotes?\b/.test(t);
  const partes = wf === lote ? ["WF", "LOTE"] : wf ? ["WF"] : ["LOTE"];

  const acciones = new Set();
  const agregar = (grupo) => partes.forEach((p) => GRUPOS[grupo][p].forEach((a) => acciones.add(a)));
  if (/nivel ?(1|uno)\b|presupuesto|primer/.test(t)) agregar("nivel1");
  if (/nivel ?(2|dos)\b|ordenador|segund/.test(t)) agregar("nivel2");
  if (/registr|cargue|carga|generaci/.test(t)) agregar("registro");
  if (/liberaci|liberad|programaci/.test(t)) acciones.add("REGISTRAR_LIBERACION");
  if (/rechaz|devuel/.test(t)) acciones.add("RECHAZAR");
  if (/anula/.test(t)) acciones.add("ANULAR");
  if (/reinici/.test(t)) acciones.add("REINICIAR");
  return TODAS.filter((a) => acciones.has(a));
}

// "Subsecretaría de Gestión Institucional" = "gestion institucional" (sin tildes, mayúsculas ni prefijo)
export const claveSubsecretaria = (t) => normal(t).replace(/^(la )?subsecretaria( de| del)?\s*/, "").trim();

// Correos que deben ir en copia para una acción de un trámite dirigido a `subsecretaria`
export function copiasPara(accion, destinatariosCopia = [], { subsecretaria = "" } = {}) {
  const delTramite = claveSubsecretaria(subsecretaria);
  return destinatariosCopia
    .filter((c) => accionesDeCopia(c.recibe).includes(accion))
    .filter((c) => !c.subsecretaria || claveSubsecretaria(c.subsecretaria) === delTramite)
    .map((c) => c.correo);
}
