// Envío por la API HTTPS de Brevo (no usa SMTP: Render gratuito bloquea los puertos SMTP).
// Documentación: https://developers.brevo.com/reference/sendtransacemail
const URL_BREVO = "https://api.brevo.com/v3/smtp/email";

// Devuelve el id del mensaje en Brevo. Lanza un error con el motivo si falla.
export async function enviarConBrevo({ apiKey, remitente, nombreRemitente, responderA, para, cc = [], asunto, cuerpoHtml }) {
  const cuerpo = {
    sender: { name: nombreRemitente, email: remitente },
    to: para.map((email) => ({ email })),
    subject: asunto,
    htmlContent: cuerpoHtml,
  };
  if (cc.length) cuerpo.cc = cc.map((email) => ({ email }));
  if (responderA) cuerpo.replyTo = { email: responderA };

  let respuesta;
  try {
    respuesta = await fetch(URL_BREVO, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`No se pudo conectar con Brevo: ${err.name === "TimeoutError" ? "tiempo de espera agotado" : err.message}`);
  }

  const texto = await respuesta.text();
  let datos = {};
  try { datos = JSON.parse(texto); } catch { /* respuesta sin JSON */ }

  if (!respuesta.ok) {
    const motivo = datos.message || texto || `HTTP ${respuesta.status}`;
    const error = new Error(`Brevo respondió ${respuesta.status}: ${motivo}`);
    // 400 = datos inválidos, 401 = clave errada, 403 = cuenta sin permiso: reintentar no sirve
    error.definitivo = [400, 401, 403].includes(respuesta.status);
    throw error;
  }
  return datos.messageId || "";
}
