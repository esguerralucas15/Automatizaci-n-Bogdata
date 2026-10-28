// Validación de la plantilla "Plantilla_Usuarios_Bitacora.xlsx" (hojas Usuarios y Solo copia).
// No toca la base de datos ni lee archivos: recibe filas ya leídas, así se prueba fácil.
import { ROLES, CORREO } from "../models/roles.js";
import { accionesDeCopia } from "./copias.js";

// Encabezados de la plantilla -> campo
const COLUMNAS_USUARIOS = {
  "correo institucional": "correo",
  "nombre completo": "nombre",
  cargo: "cargo",
  rol: "rol",
  "subsecretaría": "subsecretaria",
  subsecretaria: "subsecretaria",
  activo: "activo",
  observaciones: "observaciones",
};
const COLUMNAS_COPIA = {
  correo: "correo",
  "nombre o área": "nombre",
  "nombre o area": "nombre",
  "qué correos debe recibir": "recibe",
  "que correos debe recibir": "recibe",
  "subsecretaría": "subsecretaria",
  "subsecretaria": "subsecretaria",
};

// Nombres que alguien podría escribir en lugar del código del rol
const SINONIMOS_ROL = {
  revisor: "revisor", revisora: "revisor",
  director: "director", "director financiero": "director", directora: "director",
  "responsable de presupuesto": "director",
  subsecretario: "subsecretario", subsecretaria: "subsecretario", "ordenador del gasto": "subsecretario",
  admin: "admin", administradora: "admin", administrador: "admin",
};

const texto = (v) => (v === undefined || v === null ? "" : String(v).trim());
const normal = (v) => texto(v).toLowerCase().replace(/\s+/g, " ");

// encabezados: ["Correo institucional", ...]  filas: [["ana@...", ...], ...]
// numeroFila: número de la fila en Excel, para los mensajes de error
function aObjetos(encabezados, filas, mapa, primeraFila) {
  const campos = encabezados.map((h) => mapa[normal(h)] ?? null);
  return filas.map((fila, i) => {
    const obj = { numeroFila: primeraFila + i };
    campos.forEach((c, j) => { if (c) obj[c] = texto(fila[j]); });
    return obj;
  });
}

const esEjemplo = (o) => /\(ejemplo\)/i.test(o.nombre ?? "");
const estaVacia = (o) => Object.entries(o).every(([k, v]) => k === "numeroFila" || v === "");

export function validarUsuarios({ encabezados, filas, primeraFila = 2 }) {
  const faltan = ["correo", "nombre", "rol"].filter(
    (c) => !encabezados.some((h) => COLUMNAS_USUARIOS[normal(h)] === c)
  );
  if (faltan.length) {
    return { usuarios: [], errores: [`La hoja Usuarios no tiene las columnas: ${faltan.join(", ")}`] };
  }

  const usuarios = [];
  const errores = [];
  const vistos = new Map();

  for (const o of aObjetos(encabezados, filas, COLUMNAS_USUARIOS, primeraFila)) {
    if (estaVacia(o) || esEjemplo(o)) continue;
    const f = `Fila ${o.numeroFila}`;
    const correo = normal(o.correo);
    const rol = SINONIMOS_ROL[normal(o.rol)];
    const activoTxt = normal(o.activo || "SI").replace("í", "i");
    const problemas = [];

    if (!CORREO.test(correo)) problemas.push(`correo no válido ("${o.correo}")`);
    if (!o.nombre) problemas.push("falta el nombre");
    if (!rol) problemas.push(`rol no válido ("${o.rol}"); use ${ROLES.join(", ")}`);
    if (rol === "subsecretario" && !o.subsecretaria) problemas.push("falta la subsecretaría");
    if (!["si", "no"].includes(activoTxt)) problemas.push(`Activo debe ser SI o NO ("${o.activo}")`);
    if (vistos.has(correo)) problemas.push(`correo repetido (ya está en la fila ${vistos.get(correo)})`);

    if (problemas.length) {
      errores.push(`${f}: ${problemas.join("; ")}`);
      continue;
    }
    vistos.set(correo, o.numeroFila);
    usuarios.push({
      _id: correo,
      nombre: o.nombre.replace(/\s+/g, " "),
      cargo: o.cargo ?? "",
      rol,
      subsecretaria: rol === "subsecretario" ? o.subsecretaria : "",
      observaciones: o.observaciones ?? "",
      activo: activoTxt === "si",
    });
  }

  if (!usuarios.length && !errores.length) errores.push("La hoja Usuarios no tiene personas");
  if (usuarios.length && !usuarios.some((u) => u.rol === "admin" && u.activo)) {
    errores.push("Debe haber al menos una persona activa con rol admin");
  }
  return { usuarios, errores };
}

export function validarCopias({ encabezados, filas, primeraFila = 2 }) {
  if (!encabezados?.length) return { copias: [], errores: [] };
  const copias = [];
  const errores = [];
  for (const o of aObjetos(encabezados, filas, COLUMNAS_COPIA, primeraFila)) {
    if (estaVacia(o) || esEjemplo(o)) continue;
    const correo = normal(o.correo);
    if (!CORREO.test(correo)) {
      errores.push(`Solo copia, fila ${o.numeroFila}: correo no válido ("${o.correo}")`);
      continue;
    }
    const recibe = o.recibe || "Todos";
    if (!accionesDeCopia(recibe).length) {
      errores.push(
        `Solo copia, fila ${o.numeroFila}: no se entiende qué correos recibe ("${recibe}"). ` +
          "Use por ejemplo: Registro de WF y Lote, Aprobación nivel 1, Aprobación nivel 2, Liberación, Rechazo o Todos"
      );
      continue;
    }
    copias.push({ correo, nombre: o.nombre ?? "", recibe, subsecretaria: o.subsecretaria ?? "" });
  }
  return { copias, errores };
}
