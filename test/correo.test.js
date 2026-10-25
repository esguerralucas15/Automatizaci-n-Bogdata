import { test } from "node:test";
import assert from "node:assert/strict";
import { armarCorreo, escapar, valorLegible } from "../services/correo/plantillas.js";
import { resolverDestinatarios } from "../services/destinatarios.js";
import { ACCIONES } from "../services/flujo.js";

const tramite = {
  _id: "TR-2026-0007", wfActual: "423", lote: null, valorTotal: 1250000, numRegistros: 3,
  revisor: "andrea@p.gov.co", director: "ricardo@p.gov.co", ordenador: "paula@p.gov.co",
};

test("destinatarios: claves del flujo a correos, sin el autor ni repetidos", () => {
  assert.deepEqual(resolverDestinatarios(["director"], tramite, { autor: "andrea@p.gov.co" }), { para: ["ricardo@p.gov.co"], cc: [] });
  assert.deepEqual(
    resolverDestinatarios(["revisor", "admin"], tramite, { admins: ["monica@p.gov.co", "paula@p.gov.co"], autor: "paula@p.gov.co" }),
    { para: ["andrea@p.gov.co", "monica@p.gov.co"], cc: [] }
  );
  assert.deepEqual(
    resolverDestinatarios(["admin", "copias"], tramite, { admins: ["monica@p.gov.co"], copias: [{ correo: "tesoreria@p.gov.co" }, { correo: "monica@p.gov.co" }] }),
    { para: ["monica@p.gov.co"], cc: ["tesoreria@p.gov.co"] }
  );
});

test("correo: asunto con trámite, WF y siguiente paso; enlace al trámite", () => {
  const c = armarCorreo({
    tramite: { ...tramite, estado: "WF_CARGADO" },
    evento: {
      accion: "REGISTRAR_WF", estadoNuevo: "WF_CARGADO",
      usuario: { nombre: "Andrea Morales", correo: "andrea@p.gov.co" },
      datos: { wf: "423", segmento: "SE01", valorTotal: 1250000, numRegistros: 3, director: "ricardo@p.gov.co", ordenador: "paula@p.gov.co" },
    },
    horaTexto: "domingo 25 de octubre, 9:30 a.m.",
    nombres: { "ricardo@p.gov.co": "Ricardo Peña" },
  });
  assert.equal(c.asunto, "[Bitácora de Pagos] TR-2026-0007 · WF 423 – Pendiente: Firma del WF – Responsable de presupuesto");
  assert.match(c.cuerpoHtml, /\/tramites\/TR-2026-0007/);
  assert.match(c.cuerpoHtml, /Ricardo Peña \(ricardo@p\.gov\.co\)/);
  assert.match(c.cuerpoHtml, /\$\s?1\.250\.000/);
});

test("correo: el texto escrito por usuarios se escapa", () => {
  const c = armarCorreo({
    tramite: { ...tramite, estado: "DEVUELTO" },
    evento: {
      accion: "RECHAZAR", estadoNuevo: "DEVUELTO", usuario: { nombre: "Ricardo", correo: "r@p.gov.co" },
      datos: { motivo: "<script>alert(1)</script>", tipoRechazo: "sin_anulacion" },
    },
    horaTexto: "hoy",
  });
  assert.ok(!c.cuerpoHtml.includes("<script>"));
  assert.match(c.cuerpoHtml, /Rechazo sin anulación/);
  assert.match(c.asunto, /Trámite rechazado$/);
  assert.equal(escapar(`a"b'c&`), "a&quot;b&#39;c&amp;");
});

test("valorLegible usa la definición del campo", () => {
  const c = ACCIONES.REGISTRAR_LIBERACION.campos.avisoEmbargos;
  assert.equal(valorLegible(c, false), "No");
  assert.equal(valorLegible(ACCIONES.REGISTRAR_LOTE.campos.documentosContables, ["300000687", "300000688"]), "300000687, 300000688");
  assert.equal(valorLegible(undefined, ""), "—");
});
