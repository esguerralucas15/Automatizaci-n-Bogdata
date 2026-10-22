// Carga los usuarios y los destinatarios de copia desde la plantilla de Excel.
//
//   npm run cargar-usuarios -- datos/usuarios.xlsx     (datos reales, carpeta ignorada por git)
//   npm run datos-prueba                               (personas inventadas para desarrollo)
//
// - Si el archivo tiene errores, no se carga nada y se muestran las filas a corregir.
// - Se puede correr varias veces: crea los nuevos y actualiza los existentes (no duplica).
// - No borra a nadie: quien ya no está en el Excel se reporta para desactivarlo desde la app.
// - Cada alta o cambio queda en la bitácora como hecho por "Carga inicial (script)".
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import { validarConfiguracion, CONFIG_ID } from "../config/config.js";
import { conectarDB, desconectarDB } from "../config/db.js";
import Usuario from "../models/Usuario.js";
import Configuracion from "../models/Configuracion.js";
import { validarUsuarios, validarCopias } from "../services/usuariosExcel.js";
import { insertarEvento, SISTEMA } from "../services/bitacora.js";

const ruta = process.argv[2];
if (!ruta) {
  console.error("Uso: npm run cargar-usuarios -- <archivo.xlsx>");
  process.exit(1);
}

// Excel guarda algunos valores como objetos (correos con hipervínculo, texto con formato, fórmulas)
function valorCelda(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.text !== undefined) return typeof v.text === "object" ? valorCelda(v.text) : v.text;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.result !== undefined) return v.result;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return v;
}

function leerHoja(libro, nombre) {
  const hoja = libro.getWorksheet(nombre);
  if (!hoja) return { encabezados: [], filas: [] };
  const filas = [];
  hoja.eachRow({ includeEmpty: true }, (fila, n) => {
    filas[n - 1] = fila.values.slice(1).map(valorCelda); // values[0] no se usa en ExcelJS
  });
  const [encabezados = [], ...resto] = filas;
  return { encabezados: encabezados.map(String), filas: resto.map((f) => f ?? []) };
}

const CAMPOS = ["nombre", "cargo", "rol", "subsecretaria", "observaciones", "activo"];

async function main() {
  validarConfiguracion();

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);

  const u = validarUsuarios(leerHoja(libro, "Usuarios"));
  const c = validarCopias(leerHoja(libro, "Solo copia"));
  const errores = [...u.errores, ...c.errores];
  if (errores.length) {
    console.error(`\nEl archivo tiene ${errores.length} error(es). No se cargó nada:\n`);
    errores.forEach((e) => console.error(`  • ${e}`));
    console.error("\nCorrige el Excel y vuelve a correr el comando.\n");
    process.exit(1);
  }

  await conectarDB();
  const resumen = { creados: 0, actualizados: 0, sinCambios: 0 };

  for (const nuevo of u.usuarios) {
    const sesion = await mongoose.startSession();
    try {
      await sesion.withTransaction(async () => {
        const actual = await Usuario.findById(nuevo._id).session(sesion).lean();
        if (!actual) {
          await Usuario.create([nuevo], { session: sesion });
          await insertarEvento({ accion: "USUARIO_CREADO", usuario: SISTEMA, datos: nuevo }, sesion);
          resumen.creados++;
          return;
        }
        const cambios = Object.fromEntries(CAMPOS.filter((k) => actual[k] !== nuevo[k]).map((k) => [k, { antes: actual[k], ahora: nuevo[k] }]));
        if (!Object.keys(cambios).length) {
          resumen.sinCambios++;
          return;
        }
        await Usuario.updateOne({ _id: nuevo._id }, { $set: nuevo }, { session: sesion });
        const accion = cambios.rol ? "ROL_CAMBIADO" : cambios.activo ? (nuevo.activo ? "USUARIO_REACTIVADO" : "USUARIO_DESACTIVADO") : "USUARIO_ACTUALIZADO";
        await insertarEvento({ accion, usuario: SISTEMA, datos: { correo: nuevo._id, cambios } }, sesion);
        resumen.actualizados++;
      });
    } finally {
      await sesion.endSession();
    }
  }

  await Configuracion.updateOne({ _id: CONFIG_ID }, { $set: { destinatariosCopia: c.copias } }, { upsert: true });

  const enExcel = new Set(u.usuarios.map((x) => x._id));
  const fuera = await Usuario.find({ activo: true, _id: { $nin: [...enExcel] } }, { nombre: 1 }).lean();

  console.log(`\nUsuarios: ${resumen.creados} creados, ${resumen.actualizados} actualizados, ${resumen.sinCambios} sin cambios.`);
  console.log(`Destinatarios de copia: ${c.copias.length}.`);
  const porRol = u.usuarios.reduce((acc, x) => ((acc[x.rol] = (acc[x.rol] ?? 0) + 1), acc), {});
  console.log("Por rol:", Object.entries(porRol).map(([r, n]) => `${r} ${n}`).join(" · "));
  if (fuera.length) {
    console.log("\nEstas personas activas no están en el Excel (desactívalas desde la app si ya no participan):");
    fuera.forEach((p) => console.log(`  • ${p.nombre} <${p._id}>`));
  }
  console.log("");
}

try {
  await main();
} catch (err) {
  console.error("No se pudo cargar:", err.message);
  process.exitCode = 1;
} finally {
  await desconectarDB().catch(() => {});
}
