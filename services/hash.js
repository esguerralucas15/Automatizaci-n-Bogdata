// Cadena de hashes de la bitácora: cada evento guarda el hash del anterior.
// Si alguien modifica o borra un evento directamente en Atlas, la verificación
// encuentra el punto exacto donde se rompe la cadena.
import { createHash } from "node:crypto";

export const HASH_INICIAL = "0".repeat(64);

// JSON con las llaves ordenadas: el mismo contenido produce siempre el mismo texto
export function canonico(valor) {
  if (valor === undefined) return "null";
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (typeof valor.toHexString === "function") return JSON.stringify(valor.toHexString()); // ObjectId
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const llaves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
  return `{${llaves.map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(",")}}`;
}

// Campos del evento que protege el hash (todo menos _id, hash y hashAnterior)
export function contenidoDe(evento) {
  const {
    secuencia, tramite, accion, estadoAnterior, estadoNuevo, usuario, registradoEn,
    horaDeclaradaBogdata, datos, observacion, ip, agente,
  } = evento;
  return {
    secuencia, tramite: tramite ?? null, accion,
    estadoAnterior: estadoAnterior ?? null, estadoNuevo: estadoNuevo ?? null,
    usuario: { correo: usuario.correo, nombre: usuario.nombre, rol: usuario.rol },
    registradoEn: new Date(registradoEn),
    horaDeclaradaBogdata: horaDeclaradaBogdata ? new Date(horaDeclaradaBogdata) : null,
    datos: datos ?? {}, observacion: observacion ?? "", ip: ip ?? "", agente: agente ?? "",
  };
}

export function calcularHash(hashAnterior, evento) {
  return createHash("sha256").update(hashAnterior).update(canonico(contenidoDe(evento))).digest("hex");
}

// Recorre los eventos en orden de secuencia.
// Devuelve { ok: true, total } o { ok: false, total, secuencia, motivo }
export function verificarCadena(eventos) {
  let anterior = HASH_INICIAL;
  let esperada = null;
  for (const e of eventos) {
    if (esperada !== null && e.secuencia !== esperada) {
      return { ok: false, total: eventos.length, secuencia: e.secuencia, motivo: `Falta el evento ${esperada} (posible borrado)` };
    }
    if (e.hashAnterior !== anterior) {
      return { ok: false, total: eventos.length, secuencia: e.secuencia, motivo: "No coincide con el evento anterior" };
    }
    if (calcularHash(e.hashAnterior, e) !== e.hash) {
      return { ok: false, total: eventos.length, secuencia: e.secuencia, motivo: "El contenido fue modificado" };
    }
    anterior = e.hash;
    esperada = e.secuencia + 1;
  }
  return { ok: true, total: eventos.length };
}
