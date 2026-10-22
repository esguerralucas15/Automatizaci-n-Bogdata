import Usuario from "../models/Usuario.js";
import Tramite from "../models/Tramite.js";
import Configuracion from "../models/Configuracion.js";
import { ROLES } from "../models/roles.js";
import { partesBogota, aFechaHora, ahora } from "../services/tiempo.js";

export async function dashboard(req, res) {
  const conf = await Configuracion.actual();
  const limite = new Date(ahora().getTime() - conf.horasDetenido * 3600000);
  const mes = partesBogota(ahora()).fecha.slice(0, 7);
  const inicioMes = aFechaHora(`${mes}-01`, "00:00");

  const [usuariosActivos, enCurso, detenidos, liberadosMes] = await Promise.all([
    Usuario.countDocuments({ activo: true }),
    Tramite.countDocuments({ estado: { $nin: ["LIBERADO", "ANULADO"] } }),
    Tramite.countDocuments({ estado: { $nin: ["LIBERADO", "ANULADO"] }, ultimoEventoEn: { $lt: limite } }),
    Tramite.countDocuments({ estado: "LIBERADO", ultimoEventoEn: { $gte: inicioMes } }),
  ]);

  res.render("admin/dashboard", {
    titulo: "Dashboard",
    usuariosActivos, enCurso, detenidos, liberadosMes,
    horasDetenido: conf.horasDetenido,
  });
}

export async function usuarios(req, res) {
  const rol = ROLES.includes(req.query.rol) ? req.query.rol : "";
  const lista = await Usuario.find(rol ? { rol } : {}).sort({ activo: -1, rol: 1, nombre: 1 }).lean();
  const conf = await Configuracion.actual();
  res.render("admin/usuarios", {
    titulo: "Usuarios",
    lista,
    roles: ROLES,
    filtros: { rol },
    copias: conf.destinatariosCopia,
  });
}
