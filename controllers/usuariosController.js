// Pantallas de administración de usuarios
import Usuario from "../models/Usuario.js";
import Tramite from "../models/Tramite.js";
import Evento from "../models/Evento.js";
import { ROLES, NOMBRE_ROL } from "../models/roles.js";
import { ErrorFlujo, etiquetaAccion } from "../services/flujo.js";
import { crearUsuario, actualizarUsuario, cambiarEstado, reasignarTramites, CAMPO_DE_ROL } from "../services/usuarios.js";
import { despacharDeEvento } from "../services/correo/despachador.js";

const FINALES = ["LIBERADO", "ANULADO"];
const contexto = (req) => ({ autor: req.session.usuario, ip: req.ip, agente: req.get("user-agent") });
const urlDe = (correo) => `/admin/usuarios/${encodeURIComponent(correo)}`;

// --------------------------------------------------------------------------
// Nuevo usuario
// --------------------------------------------------------------------------
export function nuevo(req, res) {
  res.render("admin/usuario/formulario", { titulo: "Nuevo usuario", u: null, valores: {}, errores: {}, mensaje: null, roles: ROLES });
}

export async function crear(req, res) {
  try {
    const u = await crearUsuario({ datos: req.body, ...contexto(req) });
    res.redirect(`/admin/usuarios?ok=${encodeURIComponent(`Se creó a ${u.nombre} como ${NOMBRE_ROL[u.rol].toLowerCase()}.`)}`);
  } catch (err) {
    if (!(err instanceof ErrorFlujo)) throw err;
    res.status(422).render("admin/usuario/formulario", {
      titulo: "Nuevo usuario", u: null, valores: req.body, errores: err.errores, mensaje: err.message, roles: ROLES,
    });
  }
}

// --------------------------------------------------------------------------
// Ficha: editar, activar/desactivar, reasignar trámites, actividad
// --------------------------------------------------------------------------
async function verFicha(req, res, { valores = null, errores = {}, mensaje = null, seccion = null, status = 200 } = {}) {
  const correo = req.params.correo.toLowerCase();
  const u = await Usuario.findById(correo).lean();
  if (!u) return res.status(404).render("errores/404", { titulo: "Usuario no encontrado" });

  const campo = CAMPO_DE_ROL[u.rol];
  const [asignados, reemplazos, actividad] = await Promise.all([
    campo ? Tramite.find({ [campo]: correo, estado: { $nin: FINALES } }).sort({ ultimoEventoEn: 1 }).lean() : [],
    campo ? Usuario.find({ rol: u.rol, activo: true, _id: { $ne: correo } }).sort({ nombre: 1 }).lean() : [],
    Evento.find({
      $or: [{ "datos._id": correo }, { "datos.correo": correo }, { "datos.de": correo }, { "datos.a": correo }, { "usuario.correo": correo }],
    }).sort({ secuencia: -1 }).limit(30).lean(),
  ]);

  res.status(status).render("admin/usuario/ficha", {
    titulo: u.nombre, u, roles: ROLES,
    valores: valores ?? u, errores, mensaje, seccion,
    asignados, reemplazos, campo,
    actividad: actividad.map((e) => ({ ...e, titulo: etiquetaAccion(e.accion) })),
    esUnoMismo: req.session.usuario.correo === correo,
    ok: req.query.ok ? String(req.query.ok).slice(0, 200) : null,
  });
}

export const ficha = (req, res) => verFicha(req, res);

export async function actualizar(req, res) {
  const correo = req.params.correo.toLowerCase();
  try {
    const r = await actualizarUsuario({ correo, datos: req.body, ...contexto(req) });
    res.redirect(`${urlDe(correo)}?ok=${encodeURIComponent(r.sinCambios ? "No había cambios para guardar." : "Cambios guardados.")}`);
  } catch (err) {
    if (!(err instanceof ErrorFlujo)) throw err;
    await verFicha(req, res, { valores: { _id: correo, ...req.body }, errores: err.errores, mensaje: err.message, seccion: "datos", status: 422 });
  }
}

export async function estado(req, res) {
  const correo = req.params.correo.toLowerCase();
  const activo = req.body.activo === "si";
  try {
    await cambiarEstado({ correo, activo, ...contexto(req) });
    res.redirect(`${urlDe(correo)}?ok=${encodeURIComponent(activo ? "Usuario reactivado: ya puede entrar." : "Usuario desactivado: ya no puede entrar ni recibe correos.")}`);
  } catch (err) {
    if (!(err instanceof ErrorFlujo)) throw err;
    await verFicha(req, res, { mensaje: err.message, seccion: "estado", status: 422 });
  }
}

export async function reasignar(req, res) {
  const correo = req.params.correo.toLowerCase();
  try {
    const r = await reasignarTramites({ correo, reemplazo: req.body.reemplazo, motivo: req.body.motivo, ...contexto(req) });
    // Avisos a la persona nueva por los trámites que ya esperaban su firma
    for (const id of r.eventos) await despacharDeEvento(id).catch((e) => console.error("Correo de reasignación:", e.message));
    const texto = r.n
      ? `Se ${r.n === 1 ? "reasignó 1 trámite" : `reasignaron ${r.n} trámites`} a ${r.nombreNuevo}.${r.eventos.length ? ` Se le avisó por correo de ${r.eventos.length} pendiente${r.eventos.length > 1 ? "s" : ""} de su firma.` : ""}`
      : "No había trámites en curso para reasignar.";
    res.redirect(`${urlDe(correo)}?ok=${encodeURIComponent(texto)}`);
  } catch (err) {
    if (!(err instanceof ErrorFlujo)) throw err;
    await verFicha(req, res, { errores: err.errores, mensaje: err.message, seccion: "reasignar", status: 422 });
  }
}
