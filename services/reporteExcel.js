// Exporta los tiempos y la bitácora del periodo a Excel (para la administración).
import ExcelJS from "exceljs";
import { ETAPAS } from "./tiempos.js";
import { NOMBRE_ROL } from "../models/roles.js";
import { etiquetaAccion, etiquetaEstado } from "./flujo.js";

const ROJO = "FFBB2D33";
const horas = (min) => (min === null || min === undefined ? null : Math.round((min / 60) * 100) / 100);
// Excel no maneja zonas horarias: se escribe la hora de Bogotá
const bogota = (d) => (d ? new Date(new Date(d).getTime() - 5 * 3600e3) : null);

function hoja(libro, nombre, columnas, filas) {
  const ws = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map(([header, key, width, numFmt]) => ({ header, key, width, style: numFmt ? { numFmt } : {} }));
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJO } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  ws.getRow(1).height = 30;
  filas.forEach((f) => ws.addRow(f));
  ws.eachRow((r, n) => { if (n > 1) r.font = { name: "Arial", size: 10 }; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return ws;
}

export async function libroTiempos({ periodo, ind, porTramite, pasos, nombres }) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Bitácora de Pagos";

  const info = libro.addWorksheet("Léame");
  [
    ["Bitácora de Trámites de Pago – tiempos de respuesta"],
    [`Periodo: ${periodo.desde} a ${periodo.hasta} (hora de Bogotá)`],
    [""],
    ["Tiempo de respuesta de un paso = desde que quedó registrado el paso anterior del trámite hasta que la persona registró el suyo."],
    ["Se le atribuye a quien registró el paso. Son horas calendario (incluyen noches y fines de semana)."],
    ["Registro tardío = minutos entre la hora que la persona declaró para BOGDATA y la hora en que lo registró en la bitácora."],
  ].forEach((f) => info.addRow(f));
  info.getRow(1).font = { bold: true, size: 14, name: "Arial" };
  info.getColumn(1).width = 120;

  hoja(libro, "Por persona", [
    ["Persona", "nombre", 32], ["Correo", "correo", 34], ["Rol", "rol", 26], ["Pasos registrados", "pasos", 12],
    ["Promedio de respuesta (h)", "prom", 14, "0.00"], ["Mediana (h)", "med", 12, "0.00"], ["Máximo (h)", "max", 12, "0.00"],
    ["Registro tardío promedio (h)", "tard", 14, "0.00"], ["Pendientes ahora", "pend", 12], ["Espera más larga ahora (h)", "esp", 14, "0.00"],
  ], ind.porPersona.map((p) => ({
    nombre: p.nombre, correo: p.correo, rol: NOMBRE_ROL[p.rol] ?? p.rol, pasos: p.pasos,
    prom: horas(p.promedio), med: horas(p.mediana), max: horas(p.maximo), tard: horas(p.tardanzaPromedio),
    pend: p.pendientes.length, esp: horas(p.esperaMasLarga),
  })));

  hoja(libro, "Por etapa", [
    ["Etapa", "etapa", 28], ["Veces", "n", 10], ["Promedio (h)", "prom", 14, "0.00"], ["Mediana (h)", "med", 12, "0.00"], ["Máximo (h)", "max", 12, "0.00"],
  ], ind.porEtapa.map((e) => ({ etapa: e.etiqueta, n: e.n, prom: horas(e.promedio), med: horas(e.mediana), max: horas(e.maximo) })));

  const medidas = ETAPAS.slice(0, 6);
  hoja(libro, "Por trámite", [
    ["Trámite", "id", 15], ["WF", "wf", 10], ["Lote", "lote", 14], ["Valor", "valor", 16, '"$"#,##0'], ["Estado", "estado", 26],
    ...medidas.map((e) => [`${e.etiqueta} (h)`, e.accion, 14, "0.00"]),
    ["Rechazos", "rechazos", 10], ["Total (h)", "total", 12, "0.00"], ["Abierto", "abierto", 9],
  ], porTramite.map((t) => ({
    id: t._id, wf: t.wfActual, lote: t.lote ?? "", valor: t.valorTotal, estado: etiquetaEstado(t.estado),
    ...Object.fromEntries(medidas.map((e) => [e.accion, horas(t.etapas[e.accion] ?? null)])),
    rechazos: t.rechazos, total: horas(t.totalMin), abierto: t.abierto ? "Sí" : "No",
  })));

  hoja(libro, "Bitácora", [
    ["#", "sec", 8], ["Fecha y hora", "fecha", 18, "yyyy-mm-dd hh:mm"], ["Trámite", "tramite", 15], ["Paso", "paso", 40],
    ["Persona", "persona", 30], ["Rol", "rol", 24], ["Hora declarada BOGDATA", "decl", 18, "yyyy-mm-dd hh:mm"],
    ["Tiempo de respuesta (h)", "esp", 14, "0.00"], ["Observación", "obs", 40],
  ], [...pasos].sort((a, b) => a.secuencia - b.secuencia).map((p) => ({
    sec: p.secuencia, fecha: bogota(p.registradoEn), tramite: p.tramite, paso: etiquetaAccion(p.accion),
    persona: p.usuario.nombre ?? nombres[p.usuario.correo], rol: NOMBRE_ROL[p.usuario.rol] ?? p.usuario.rol,
    decl: bogota(p.horaDeclaradaBogdata), esp: horas(p.esperaMin), obs: p.observacion || p.datos?.motivo || "",
  })));

  return libro.xlsx.writeBuffer();
}
