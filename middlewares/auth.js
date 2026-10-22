// Protección de rutas según la sesión y el rol del usuario
import { partesBogota, horaLegible, fechaLegible } from "../services/tiempo.js";
import { inicioDe, NOMBRE_ROL } from "../models/roles.js";
import { etiquetaEstado } from "../services/flujo.js";

export function requiereSesion(req, res, next) {
  if (!req.session.usuario) return res.redirect("/login");
  next();
}

// soloRoles("admin") · soloRoles("revisor", "director", "subsecretario")
export function soloRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.session.usuario?.rol)) {
      return res.status(403).render("errores/403", { titulo: "Acceso denegado" });
    }
    next();
  };
}

// Si ya hay sesión, enviar directamente a su página de inicio
export function redirigirSiAutenticado(req, res, next) {
  const u = req.session.usuario;
  if (u) return res.redirect(inicioDe(u.rol));
  next();
}

const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Ayudas de formato para las vistas (siempre en hora de Bogotá)
const formato = {
  fechaLegible,
  horaLegible,
  // Date -> "4:35 p.m."
  horaDe: (instante) => (instante ? horaLegible(partesBogota(new Date(instante)).hora) : "—"),
  // Date -> "martes 20 de octubre, 4:35 p.m."
  fechaHoraDe: (instante) => {
    if (!instante) return "—";
    const p = partesBogota(new Date(instante));
    return `${fechaLegible(p.fecha)}, ${horaLegible(p.hora)}`;
  },
  numero: (n) => Number(n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 1 }),
  dinero: (n) => pesos.format(Number(n ?? 0)),
  nombreRol: (rol) => NOMBRE_ROL[rol] ?? rol,
  etiquetaEstado,
};

// Variables disponibles en todas las vistas
export function variablesVista(req, res, next) {
  res.locals.usuario = req.session.usuario || null;
  res.locals.rutaActual = req.path;
  Object.assign(res.locals, formato);
  next();
}
