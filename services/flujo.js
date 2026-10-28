// Máquina de estados del trámite: ÚNICA fuente de verdad del proceso.
// Define estados, acciones, quién puede ejecutarlas, qué datos piden y a quién
// se notifica. No toca la base de datos: así se prueba sin MongoDB.
//
// Proceso (manual ZTRM_0014 y procedimiento del área):
//   1. Revisor carga en BOGDATA y obtiene el WF
//   2. Firmas del WF: responsable de presupuesto (director) y ordenador del gasto (subsecretario)
//   3. Revisor genera el lote
//   4. Firmas del lote: director y subsecretario
//   5. Liberación para programación de pago

// "responsable" es el campo del trámite con el correo de quien debe actuar,
// o "revisor" (cualquier usuario con rol revisor puede continuar).
export const ESTADOS = {
  WF_CARGADO: { etiqueta: "WF cargado", espera: "Firma del WF – Responsable de presupuesto", responsable: "director", etapa: 1 },
  WF_APROBADO_PRESUPUESTO: { etiqueta: "WF aprobado por Presupuesto", espera: "Firma del WF – Ordenador del gasto", responsable: "ordenador", etapa: 2 },
  WF_APROBADO: { etiqueta: "WF aprobado", espera: "Generación del lote", responsable: "revisor", etapa: 3 },
  LOTE_CREADO: { etiqueta: "Lote creado", espera: "Firma del lote – Responsable de presupuesto", responsable: "director", etapa: 4 },
  LOTE_FIRMADO_PRESUPUESTO: { etiqueta: "Lote firmado por Presupuesto", espera: "Firma del lote – Ordenador del gasto", responsable: "ordenador", etapa: 5 },
  LOTE_FIRMADO: { etiqueta: "Lote firmado", espera: "Confirmación de liberación", responsable: "revisor", etapa: 6 },
  LIBERADO: { etiqueta: "Liberado para pago", espera: null, responsable: null, etapa: 7, final: true },
  DEVUELTO: { etiqueta: "Devuelto", espera: "Reinicio o anulación (equipo revisor)", responsable: "revisor", etapa: 0 },
  ANULADO: { etiqueta: "Anulado", espera: null, responsable: null, etapa: 0, final: true },
};

// Rol que debe tener la persona según el campo responsable
const ROL_DE_RESPONSABLE = { revisor: "revisor", director: "director", ordenador: "subsecretario" };

const ETAPAS_DE_FIRMA = ["WF_CARGADO", "WF_APROBADO_PRESUPUESTO", "LOTE_CREADO", "LOTE_FIRMADO_PRESUPUESTO"];

