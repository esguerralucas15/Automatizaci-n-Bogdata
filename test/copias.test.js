import { test } from "node:test";
import assert from "node:assert/strict";
import { accionesDeCopia, copiasPara } from "../services/copias.js";
import { validarCopias } from "../services/usuariosExcel.js";

test("textos de la hoja de Cristian", () => {
  assert.deepEqual(accionesDeCopia("Registro de WF y Lote"), ["REGISTRAR_WF", "REGISTRAR_LOTE", "REINICIAR"]);
  assert.deepEqual(accionesDeCopia("aprobación del WF y lote nivel 1"), ["APROBAR_WF_PRESUPUESTO", "FIRMAR_LOTE_PRESUPUESTO"]);
  assert.deepEqual(accionesDeCopia("aprobación del WF y lote nivel 2"), ["APROBAR_WF_ORDENADOR", "FIRMAR_LOTE_ORDENADOR"]);
});

test("otros textos: liberación, rechazo, todos, solo WF, combinaciones", () => {
  assert.deepEqual(accionesDeCopia("Liberación para pago"), ["REGISTRAR_LIBERACION"]);
  assert.deepEqual(accionesDeCopia("Rechazos y liberación"), ["REGISTRAR_LIBERACION", "RECHAZAR"]);
  assert.equal(accionesDeCopia("Todos").length, 10);
  assert.deepEqual(accionesDeCopia("Aprobación del WF nivel 2"), ["APROBAR_WF_ORDENADOR"]);
  assert.deepEqual(accionesDeCopia("Firma del lote nivel 1"), ["FIRMAR_LOTE_PRESUPUESTO"]);
  assert.deepEqual(accionesDeCopia("cualquier cosa"), []);
});

const copias = [
  { correo: "carmona@sed.gov.co", recibe: "Registro de WF y Lote" },
  { correo: "mrubio@sed.gov.co", recibe: "Registro de WF y Lote" },
  { correo: "icamelo@sed.gov.co", recibe: "aprobación del WF y lote nivel 1" },
  { correo: "revisor1@sed.gov.co", recibe: "aprobación del WF y lote nivel 2" },
  { correo: "revisor2@sed.gov.co", recibe: "aprobación del WF y lote nivel 2" },
];

test("cada acción lleva en copia solo a su grupo", () => {
  assert.deepEqual(copiasPara("REGISTRAR_WF", copias), ["carmona@sed.gov.co", "mrubio@sed.gov.co"]);
  assert.deepEqual(copiasPara("FIRMAR_LOTE_PRESUPUESTO", copias), ["icamelo@sed.gov.co"]);
  assert.deepEqual(copiasPara("APROBAR_WF_ORDENADOR", copias), ["revisor1@sed.gov.co", "revisor2@sed.gov.co"]);
  assert.deepEqual(copiasPara("REGISTRAR_LIBERACION", copias), []);
});

test("la hoja Solo copia rechaza textos que no se entienden", () => {
  const { copias: ok, errores } = validarCopias({
    encabezados: ["Correo", "Nombre o área", "Qué correos debe recibir"],
    filas: [["a@sed.gov.co", "A", "nivel 2"], ["b@sed.gov.co", "B", "los de siempre"]],
  });
  assert.equal(ok.length, 1);
  assert.match(errores[0], /fila 3: no se entiende/);
});

test("copias por subsecretaría: cada asistente solo recibe los trámites de su subsecretaría", () => {
  const asistentes = [
    { correo: "icamelo@sed.gov.co", recibe: "aprobación del WF y lote nivel 1, rechazos, reinicios y anulaciones", subsecretaria: "Subsecretaria de Integración Interinstitucional" },
    { correo: "spachecor@sed.gov.co", recibe: "aprobación del WF y lote nivel 1, rechazos, reinicios y anulaciones", subsecretaria: "Subsecretaria de Calidad y Pertinencia" },
    { correo: "revisor1@sed.gov.co", recibe: "aprobación del WF y lote nivel 2" },
  ];
  const deCalidad = { subsecretaria: "Subsecretaría de Calidad y pertinencia" }; // con tilde y otra mayúscula: debe coincidir
  assert.deepEqual(copiasPara("APROBAR_WF_PRESUPUESTO", asistentes, deCalidad), ["spachecor@sed.gov.co"]);
  assert.deepEqual(copiasPara("FIRMAR_LOTE_PRESUPUESTO", asistentes, { subsecretaria: "Integración Interinstitucional" }), ["icamelo@sed.gov.co"]);
  assert.deepEqual(copiasPara("RECHAZAR", asistentes, deCalidad), ["spachecor@sed.gov.co"]);
  assert.deepEqual(copiasPara("REINICIAR", asistentes, deCalidad), ["spachecor@sed.gov.co"]);
  assert.deepEqual(copiasPara("APROBAR_WF_ORDENADOR", asistentes, deCalidad), ["revisor1@sed.gov.co"]); // sin subsecretaría = todas
  assert.deepEqual(copiasPara("APROBAR_WF_PRESUPUESTO", asistentes, { subsecretaria: "" }), []);
});

test("la hoja Solo copia lee la columna Subsecretaría", () => {
  const { copias } = validarCopias({
    encabezados: ["Correo", "Nombre o área", "Qué correos debe recibir", "Subsecretaría"],
    filas: [["jguerreroc@sed.gov.co", "Julián", "aprobación del WF y lote nivel 1", "Subsecretaria de Gestión Institucional"]],
  });
  assert.equal(copias[0].subsecretaria, "Subsecretaria de Gestión Institucional");
});
