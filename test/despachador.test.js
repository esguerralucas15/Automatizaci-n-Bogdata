import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prepararEnvio, esperaMinutos } from "../services/correo/despachador.js";
import { enviarConBrevo } from "../services/correo/brevo.js";

const n = { para: ["ricardo@p.gov.co"], cc: ["tesoreria@p.gov.co"], asunto: "[Bitácora de Pagos] TR-2026-0001" };
const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

test("sin redirección se envía a los destinatarios reales", () => {
  assert.deepEqual(prepararEnvio(n, { redirigirA: "" }), { para: n.para, cc: n.cc, asunto: n.asunto, detalle: "" });
});

test("en pruebas todo va a una sola dirección y el asunto dice a quién iba", () => {
  const e = prepararEnvio(n, { redirigirA: "lucas@sed.gov.co" });
  assert.deepEqual(e.para, ["lucas@sed.gov.co"]);
  assert.deepEqual(e.cc, []);
  assert.equal(e.asunto, "[PRUEBA para ricardo@p.gov.co, tesoreria@p.gov.co] [Bitácora de Pagos] TR-2026-0001");
});

test("espera creciente entre reintentos, con tope de una hora", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(esperaMinutos), [1, 2, 4, 8, 16, 32, 60, 60]);
});

test("Brevo: arma la petición con remitente, copia y responder a", async () => {
  let peticion;
  globalThis.fetch = async (url, op) => {
    peticion = { url, ...op, cuerpo: JSON.parse(op.body) };
    return new Response(JSON.stringify({ messageId: "<abc@brevo>" }), { status: 201 });
  };
  const id = await enviarConBrevo({
    apiKey: "xkeysib-123", remitente: "lucas@sed.gov.co", nombreRemitente: "Bitácora de Pagos", responderA: "monica@sed.gov.co",
    para: ["ricardo@sed.gov.co"], cc: ["tesoreria@sed.gov.co"], asunto: "Hola", cuerpoHtml: "<p>x</p>",
  });
  assert.equal(id, "<abc@brevo>");
  assert.equal(peticion.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(peticion.headers["api-key"], "xkeysib-123");
  assert.deepEqual(peticion.cuerpo, {
    sender: { name: "Bitácora de Pagos", email: "lucas@sed.gov.co" },
    to: [{ email: "ricardo@sed.gov.co" }],
    cc: [{ email: "tesoreria@sed.gov.co" }],
    replyTo: { email: "monica@sed.gov.co" },
    subject: "Hola",
    htmlContent: "<p>x</p>",
  });
});

test("Brevo: clave errada es un error definitivo (no se reintenta)", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 });
  await assert.rejects(
    enviarConBrevo({ apiKey: "x", remitente: "a@b.co", para: ["c@d.co"], asunto: "s", cuerpoHtml: "h" }),
    (e) => e.definitivo === true && /401: Key not found/.test(e.message)
  );
});

test("Brevo: error temporal se reintenta", async () => {
  globalThis.fetch = async () => new Response("Service Unavailable", { status: 503 });
  await assert.rejects(
    enviarConBrevo({ apiKey: "x", remitente: "a@b.co", para: ["c@d.co"], asunto: "s", cuerpoHtml: "h" }),
    (e) => !e.definitivo && /503/.test(e.message)
  );
});
