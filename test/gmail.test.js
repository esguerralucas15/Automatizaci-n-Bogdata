import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { construirMensaje, encabezado, textoPlano, enviarConGmail, olvidarToken } from "../services/correo/gmail.js";
import { faltaParaCorreo } from "../config/config.js";
import { guardarEnEnv } from "../services/archivoEnv.js";

const gmail = { clientId: "id.apps.googleusercontent.com", clientSecret: "GOCSPX-x", refreshToken: "1//refresh" };
const base = { gmail, remitente: "bitacora.pagos.sed@gmail.com", nombreRemitente: "Bitácora de Pagos", para: ["lucas@sed.gov.co"], asunto: "Firma del WF – Presupuesto", cuerpoHtml: "<p>Hola <a href=\"https://x/t/1\">Ver el trámite</a></p>" };
const fetchOriginal = globalThis.fetch;
beforeEach(() => olvidarToken());
afterEach(() => { globalThis.fetch = fetchOriginal; });

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

test("encabezados con tildes van codificados en UTF-8", () => {
  assert.equal(encabezado("Hola"), "Hola");
  assert.equal(encabezado("Bitácora"), `=?UTF-8?B?${Buffer.from("Bitácora").toString("base64")}?=`);
});

test("mensaje MIME: remitente, destinatarios, responder a y dos versiones (texto y HTML)", () => {
  const m = construirMensaje({ ...base, cc: ["tesoreria@sed.gov.co"], responderA: "monica@sed.gov.co" });
  assert.match(m, /^From: =\?UTF-8\?B\?.+\?= <bitacora\.pagos\.sed@gmail\.com>\r\n/);
  assert.match(m, /\r\nTo: lucas@sed\.gov\.co\r\n/);
  assert.match(m, /\r\nCc: tesoreria@sed\.gov\.co\r\n/);
  assert.match(m, /\r\nReply-To: monica@sed\.gov\.co\r\n/);
  assert.match(m, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(m, /Content-Type: text\/html; charset=UTF-8/);
  const partes = [...m.matchAll(/base64\r\n\r\n([\s\S]+?)\r\n--/g)].map((x) => Buffer.from(x[1].replace(/\r\n/g, ""), "base64").toString());
  assert.equal(partes[0], "Hola Ver el trámite: https://x/t/1");
  assert.equal(partes[1], base.cuerpoHtml);
});

test("textoPlano conserva los enlaces y quita etiquetas", () => {
  assert.equal(textoPlano("<table><tr><td>Trámite</td><td>TR-1</td></tr></table><p>a &amp; b</p>"), "Trámite  TR-1\na & b");
});

test("envío: pide token, envía y devuelve el id; el segundo envío reutiliza el token", async () => {
  const llamadas = [];
  globalThis.fetch = async (url, op) => {
    llamadas.push(url);
    if (url.includes("oauth2")) {
      assert.equal(new URLSearchParams(op.body).get("grant_type"), "refresh_token");
      return json({ access_token: "ya29.tok", expires_in: 3599 });
    }
    assert.equal(op.headers.authorization, "Bearer ya29.tok");
    const raw = Buffer.from(JSON.parse(op.body).raw, "base64url").toString();
    assert.match(raw, /To: lucas@sed\.gov\.co/);
    return json({ id: "18c0abc" });
  };
  assert.equal(await enviarConGmail(base), "18c0abc");
  assert.equal(await enviarConGmail(base), "18c0abc");
  assert.equal(llamadas.filter((u) => u.includes("oauth2")).length, 1);
});

test("token vencido (401): renueva y reintenta una vez", async () => {
  let envios = 0;
  globalThis.fetch = async (url) => {
    if (url.includes("oauth2")) return json({ access_token: "t", expires_in: 3599 });
    envios++;
    return envios === 1 ? json({ error: { message: "Invalid Credentials" } }, 401) : json({ id: "ok" });
  };
  assert.equal(await enviarConGmail(base), "ok");
  assert.equal(envios, 2);
});

test("autorización revocada: error definitivo que dice cómo arreglarlo", async () => {
  globalThis.fetch = async () => json({ error: "invalid_grant" }, 400);
  await assert.rejects(enviarConGmail(base), (e) => e.definitivo === true && /npm run autorizar-gmail/.test(e.message));
});

test("límite diario de Gmail: se reintenta más tarde (no es definitivo)", async () => {
  globalThis.fetch = async (url) =>
    url.includes("oauth2") ? json({ access_token: "t", expires_in: 3599 }) : json({ error: { message: "Daily Limit Exceeded", errors: [{ reason: "dailyLimitExceeded" }] } }, 403);
  await assert.rejects(enviarConGmail(base), (e) => !e.definitivo && /403/.test(e.message));
});

test("faltaParaCorreo dice qué falta según el proveedor", () => {
  const c = { proveedor: "gmail", remitente: "a@gmail.com", gmail: { clientId: "x", clientSecret: "y", refreshToken: "" } };
  assert.deepEqual(faltaParaCorreo(c), ["GMAIL_REFRESH_TOKEN (npm run autorizar-gmail)"]);
  assert.deepEqual(faltaParaCorreo({ ...c, gmail: { ...c.gmail, refreshToken: "z" } }), []);
  assert.deepEqual(faltaParaCorreo({ proveedor: "brevo", remitente: "", apiKey: "" }), ["CORREO_REMITENTE", "BREVO_API_KEY"]);
});

test("guardarEnEnv reemplaza o agrega sin tocar lo demás (respeta saltos de Windows)", async () => {
  const f = join(await mkdtemp(join(tmpdir(), "env-")), ".env");
  await writeFile(f, "# comentario\r\nPORT=3000\r\nGMAIL_REFRESH_TOKEN=\r\n");
  await guardarEnEnv({ GMAIL_REFRESH_TOKEN: "1//abc", CORREO_PROVEEDOR: "gmail" }, f);
  assert.equal(await readFile(f, "utf8"), "# comentario\r\nPORT=3000\r\nGMAIL_REFRESH_TOKEN=1//abc\r\nCORREO_PROVEEDOR=gmail\r\n");
});
