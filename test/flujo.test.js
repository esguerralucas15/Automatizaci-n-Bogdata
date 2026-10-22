import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTADOS, ACCIONES, aplicarAccion, accionesDisponibles, esResponsable,
  validarDatos, aDinero, destinatariosDe, ErrorFlujo,
} from "../services/flujo.js";

const revisor = { correo: "ana@ejemplo.gov.co", nombre: "Ana", rol: "revisor" };
const otroRevisor = { correo: "luis@ejemplo.gov.co", nombre: "Luis", rol: "revisor" };
const director = { correo: "carlos@ejemplo.gov.co", nombre: "Carlos", rol: "director" };
const subsec = { correo: "laura@ejemplo.gov.co", nombre: "Laura", rol: "subsecretario" };
const otroSubsec = { correo: "pedro@ejemplo.gov.co", nombre: "Pedro", rol: "subsecretario" };
const admin = { correo: "marta@ejemplo.gov.co", nombre: "Marta", rol: "admin" };

const datosWF = {
  wf: "423", segmento: "SE01", valorTotal: "1.250.000", numRegistros: "3",
  director: "Carlos@Ejemplo.gov.co", ordenador: "laura@ejemplo.gov.co",
};

// Aplica una acción y devuelve el trámite con el estado nuevo
function paso(tramite, accion, usuario, datos = {}) {
  const r = aplicarAccion({ tramite, accion, usuario, datos });
  return { ...(tramite ?? { ...r.datos, revisor: usuario.correo }), estado: r.estadoNuevo };
}

test("todas las acciones apuntan a estados que existen", () => {
  for (const [codigo, a] of Object.entries(ACCIONES)) {
    assert.ok(ESTADOS[a.a], `${codigo} -> ${a.a}`);
    for (const d of a.desde) assert.ok(d === null || ESTADOS[d], `${codigo} desde ${d}`);
  }
});

test("camino completo: del cargue a la liberación", () => {
  let t = paso(null, "REGISTRAR_WF", revisor, datosWF);
  assert.equal(t.estado, "WF_CARGADO");
  assert.equal(t.director, "carlos@ejemplo.gov.co"); // correo normalizado
  assert.equal(t.valorTotal, 1250000);
  assert.equal(t.numRegistros, 3);

  t = paso(t, "APROBAR_WF_PRESUPUESTO", director);
  assert.equal(t.estado, "WF_APROBADO_PRESUPUESTO");
  t = paso(t, "APROBAR_WF_ORDENADOR", subsec);
  assert.equal(t.estado, "WF_APROBADO");
  t = paso(t, "REGISTRAR_LOTE", otroRevisor, { lote: "0000001352", documentosContables: "300000687, 300000688" });
  assert.equal(t.estado, "LOTE_CREADO");
  t = paso(t, "FIRMAR_LOTE_PRESUPUESTO", director);
  t = paso(t, "FIRMAR_LOTE_ORDENADOR", subsec);
  assert.equal(t.estado, "LOTE_FIRMADO");
  t = paso(t, "REGISTRAR_LIBERACION", revisor, { avisoEmbargos: "no" });
  assert.equal(t.estado, "LIBERADO");
  assert.deepEqual(accionesDisponibles(t, revisor), []);
});

test("solo el subsecretario asignado registra la firma del ordenador del gasto", () => {
  const t = { estado: "WF_APROBADO_PRESUPUESTO", director: director.correo, ordenador: subsec.correo };
  assert.equal(esResponsable(t, subsec), true);
  assert.equal(esResponsable(t, otroSubsec), false);
  assert.throws(() => aplicarAccion({ tramite: t, accion: "APROBAR_WF_ORDENADOR", usuario: otroSubsec }), /No te corresponde/);
});

test("nadie se salta un paso ni firma por otro rol", () => {
  const t = { estado: "WF_CARGADO", director: director.correo, ordenador: subsec.correo };
  assert.throws(() => aplicarAccion({ tramite: t, accion: "APROBAR_WF_ORDENADOR", usuario: subsec }), ErrorFlujo);
  assert.throws(() => aplicarAccion({ tramite: t, accion: "APROBAR_WF_PRESUPUESTO", usuario: revisor }), /No te corresponde/);
  assert.throws(() => aplicarAccion({ tramite: t, accion: "APROBAR_WF_PRESUPUESTO", usuario: admin }), /No te corresponde/);
  assert.deepEqual(accionesDisponibles(t, director).sort(), ["APROBAR_WF_PRESUPUESTO", "RECHAZAR"]);
});

