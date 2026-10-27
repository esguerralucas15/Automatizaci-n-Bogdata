import { test } from "node:test";
import assert from "node:assert/strict";
import { pasosConEspera, indicadores, tiemposPorTramite, duracionTexto } from "../services/tiempos.js";

const h = (horas) => new Date(Date.UTC(2026, 9, 26, 13) + horas * 3600e3); // 26-oct 8:00 a.m. Bogotá + horas
const U = {
  rev: { correo: "rev@sed.gov.co", nombre: "Revisora", rol: "revisor" },
  dir: { correo: "dir@sed.gov.co", nombre: "Director", rol: "director" },
  sub: { correo: "sub@sed.gov.co", nombre: "Subsecretaria", rol: "subsecretario" },
};
let s = 0;
const ev = (tramite, accion, usuario, horas, extra = {}) => ({ secuencia: ++s, tramite, accion, usuario, registradoEn: h(horas), ...extra });

const eventos = [
  ev("TR-1", "REGISTRAR_WF", U.rev, 0),
  ev("TR-2", "REGISTRAR_WF", U.rev, 1),
  ev("TR-1", "APROBAR_WF_PRESUPUESTO", U.dir, 2, { horaDeclaradaBogdata: h(1.5) }), // 2 h; registró 30 min tarde
  ev("TR-2", "APROBAR_WF_PRESUPUESTO", U.dir, 5),                                    // 4 h
  ev("TR-1", "APROBAR_WF_ORDENADOR", U.sub, 26),                                     // 24 h
  ev("TR-1", "REGISTRAR_LOTE", U.rev, 27),
  ev("TR-1", "FIRMAR_LOTE_PRESUPUESTO", U.dir, 28),
  ev("TR-1", "FIRMAR_LOTE_ORDENADOR", U.sub, 30),
  ev("TR-1", "REGISTRAR_LIBERACION", U.rev, 31),
];

test("tiempo de respuesta = desde el paso anterior del mismo trámite", () => {
  const p = pasosConEspera(eventos);
  const de = (t, a) => p.find((x) => x.tramite === t && x.accion === a);
  assert.equal(de("TR-1", "REGISTRAR_WF").esperaMin, null);
  assert.equal(de("TR-1", "APROBAR_WF_PRESUPUESTO").esperaMin, 120);
  assert.equal(de("TR-2", "APROBAR_WF_PRESUPUESTO").esperaMin, 240); // no se mezcla con TR-1
  assert.equal(de("TR-1", "APROBAR_WF_ORDENADOR").esperaMin, 24 * 60);
  assert.equal(de("TR-1", "APROBAR_WF_PRESUPUESTO").tardanzaMin, 30);
});

test("indicadores por persona y por etapa, con lo pendiente ahora", () => {
  const tramites = [{ _id: "TR-2", estado: "WF_APROBADO_PRESUPUESTO", ordenador: "sub@sed.gov.co", ultimoEventoEn: h(5) }];
  const r = indicadores({ pasos: pasosConEspera(eventos), tramites, ahora: h(10) });
  const dir = r.porPersona.find((p) => p.correo === "dir@sed.gov.co");
  assert.equal(dir.pasos, 3);
  assert.equal(dir.promedio, (120 + 240 + 60) / 3);
  assert.equal(dir.maximo, 240);
  assert.equal(dir.tardanzaPromedio, 30);
  const sub = r.porPersona.find((p) => p.correo === "sub@sed.gov.co");
  assert.equal(sub.pendientes.length, 1);
  assert.equal(sub.esperaMasLarga, 300); // TR-2 la espera desde hace 5 h
  assert.equal(r.porPersona[0].correo, "sub@sed.gov.co"); // el más lento primero
  const firmaWfP = r.porEtapa.find((e) => e.accion === "APROBAR_WF_PRESUPUESTO");
  assert.equal(firmaWfP.n, 2);
  assert.equal(firmaWfP.mediana, 180);
});

test("por trámite: horas en cada etapa y total (abierto cuenta hasta ahora)", () => {
  const tramites = [
    { _id: "TR-1", estado: "LIBERADO", ultimoEventoEn: h(31) },
    { _id: "TR-2", estado: "WF_APROBADO_PRESUPUESTO", ultimoEventoEn: h(5) },
  ];
  const [t1, t2] = tiemposPorTramite(tramites, pasosConEspera(eventos), h(10));
  assert.equal(t1.etapas.APROBAR_WF_ORDENADOR, 24 * 60);
  assert.equal(t1.totalMin, 31 * 60);
  assert.equal(t1.abierto, false);
  assert.equal(t2.totalMin, 9 * 60);
  assert.equal(t2.abierto, true);
});

test("duraciones legibles", () => {
  assert.equal(duracionTexto(45), "45 min");
  assert.equal(duracionTexto(200), "3 h 20 min");
  assert.equal(duracionTexto(120), "2 h");
  assert.equal(duracionTexto(52 * 60), "2 d 4 h");
  assert.equal(duracionTexto(null), "—");
});