// Tipos de campo: texto, numeroWF, dinero, entero, correo, booleano, lista, opcion
// "notificar": claves que el servicio de correo convierte en direcciones:
//   director | ordenador | revisor (quien creó el trámite) | admin
// Además, cada acción lleva en copia a quien la hoja "Solo copia" indique (services/copias.js).
export const ACCIONES = {
  REGISTRAR_WF: {
    etiqueta: "Registrar cargue en BOGDATA",
    desde: [null],
    a: "WF_CARGADO",
    campos: {
      wf: { tipo: "numeroWF", requerido: true, etiqueta: "N.° de WF" },
      segmento: { tipo: "texto", requerido: true, etiqueta: "Segmento" },
      valorTotal: { tipo: "dinero", requerido: true, etiqueta: "Valor total" },
      numRegistros: { tipo: "entero", requerido: true, etiqueta: "N.° de registros" },
      descripcion: { tipo: "texto", requerido: false, etiqueta: "Descripción" },
      director: { tipo: "correo", requerido: true, etiqueta: "Responsable de presupuesto" },
      ordenador: { tipo: "correo", requerido: true, etiqueta: "Ordenador del gasto (subsecretaría a la que va dirigido)" },
    },
    notificar: ["director"],
  },
  APROBAR_WF_PRESUPUESTO: {
    etiqueta: "Registrar firma del WF (Presupuesto)",
    desde: ["WF_CARGADO"],
    a: "WF_APROBADO_PRESUPUESTO",
    campos: {},
    notificar: ["ordenador"],
  },
  APROBAR_WF_ORDENADOR: {
    etiqueta: "Registrar firma del WF (Ordenador del gasto)",
    desde: ["WF_APROBADO_PRESUPUESTO"],
    a: "WF_APROBADO",
    campos: {},
    notificar: ["revisor"],
  },
  REGISTRAR_LOTE: {
    etiqueta: "Registrar lote",
    desde: ["WF_APROBADO"],
    a: "LOTE_CREADO",
    campos: {
      lote: { tipo: "numeroLote", requerido: true, etiqueta: "N.° de lote" },
      documentosContables: { tipo: "lista", formato: "documentoContable", requerido: true, etiqueta: "Documentos contables" },
    },
    notificar: ["director"],
  },
  FIRMAR_LOTE_PRESUPUESTO: {
    etiqueta: "Registrar firma del lote (Presupuesto)",
    desde: ["LOTE_CREADO"],
    a: "LOTE_FIRMADO_PRESUPUESTO",
    campos: {},
    notificar: ["ordenador"],
  },
  FIRMAR_LOTE_ORDENADOR: {
    etiqueta: "Registrar firma del lote (Ordenador del gasto)",
    desde: ["LOTE_FIRMADO_PRESUPUESTO"],
    a: "LOTE_FIRMADO",
    campos: {},
    notificar: ["revisor", "admin"],
  },
  REGISTRAR_LIBERACION: {
    etiqueta: "Confirmar liberación para pago",
    desde: ["LOTE_FIRMADO"],
    a: "LIBERADO",
    campos: {
      avisoEmbargos: { tipo: "booleano", requerido: true, etiqueta: "¿Llegó aviso de embargos?" },
    },
    notificar: ["admin"],
  },
  RECHAZAR: {
    etiqueta: "Registrar rechazo",
    desde: ETAPAS_DE_FIRMA,
    a: "DEVUELTO",
    campos: {
      motivo: { tipo: "texto", requerido: true, etiqueta: "Motivo del rechazo" },
      tipoRechazo: {
        tipo: "opcion",
        requerido: true,
        etiqueta: "Tipo de rechazo",
        opciones: { sin_anulacion: "Rechazo sin anulación", con_anulacion: "Rechazo con anulación" },
      },
    },
    // Al revisor, y al director si quien rechaza es el ordenador (niveles anteriores)
    notificar: (estado) => (ESTADOS[estado].responsable === "ordenador" ? ["revisor", "director"] : ["revisor"]),
  },
  REINICIAR: {
    etiqueta: "Reiniciar con nuevo WF",
    desde: ["DEVUELTO"],
    a: "WF_CARGADO",
    campos: {
      wf: { tipo: "numeroWF", requerido: true, etiqueta: "Nuevo N.° de WF" },
    },
    notificar: ["director"],
  },
  ANULAR: {
    etiqueta: "Anular trámite",
    desde: ["DEVUELTO"],
    a: "ANULADO",
    campos: {
      motivo: { tipo: "texto", requerido: true, etiqueta: "Motivo de la anulación" },
    },
    notificar: ["admin"],
  },
};

export class ErrorFlujo extends Error {
  constructor(mensaje, errores = {}) {
    super(mensaje);
    this.name = "ErrorFlujo";
    this.errores = errores; // { campo: "mensaje" } para mostrar en el formulario
  }
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

// ¿Le corresponde a esta persona actuar en el estado actual del trámite?
export function esResponsable(tramite, usuario) {
  const campo = ESTADOS[tramite.estado]?.responsable;
  if (!campo || !usuario) return false;
  if (usuario.rol !== ROL_DE_RESPONSABLE[campo]) return false;
  if (campo === "revisor") return true; // cualquier revisor puede continuar
  return tramite[campo] === usuario.correo;
}

// Acciones que esta persona puede ejecutar ahora sobre el trámite
// (sin trámite: solo REGISTRAR_WF para revisores)
export function accionesDisponibles(tramite, usuario) {
  if (!usuario) return [];
  if (!tramite) return usuario.rol === "revisor" ? ["REGISTRAR_WF"] : [];
  if (!esResponsable(tramite, usuario)) return [];
  return Object.entries(ACCIONES)
    .filter(([, a]) => a.desde.includes(tramite.estado))
    .map(([codigo]) => codigo);
}

// Claves de destinatarios para una acción ejecutada desde un estado
export function destinatariosDe(accion, estadoAnterior) {
  const n = ACCIONES[accion].notificar;
  return typeof n === "function" ? n(estadoAnterior) : n;
}

export const etiquetaEstado = (estado) => ESTADOS[estado]?.etiqueta ?? estado;
const ETIQUETAS_ADMIN = {
  USUARIO_CREADO: "Usuario creado",
  USUARIO_ACTUALIZADO: "Datos de usuario actualizados",
  ROL_CAMBIADO: "Rol cambiado",
  USUARIO_DESACTIVADO: "Usuario desactivado",
  USUARIO_REACTIVADO: "Usuario reactivado",
  TRAMITE_REASIGNADO: "Firmante reasignado",
};
export const etiquetaAccion = (accion) => ACCIONES[accion]?.etiqueta ?? ETIQUETAS_ADMIN[accion] ?? accion;

// ---------------------------------------------------------------------------
// Validación de datos
// ---------------------------------------------------------------------------

const FORMATOS = {
  numeroWF: { re: /^\d{1,12}$/, msg: "Debe ser un número (solo dígitos)" },
  numeroLote: { re: /^\d{1,12}$/, msg: "Debe ser un número (solo dígitos)" },
  documentoContable: { re: /^3\d{7,9}$/, msg: "Cada documento contable empieza por 3 y tiene entre 8 y 10 dígitos" },
  correo: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: "Correo no válido" },
};

