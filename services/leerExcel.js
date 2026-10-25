// Lectura de la plantilla de usuarios (.xlsx) con ExcelJS
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";

// Abre el .xlsx quitando las notas (comentarios) de las celdas: no tienen datos y
// ExcelJS falla con las notas que guardan algunas herramientas (rutas absolutas en
// los .rels, como en la plantilla generada con openpyxl).
export async function abrirLibro(archivo) {
  const zip = await JSZip.loadAsync(await readFile(archivo));
  const NOTAS = /<Relationship\b[^>]*Type="[^"]*\/(comments|vmlDrawing)"[^>]*\/>/g;
  for (const nombre of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/_rels\/.+\.rels$/.test(n))) {
    const xml = await zip.file(nombre).async("string");
    if (NOTAS.test(xml)) zip.file(nombre, xml.replace(NOTAS, ""));
    NOTAS.lastIndex = 0;
  }
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await zip.generateAsync({ type: "nodebuffer" }));
  return libro;
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

export function leerHoja(libro, nombre) {
  const hoja = libro.getWorksheet(nombre);
  if (!hoja) return { encabezados: [], filas: [] };
  const filas = [];
  hoja.eachRow({ includeEmpty: true }, (fila, n) => {
    filas[n - 1] = fila.values.slice(1).map(valorCelda); // values[0] no se usa en ExcelJS
  });
  const [encabezados = [], ...resto] = filas;
  return { encabezados: encabezados.map(String), filas: resto.map((f) => f ?? []) };
}
