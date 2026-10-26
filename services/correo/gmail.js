// Envío con la API de Gmail desde la cuenta de la bitácora (p. ej. bitacora.pagos.sed@gmail.com).
// El correo sale de los servidores de Google con las firmas de @gmail.com, así que el filtro
// de Microsoft de la Secretaría lo trata como un correo normal de Gmail (Brevo no sirvió:
// reescribe el remitente a @brevosend.com y la Secretaría lo descarta).
// Usa HTTPS (Render gratuito bloquea SMTP) y un "refresh token" que se obtiene una sola vez
// con: npm run autorizar-gmail
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_ENVIO = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

// ---------------------------------------------------------------------------
// Mensaje MIME (RFC 5322) con texto y HTML en UTF-8
// ---------------------------------------------------------------------------
const b64 = (texto) => Buffer.from(texto, "utf8").toString("base64");
// Encabezado con tildes: =?UTF-8?B?...?=
export const encabezado = (texto) => (/^[\x20-\x7e]*$/.test(texto) ? texto : `=?UTF-8?B?${b64(texto)}?=`);
const lineas76 = (t) => t.replace(/.{1,76}/g, "$&\r\n");

// Versión en texto plano del HTML (algunos filtros desconfían de correos solo HTML)
export function textoPlano(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2: $1")
    .replace(/<\/(tr|p|div|h\d)>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function construirMensaje({ remitente, nombreRemitente, para, cc = [], responderA, asunto, cuerpoHtml }) {
  const limite = `bitacora-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const cabeceras = [
    `From: ${encabezado(nombreRemitente || remitente)} <${remitente}>`,
    `To: ${para.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    ...(responderA ? [`Reply-To: ${responderA}`] : []),
    `Subject: ${encabezado(asunto)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${limite}"`,
  ];
  const parte = (tipo, contenido) =>
    [`--${limite}`, `Content-Type: ${tipo}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", lineas76(b64(contenido))].join("\r\n");
  return [...cabeceras, "", parte("text/plain", textoPlano(cuerpoHtml)), parte("text/html", cuerpoHtml), `--${limite}--`, ""].join("\r\n");
}

// ---------------------------------------------------------------------------
// Token de acceso (dura ~1 hora; se renueva con el refresh token)
// ---------------------------------------------------------------------------
let cache = { token: null, vence: 0, clave: "" };

export async function tokenDeAcceso({ clientId, clientSecret, refreshToken }) {
  const clave = `${clientId}:${refreshToken.slice(-12)}`;
  if (cache.token && cache.clave === clave && Date.now() < cache.vence - 60_000) return cache.token;

  const respuesta = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(
      datos.error === "invalid_grant"
        ? "Google rechazó la autorización (se revocó o venció). Vuelve a correr: npm run autorizar-gmail"
        : `Google no entregó el token: ${datos.error_description || datos.error || respuesta.status}`
    );
    error.definitivo = ["invalid_grant", "invalid_client", "unauthorized_client"].includes(datos.error);
    throw error;
  }
  cache = { token: datos.access_token, vence: Date.now() + (datos.expires_in ?? 3600) * 1000, clave };
  return cache.token;
}

export const olvidarToken = () => { cache = { token: null, vence: 0, clave: "" }; };

// ---------------------------------------------------------------------------
// Envío. Devuelve el id del mensaje en Gmail.
// ---------------------------------------------------------------------------
export async function enviarConGmail({ gmail, remitente, nombreRemitente, responderA, para, cc = [], asunto, cuerpoHtml }) {
  const raw = Buffer.from(construirMensaje({ remitente, nombreRemitente, para, cc, responderA, asunto, cuerpoHtml }), "utf8").toString("base64url");

  for (let intento = 1; intento <= 2; intento++) {
    const token = await tokenDeAcceso(gmail);
    let respuesta;
    try {
      respuesta = await fetch(URL_ENVIO, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new Error(`No se pudo conectar con Gmail: ${err.name === "TimeoutError" ? "tiempo de espera agotado" : err.message}`);
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.ok) return datos.id || "";

    // Token vencido antes de tiempo: se pide otro y se reintenta una vez
    if (respuesta.status === 401 && intento === 1) {
      olvidarToken();
      continue;
    }
    const motivo = datos.error?.message || `HTTP ${respuesta.status}`;
    const razon = datos.error?.errors?.[0]?.reason || "";
    const error = new Error(`Gmail respondió ${respuesta.status}: ${motivo}`);
    // Límite diario o de velocidad: se reintenta más tarde. Datos inválidos o sin permiso: no.
    error.definitivo = respuesta.status === 400 || (respuesta.status === 403 && !/rateLimit|dailyLimit|quota/i.test(razon + motivo));
    throw error;
  }
}
