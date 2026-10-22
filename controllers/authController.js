import Usuario from "../models/Usuario.js";
import { inicioDe } from "../models/roles.js";

const TITULO = "Bitácora de Trámites de Pago";

export function mostrarLogin(req, res) {
  res.render("auth/login", { titulo: TITULO, error: null, correo: "" });
}

// Igual que en Horas-Compensacion, pero con el correo institucional en lugar de la cédula
export async function iniciarSesion(req, res, next) {
  const correo = String(req.body.correo || "").trim().toLowerCase();

  if (!correo) {
    return res.status(400).render("auth/login", {
      titulo: TITULO,
      error: "Ingresa tu correo institucional",
      correo,
    });
  }

  // Solo entran las personas activas en la colección usuarios
  const registrado = await Usuario.findOne({ _id: correo, activo: true }).lean();
  if (!registrado) {
    return res.status(401).render("auth/login", {
      titulo: TITULO,
      error: "El correo no está registrado. Solicita acceso a la administradora.",
      correo,
    });
  }

  const { nombre, rol } = registrado;

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.usuario = { correo, nombre, rol };
    res.redirect(inicioDe(rol));
  });
}

export function cerrarSesion(req, res) {
  req.session.destroy(() => {
    res.clearCookie("bitacora.sid");
    res.redirect("/login");
  });
}
