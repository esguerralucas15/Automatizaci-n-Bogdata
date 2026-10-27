// Inserción de eventos en la bitácora con consecutivo y cadena de hashes.
// Siempre se llama dentro de una transacción (session): el consecutivo del
// contador serializa las inserciones, así dos eventos nunca comparten número
// ni encadenan al mismo evento anterior.
import Evento from "../models/Evento.js";
import Contador from "../models/Contador.js";
import { HASH_INICIAL, calcularHash, verificarCadena } from "./hash.js";
import { ahora } from "./tiempo.js";

// Usuario técnico para los eventos que registran los scripts (carga inicial)
export const SISTEMA = { correo: "sistema", nombre: "Carga inicial (script)", rol: "sistema" };

// datos: { tramite, accion, estadoAnterior, estadoNuevo, usuario, datos, observacion,
//          horaDeclaradaBogdata, ip, agente }
export async function insertarEvento(datos, session) {
  if (!session) throw new Error("insertarEvento debe ejecutarse dentro de una transacción");

  const secuencia = await Contador.siguiente("eventos", session);
  let hashAnterior = HASH_INICIAL;
  if (secuencia > 1) {
    const anterior = await Evento.findOne({ secuencia: secuencia - 1 }, { hash: 1 }).session(session).lean();
    if (!anterior) throw new Error(`No se encontró el evento ${secuencia - 1} de la bitácora`);
    hashAnterior = anterior.hash;
  }

  const evento = {
    tramite: null, estadoAnterior: null, estadoNuevo: null, datos: {}, observacion: "",
    horaDeclaradaBogdata: null, ip: "", agente: "",
    ...datos,
    usuario: { correo: datos.usuario.correo, nombre: datos.usuario.nombre, rol: datos.usuario.rol },
    secuencia,
    registradoEn: ahora(), // hora del servidor, nunca del formulario
    hashAnterior,
  };
  evento.hash = calcularHash(hashAnterior, evento);

  const [doc] = await Evento.create([evento], { session });
  return doc;
}

// Verifica toda la bitácora (para la pantalla de administración y el script)
export async function verificarBitacora() {
  const eventos = await Evento.find({}).sort({ secuencia: 1 }).lean();
  return verificarCadena(eventos);
}