test("el mismo paso no se registra dos veces", () => {
  const t = { estado: "WF_APROBADO_PRESUPUESTO", director: director.correo, ordenador: subsec.correo };
  assert.throws(() => aplicarAccion({ tramite: t, accion: "APROBAR_WF_PRESUPUESTO", usuario: director }), /ya haya registrado/);
});

test("solo revisores crean trámites", () => {
  assert.deepEqual(accionesDisponibles(null, revisor), ["REGISTRAR_WF"]);
  assert.deepEqual(accionesDisponibles(null, director), []);
  assert.throws(() => aplicarAccion({ tramite: null, accion: "REGISTRAR_WF", usuario: director, datos: datosWF }), /No te corresponde/);
});

test("rechazo, reinicio con nuevo WF y anulación", () => {
  const base = { director: director.correo, ordenador: subsec.correo };
  const r = aplicarAccion({
    tramite: { ...base, estado: "LOTE_FIRMADO_PRESUPUESTO" }, accion: "RECHAZAR", usuario: subsec,
    datos: { motivo: "Valor no coincide", tipoRechazo: "con_anulacion" },
  });
  assert.equal(r.estadoNuevo, "DEVUELTO");
  assert.deepEqual(r.notificar, ["revisor", "director"]); // el ordenador rechaza: avisa también al director

  const devuelto = { ...base, estado: "DEVUELTO" };
  assert.equal(aplicarAccion({ tramite: devuelto, accion: "REINICIAR", usuario: revisor, datos: { wf: "500" } }).estadoNuevo, "WF_CARGADO");
  assert.equal(aplicarAccion({ tramite: devuelto, accion: "ANULAR", usuario: revisor, datos: { motivo: "Duplicado" } }).estadoNuevo, "ANULADO");
  assert.deepEqual(destinatariosDe("RECHAZAR", "WF_CARGADO"), ["revisor"]);
});

test("no se rechaza en etapas que no son de firma", () => {
  const t = { estado: "WF_APROBADO", director: director.correo, ordenador: subsec.correo };
  assert.ok(!accionesDisponibles(t, revisor).includes("RECHAZAR"));
});

test("validación de datos con mensajes por campo", () => {
  try {
    validarDatos("REGISTRAR_WF", { wf: "WF-12", valorTotal: "0", numRegistros: "2.5", director: "no-es-correo" });
    assert.fail("debía fallar");
  } catch (e) {
    assert.ok(e instanceof ErrorFlujo);
    assert.match(e.errores.wf, /solo dígitos/);
    assert.match(e.errores.valorTotal, /mayor que cero/);
    assert.match(e.errores.numRegistros, /entero/);
    assert.match(e.errores.director, /Correo/);
    assert.match(e.errores.segmento, /obligatorio/);
    assert.match(e.errores.ordenador, /obligatorio/);
  }
});

test("los campos que no pertenecen a la acción se descartan", () => {
  const d = validarDatos("APROBAR_WF_PRESUPUESTO", { estado: "LIBERADO", registradoEn: "2020-01-01" });
  assert.deepEqual(d, {});
});

test("documentos contables: lista sin repetidos y con formato", () => {
  assert.deepEqual(validarDatos("REGISTRAR_LOTE", { lote: "1352", documentosContables: "300000687\n300000687;300000690" }).documentosContables, ["300000687", "300000690"]);
  assert.throws(() => validarDatos("REGISTRAR_LOTE", { lote: "1352", documentosContables: "12345" }), ErrorFlujo);
});

test("aDinero entiende el formato colombiano", () => {
  assert.equal(aDinero("$ 1.234.567,89"), 1234567.89);
  assert.equal(aDinero("1.500.000"), 1500000);
  assert.equal(aDinero("1500000"), 1500000);
  assert.equal(aDinero("2500.5"), 2500.5);
  assert.ok(Number.isNaN(aDinero("abc")));
});
