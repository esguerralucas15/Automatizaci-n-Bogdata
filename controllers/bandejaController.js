import Tramite from "../models/Tramite.js";
import { ESTADOS, esResponsable } from "../services/flujo.js";
import { ahora } from "../services/tiempo.js";

// Estados en los que puede actuar cada rol
const ESTADOS_POR_ROL = Object.entries(ESTADOS).reduce((acc, [estado, e]) => {
  const rol = { director: "director", ordenador: "subsecretario", revisor: "revisor" }[e.responsable];
  if (rol) (acc[rol] ??= []).push(estado);
  return acc;
}, {});

// Trámites que esperan una acción de la persona que inició sesión
export async function bandeja(req, res) {
  const u = req.session.usuario;
  const filtro = { estado: { $in: ESTADOS_POR_ROL[u.rol] ?? [] } };
  if (u.rol === "director") filtro.director = u.correo;
  if (u.rol === "subsecretario") filtro.ordenador = u.correo;

  const candidatos = await Tramite.find(filtro).sort({ ultimoEventoEn: 1 }).lean();
  const instante = ahora().getTime();
  const pendientes = candidatos
    .filter((t) => esResponsable(t, u))
    .map((t) => ({ ...t, horasEspera: (instante - new Date(t.ultimoEventoEn).getTime()) / 3600000 }));

  const enCurso = await Tramite.countDocuments({
    estado: { $nin: ["LIBERADO", "ANULADO"] },
    ...(u.rol === "director" && { director: u.correo }),
    ...(u.rol === "subsecretario" && { ordenador: u.correo }),
  });

  res.render("bandeja/bandeja", {
    titulo: "Mi bandeja",
    pendientes,
    enCurso,
    esperaDe: (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`),
  });
}
