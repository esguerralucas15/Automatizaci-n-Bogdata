import { test } from "node:test";
import assert from "node:assert/strict";
import { validarHoraDeclarada } from "../services/registrarAccion.js";
import { aFechaHora } from "../services/tiempo.js";
import { ErrorFlujo } from "../services/flujo.js";

const instante = aFechaHora("2026-10-25", "10:00");

test("hora declarada opcional: vacía devuelve null", () => {
  assert.equal(validarHoraDeclarada("", { instante }), null);
  assert.equal(validarHoraDeclarada(undefined, { instante }), null);
});

test("se interpreta en hora de Bogotá", () => {
  assert.equal(validarHoraDeclarada("2026-10-25T09:30", { instante }).toISOString(), "2026-10-25T14:30:00.000Z");
});

test("no se acepta una hora futura ni anterior al paso previo", () => {
  assert.throws(() => validarHoraDeclarada("2026-10-25T10:05", { instante }), (e) => e instanceof ErrorFlujo && /futura/.test(e.errores.horaDeclaradaBogdata));
  assert.throws(() => validarHoraDeclarada("2026-10-25T08:00", { instante, desde: aFechaHora("2026-10-25", "08:30") }), /Revisa/);
  // mismo minuto del paso previo: se acepta
  assert.ok(validarHoraDeclarada("2026-10-25T08:30", { instante, desde: new Date(aFechaHora("2026-10-25", "08:30").getTime() + 42_000) }));
  assert.throws(() => validarHoraDeclarada("ayer", { instante }), /Revisa/);
});
