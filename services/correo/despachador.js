// Envía los correos que quedaron en cola (colección notificaciones).
// - Al registrar un paso se intenta enviar de inmediato.
// - Cada minuto se reintentan los pendientes, con espera creciente (1, 2, 4… hasta 60 min).
// - Después de MAX_INTENTOS, o si el error no tiene arreglo (clave errada), queda "fallido".
import Notificacion from "../../models/Notificacion.js";
import { CORREO, correoActivo, faltaParaCorreo } from "../../config/config.js";
import { enviarConBrevo } from "./brevo.js";
import { enviarConGmail } from "./gmail.js";

// Función de envío según CORREO_PROVEEDOR
export const enviadorDe = (proveedor) => (proveedor === "gmail" ? enviarConGmail : enviarConBrevo);

export const MAX_INTENTOS = 8;

// Minutos de espera antes del siguiente intento: 1, 2, 4, 8, 16, 32, 60…
export const esperaMinutos = (intentos) => Math.min(60, 2 ** Math.max(0, intentos - 1));

// Destinatarios reales o, en pruebas, todos redirigidos a una sola dirección
export function prepararEnvio(n, conf = CORREO) {
  if (!conf.redirigirA) return { para: n.para, cc: n.cc, asunto: n.asunto, detalle: "" };
  const originales = [...n.para, ...n.cc].join(", ");
  return {
    para: [conf.redirigirA],
    cc: [],
    asunto: `[PRUEBA para ${originales}] ${n.asunto}`,
    detalle: `redirigido a ${conf.redirigirA}`,
  };
}

// Intenta enviar una notificación. Devuelve el documento actualizado o null si
// otro proceso la está enviando / ya se envió / todavía no le toca.
export async function despachar(id, { enviar = null, conf = CORREO, forzar = false } = {}) {
  if (!enviar) {
    if (!correoActivo()) return null;
    enviar = enviadorDe(conf.proveedor);
  }
  const ahora = new Date();
  // Se "reserva" el correo 2 minutos para que nadie más lo envíe al mismo tiempo
  const n = await Notificacion.findOneAndUpdate(
    {
      _id: id,
      estado: "pendiente",
      ...(forzar ? {} : { proximoIntento: { $lte: ahora } }),
      $or: [{ bloqueadoHasta: null }, { bloqueadoHasta: { $lte: ahora } }],
    },
    { $set: { bloqueadoHasta: new Date(ahora.getTime() + 2 * 60_000) }, $inc: { intentos: 1 } },
    { new: true }
  ).lean();
  if (!n) return null;

  const envio = prepararEnvio(n, conf);
  try {
    const idMensaje = await enviar({
      apiKey: conf.apiKey,
      gmail: conf.gmail,
      remitente: conf.remitente,
      nombreRemitente: conf.nombreRemitente,
      responderA: conf.responderA,
      para: envio.para,
      cc: envio.cc,
      asunto: envio.asunto,
      cuerpoHtml: n.cuerpoHtml,
    });
    return await Notificacion.findByIdAndUpdate(
      n._id,
      {
        $set: {
          estado: "enviado",
          enviadoEn: new Date(),
          ultimoError: "",
          bloqueadoHasta: null,
          detalleEnvio: [envio.detalle, idMensaje].filter(Boolean).join(" · "),
        },
      },
      { new: true }
    ).lean();
  } catch (err) {
    const fallido = err.definitivo || n.intentos >= MAX_INTENTOS;
    console.error(`Correo ${n._id} (intento ${n.intentos}): ${err.message}`);
    return await Notificacion.findByIdAndUpdate(
      n._id,
      {
        $set: {
          estado: fallido ? "fallido" : "pendiente",
          ultimoError: String(err.message).slice(0, 500),
          bloqueadoHasta: null,
          proximoIntento: new Date(Date.now() + esperaMinutos(n.intentos) * 60_000),
        },
      },
      { new: true }
    ).lean();
  }
}

// Envía de inmediato el correo de un evento recién registrado
export async function despacharDeEvento(eventoId) {
  if (!correoActivo()) return null;
  const n = await Notificacion.findOne({ evento: eventoId }, { _id: 1 }).lean();
  return n ? despachar(n._id) : null;
}

export async function reintentarPendientes(limite = 20) {
  const pendientes = await Notificacion.find(
    { estado: "pendiente", proximoIntento: { $lte: new Date() } },
    { _id: 1 }
  )
    .sort({ proximoIntento: 1 })
    .limit(limite)
    .lean();
  for (const p of pendientes) await despachar(p._id);
  return pendientes.length;
}

let temporizador = null;
export function iniciarDespachador() {
  if (!correoActivo()) {
    console.warn(`Correo desactivado (falta en .env: ${faltaParaCorreo().join(", ")}). Los correos quedan en cola.`);
    return;
  }
  const destino = CORREO.redirigirA ? ` (PRUEBAS: todo se redirige a ${CORREO.redirigirA})` : "";
  console.log(`Correo activo: ${CORREO.proveedor === "gmail" ? "Gmail" : "Brevo"}, remitente ${CORREO.remitente}${destino}`);
  const ciclo = () => reintentarPendientes().catch((err) => console.error("Despachador:", err.message));
  ciclo();
  temporizador = setInterval(ciclo, 60_000);
  temporizador.unref();
}
