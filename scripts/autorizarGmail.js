// Autoriza UNA VEZ a la app para enviar correos desde la cuenta de la bitácora.
//   npm run autorizar-gmail
//
// Requisitos en .env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (cliente OAuth "App de escritorio"
// creado en Google Cloud con la cuenta de la bitácora) y CORREO_REMITENTE.
//
// Qué hace: abre el navegador para que inicies sesión con la cuenta de la bitácora y aceptes
// el permiso "Enviar correo en tu nombre". Google devuelve un "refresh token" que se guarda
// en .env (GMAIL_REFRESH_TOKEN) junto con CORREO_PROVEEDOR=gmail. La contraseña de la cuenta
// nunca pasa por la app. Para revocarlo: myaccount.google.com > Seguridad > Apps de terceros.
import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { exec } from "node:child_process";
import { CORREO } from "../config/config.js";
import { guardarEnEnv } from "../services/archivoEnv.js";

const PERMISOS = ["https://www.googleapis.com/auth/gmail.send", "openid", "email"];
const { clientId, clientSecret } = CORREO.gmail;

if (!clientId || !clientSecret || clientId.includes("<")) {
  console.error("Falta GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET en el archivo .env.");
  process.exit(1);
}

function abrirNavegador(url) {
  const comando =
    process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(comando, () => {});
}

const verificador = randomBytes(32).toString("base64url"); // PKCE
const desafio = createHash("sha256").update(verificador).digest("base64url");
const estado = randomBytes(16).toString("hex");

const servidor = http.createServer();
servidor.listen(0, "127.0.0.1", () => {
  const redirectUri = `http://127.0.0.1:${servidor.address().port}`;
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: PERMISOS.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: estado,
      code_challenge: desafio,
      code_challenge_method: "S256",
      ...(CORREO.remitente ? { login_hint: CORREO.remitente } : {}),
    });

  console.log("\n1. Se abrirá el navegador. Inicia sesión con la cuenta de la bitácora:", CORREO.remitente || "(CORREO_REMITENTE)");
  console.log('2. Si Google dice "Google no verificó esta app": Configuración avanzada > Ir a … (no seguro).');
  console.log('   Es normal: la app es tuya y solo la usa esta cuenta.');
  console.log("3. Acepta el permiso para enviar correos.\n");
  console.log("Si el navegador no se abre, copia esta dirección:\n" + url + "\n");
  abrirNavegador(url);

  servidor.on("request", async (req, res) => {
    const q = new URL(req.url, redirectUri).searchParams;
    if (!q.get("code") && !q.get("error")) return res.writeHead(404).end();
    const responder = (ok, mensaje) => {
      res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px">
        <h1 style="color:${ok ? "#24613a" : "#bb2d33"}">${ok ? "✔ Autorización lista" : "✘ No se pudo autorizar"}</h1>
        <p>${mensaje}</p><p>Ya puedes cerrar esta pestaña y volver a la terminal.</p></body>`);
    };
    try {
      if (q.get("error")) throw new Error(`Google respondió: ${q.get("error")}`);
      if (q.get("state") !== estado) throw new Error("La respuesta no corresponde a esta solicitud");

      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: q.get("code"), client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verificador,
        }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error_description || datos.error || `HTTP ${r.status}`);
      if (!datos.refresh_token) throw new Error("Google no entregó el refresh token. Revoca el acceso en myaccount.google.com y repite.");
      if (!String(datos.scope).includes("gmail.send")) throw new Error("No se aceptó el permiso de enviar correos. Repite y marca la casilla.");

      // Correo de la cuenta que autorizó (del id_token)
      const cuenta = datos.id_token
        ? JSON.parse(Buffer.from(datos.id_token.split(".")[1], "base64url").toString()).email?.toLowerCase()
        : null;
      if (CORREO.remitente && cuenta && cuenta !== CORREO.remitente) {
        throw new Error(`Autorizaste con ${cuenta}, pero CORREO_REMITENTE es ${CORREO.remitente}. Repite con la cuenta correcta.`);
      }

      await guardarEnEnv({
        CORREO_PROVEEDOR: "gmail",
        GMAIL_REFRESH_TOKEN: datos.refresh_token,
        ...(!CORREO.remitente && cuenta ? { CORREO_REMITENTE: cuenta } : {}),
      });
      responder(true, `La bitácora enviará los correos desde <b>${cuenta ?? CORREO.remitente}</b>.`);
      console.log(`✔ Autorización guardada en .env (cuenta ${cuenta ?? CORREO.remitente}).`);
      console.log("  Prueba con: npm run probar-correo -- tu.correo@educacionbogota.gov.co");
      console.log("  Si tienes npm run dev abierto, reinícialo para que tome el cambio.\n");
      cerrar(0);
    } catch (err) {
      responder(false, err.message);
      console.error(`✘ ${err.message}`);
      cerrar(1);
    }
  });
});

function cerrar(codigo) {
  setTimeout(() => {
    servidor.close();
    process.exit(codigo);
  }, 300);
}

// Si nadie autoriza en 10 minutos, se cancela
setTimeout(() => {
  console.error("✘ Tiempo agotado (10 minutos). Vuelve a correr npm run autorizar-gmail.");
  cerrar(1);
}, 10 * 60_000).unref();
