// Plantillas PROVISIONALES de los correos. Se reemplazan cuando el área entregue
// los formatos definitivos (asunto, cuerpo, destinatarios). Una sola función arma
// todos los correos a partir de la acción registrada, para que cambiar el formato
// sea tocar un solo archivo.
import { ACCIONES, ESTADOS, etiquetaAccion } from "../flujo.js";
import { URL_APP } from "../../config/config.js";

export const escapar = (t) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Asunto según el estado al que llegó el trámite
function titulo(accion, estadoNuevo) {
  if (accion === "RECHAZAR") return "Trámite rechazado";
  if (accion === "ANULAR") return "Trámite anulado";
  if (estadoNuevo === "LIBERADO") return "Liberado para programación de pago";
  if (estadoNuevo === "LOTE_FIRMADO") return "Lote firmado por ambos responsables";
  return `Pendiente: ${ESTADOS[estadoNuevo].espera}`;
}

// Valor legible de un dato del evento, usando la definición del campo en flujo.js
export function valorLegible(campo, valor, nombres = {}) {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (campo?.tipo) {
    case "dinero": return pesos.format(valor);
    case "booleano": return valor ? "Sí" : "No";
    case "opcion": return campo.opciones[valor] ?? valor;
    case "lista": return [].concat(valor).join(", ");
    case "correo": return nombres[valor] ? `${nombres[valor]} (${valor})` : valor;
    default: return String(valor);
  }
}

// tramite: estado ya actualizado · evento: { accion, estadoNuevo, usuario, registradoEn, datos, observacion }
// horaTexto: hora del evento ya formateada en Bogotá · nombres: { correo: nombre }
export function armarCorreo({ tramite, evento, horaTexto, nombres = {} }) {
  const asunto = `[Bitácora de Pagos] ${tramite._id} · WF ${tramite.wfActual} – ${titulo(evento.accion, evento.estadoNuevo)}`;
  const enlace = `${URL_APP}/tramites/${encodeURIComponent(tramite._id)}`;
  const campos = ACCIONES[evento.accion]?.campos ?? {};

  const filas = [
    ["Trámite", tramite._id],
    ["N.° de WF", tramite.wfActual],
    ["Lote", tramite.lote || "—"],
    ["Valor total", pesos.format(tramite.valorTotal)],
    ["N.° de registros", tramite.numRegistros],
    ["Paso registrado", etiquetaAccion(evento.accion)],
    ["Registrado por", `${evento.usuario.nombre} (${evento.usuario.correo})`],
    ["Fecha y hora de registro", horaTexto],
    ...Object.entries(evento.datos ?? {})
      .filter(([k]) => !["wf", "valorTotal", "numRegistros", "lote"].includes(k))
      .map(([k, v]) => [campos[k]?.etiqueta ?? k, valorLegible(campos[k], v, nombres)]),
    ...(evento.observacion ? [["Observación", evento.observacion]] : []),
  ];

  const siguiente = ESTADOS[evento.estadoNuevo]?.espera;
  const cuerpoHtml = `<!doctype html><html lang="es"><body style="margin:0;background:#e2e2e2;font-family:Arial,sans-serif;color:#000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#bb2d33;color:#fff;padding:18px 24px;font-size:20px;font-weight:bold">Bitácora de Trámites de Pago</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:bold">${escapar(titulo(evento.accion, evento.estadoNuevo))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
${filas.map(([k, v]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e2e2;color:#6b6b6b;width:42%">${escapar(k)}</td><td style="padding:6px 8px;border-bottom:1px solid #e2e2e2">${escapar(v)}</td></tr>`).join("\n")}
</table>
${siguiente ? `<p style="margin:20px 0 0;font-size:14px">Siguiente paso: <strong>${escapar(siguiente)}</strong>. Después de hacerlo en BOGDATA, regístralo en la bitácora.</p>` : ""}
<p style="margin:24px 0 0;text-align:center"><a href="${escapar(enlace)}" style="display:inline-block;background:#bb2d33;color:#fff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:999px">Ver el trámite</a></p>
</td></tr>
<tr><td style="padding:12px 24px;font-size:12px;color:#6b6b6b;background:#fafafa">Correo automático de la Bitácora de Trámites de Pago. No respondas a este mensaje.</td></tr>
</table></td></tr></table></body></html>`;

  return { asunto, cuerpoHtml };
}
