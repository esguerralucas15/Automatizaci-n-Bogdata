import { test } from "node:test";
import assert from "node:assert/strict";
import {
  partesBogota,
  aFechaHora,
  horaLegible,
  fechaLegible,
  minutosDe,
  horaDeMinutos,
  calendarioMes,
} from "../services/tiempo.js";

test("partesBogota convierte UTC a hora de Bogotá", () => {
  const p = partesBogota(new Date("2026-10-13T21:35:00Z"));
  assert.deepEqual(p, { fecha: "2026-10-13", hora: "16:35", minutos: 995, diaSemana: 2 });
});

test("partesBogota respeta el cambio de día (noche en Bogotá = madrugada UTC)", () => {
  const p = partesBogota(new Date("2026-10-14T03:00:00Z"));
  assert.equal(p.fecha, "2026-10-13");
  assert.equal(p.hora, "22:00");
});

test("partesBogota: sábado 10 de octubre es el día 6", () => {
  assert.equal(partesBogota(aFechaHora("2026-10-10", "07:00")).diaSemana, 6);
});

test("aFechaHora crea el instante UTC correcto", () => {
  assert.equal(aFechaHora("2026-10-13", "17:30").toISOString(), "2026-10-13T22:30:00.000Z");
});

test("horaLegible", () => {
  assert.equal(horaLegible("16:30"), "4:30 p.m.");
  assert.equal(horaLegible("07:00"), "7:00 a.m.");
  assert.equal(horaLegible("12:00"), "12:00 m.");
  assert.equal(horaLegible("12:30"), "12:30 p.m.");
});

test("fechaLegible", () => {
  assert.equal(fechaLegible("2026-10-24"), "sábado 24 de octubre");
  assert.equal(fechaLegible("2026-12-01"), "martes 1 de diciembre");
});

test("minutosDe y horaDeMinutos", () => {
  assert.equal(minutosDe("16:45"), 1005);
  assert.equal(horaDeMinutos(1005), "16:45");
});

test("calendarioMes usa el mes de Bogotá aunque en UTC ya sea el mes siguiente", () => {
  // 31-oct 9:00 p.m. en Bogotá = 1-nov 02:00 UTC
  const c = calendarioMes(new Date("2026-11-01T02:00:00Z"));
  assert.equal(c.mes, "Octubre");
  assert.equal(c.anio, 2026);
  assert.equal(c.hoy, "2026-10-31");
  // Octubre de 2026 empieza en jueves: la primera semana arranca el domingo 27-sep
  assert.deepEqual(c.semanas[0][0], { dia: 27, iso: "2026-09-27", delMes: false });
  assert.deepEqual(c.semanas[0][4], { dia: 1, iso: "2026-10-01", delMes: true });
  assert.ok(c.semanas.every((s) => s.length === 7));
  assert.equal(c.semanas.at(-1).at(-1).iso, "2026-10-31"); // sábado
});