// "$ 1.234.567,89" -> 1234567.89 | "1234567" -> 1234567 | "1.500.000" -> 1500000
export function aDinero(valor) {
  if (typeof valor === "number") return valor;
  let t = String(valor ?? "").replace(/[$\s]/g, "");
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}

const vacio = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

function limpiarCampo(def, crudo) {
  switch (def.tipo) {
    case "texto":
      return { valor: String(crudo).trim() };
    case "numeroWF":
    case "numeroLote": {
      const v = String(crudo).trim();
      return FORMATOS[def.tipo].re.test(v) ? { valor: v } : { error: FORMATOS[def.tipo].msg };
    }
    case "correo": {
      const v = String(crudo).trim().toLowerCase();
      return FORMATOS.correo.re.test(v) ? { valor: v } : { error: FORMATOS.correo.msg };
    }
    case "dinero": {
      const v = aDinero(crudo);
      return Number.isFinite(v) && v > 0 ? { valor: v } : { error: "Escribe un valor mayor que cero (p. ej. 1.250.000)" };
    }
    case "entero": {
      const v = Number(String(crudo).trim());
      return Number.isInteger(v) && v >= 1 ? { valor: v } : { error: "Debe ser un número entero mayor que cero" };
    }
    case "booleano": {
      const t = String(crudo).trim().toLowerCase();
      if (["si", "sí", "true", "1"].includes(t)) return { valor: true };
      if (["no", "false", "0"].includes(t)) return { valor: false };
      return { error: "Elige Sí o No" };
    }
    case "opcion":
      return def.opciones[crudo] ? { valor: crudo } : { error: "Elige una opción de la lista" };
    case "lista": {
      const items = (Array.isArray(crudo) ? crudo : String(crudo).split(/[\s,;]+/))
        .map((x) => String(x).trim())
        .filter(Boolean);
      const unicos = [...new Set(items)];
      const formato = FORMATOS[def.formato];
      const malos = formato ? unicos.filter((x) => !formato.re.test(x)) : [];
      if (malos.length) return { error: `${formato.msg}. Revisa: ${malos.join(", ")}` };
      return unicos.length ? { valor: unicos } : { error: "Este dato es obligatorio" };
    }
    default:
      throw new Error(`Tipo de campo desconocido: ${def.tipo}`);
  }
}

// Devuelve solo los campos definidos para la acción, ya convertidos
export function validarDatos(accion, datos = {}) {
  const def = ACCIONES[accion];
  if (!def) throw new ErrorFlujo(`Acción desconocida: ${accion}`);
  const limpios = {};
  const errores = {};
  for (const [nombre, campo] of Object.entries(def.campos)) {
    const crudo = datos[nombre];
    if (vacio(crudo)) {
      if (campo.requerido) errores[nombre] = "Este dato es obligatorio";
      continue;
    }
    const r = limpiarCampo(campo, crudo);
    if (r.error) errores[nombre] = r.error;
    else limpios[nombre] = r.valor;
  }
  if (Object.keys(errores).length) throw new ErrorFlujo("Revisa los datos marcados", errores);
  return limpios;
}

// ---------------------------------------------------------------------------
// Aplicar una acción (sin efectos: el servicio registrarEvento la persiste)
// ---------------------------------------------------------------------------

// tramite: estado actual (null para REGISTRAR_WF)
// usuario: { correo, nombre, rol } de la sesión
// Devuelve { estadoAnterior, estadoNuevo, datos, notificar }
export function aplicarAccion({ tramite, accion, usuario, datos }) {
  const def = ACCIONES[accion];
  if (!def) throw new ErrorFlujo(`Acción desconocida: ${accion}`);

  const estadoAnterior = tramite?.estado ?? null;
  if (!def.desde.includes(estadoAnterior)) {
    throw new ErrorFlujo(
      estadoAnterior
        ? `No se puede "${def.etiqueta.toLowerCase()}" cuando el trámite está en "${etiquetaEstado(estadoAnterior)}". Es posible que otra persona ya haya registrado este paso.`
        : "El trámite no existe"
    );
  }
  if (!accionesDisponibles(tramite, usuario).includes(accion)) {
    throw new ErrorFlujo("No te corresponde registrar este paso del trámite");
  }

  const limpios = validarDatos(accion, datos);
  return {
    estadoAnterior,
    estadoNuevo: def.a,
    datos: limpios,
    notificar: destinatariosDe(accion, estadoAnterior),
  };
}
