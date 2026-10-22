import { test } from "node:test";
import assert from "node:assert/strict";
import { canonico, calcularHash, verificarCadena, HASH_INICIAL } from "../services/hash.js";

function cadena(n) {
  const eventos = [];
  let anterior = HASH_INICIAL;
  for (let i = 1; i <= n; i++) {
    const e = {
      secuencia: i, tramite: "TR-2026-0001", accion: "APROBAR_WF_PRESUPUESTO",
      estadoAnterior: "WF_CARGADO", estadoNuevo: "WF_APROBADO_PRESUPUESTO",
      usuario: { correo: "carlos@ejemplo.gov.co", nombre: "Carlos", rol: "director" },
      registradoEn: new Date(Date.UTC(2026, 9, 20, 15, i)), datos: { n: i }, hashAnterior: anterior,
    };
    e.hash = calcularHash(anterior, e);
    anterior = e.hash;
    eventos.push(e);
  }
  return eventos;
}

test("canonico no depende del orden de las llaves", () => {
  assert.equal(canonico({ b: 1, a: { d: [1, 2], c: null } }), canonico({ a: { c: null, d: [1, 2] }, b: 1 }));
});

test("una cadena intacta se verifica", () => {
  assert.deepEqual(verificarCadena(cadena(5)), { ok: true, total: 5 });
});

test("detecta un evento modificado", () => {
  const ev = cadena(5);
  ev[2].usuario.nombre = "Otra persona";
  const r = verificarCadena(ev);
  assert.equal(r.ok, false);
  assert.equal(r.secuencia, 3);
  assert.match(r.motivo, /modificado/);
});

test("detecta un evento borrado", () => {
  const ev = cadena(5);
  ev.splice(1, 1);
  const r = verificarCadena(ev);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Falta el evento 2/);
});

test("detecta una hora cambiada", () => {
  const ev = cadena(3);
  ev[0].registradoEn = new Date(ev[0].registradoEn.getTime() - 3600_000);
  assert.equal(verificarCadena(ev).ok, false);
});
