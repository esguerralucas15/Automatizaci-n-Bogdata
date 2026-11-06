// Roles de la aplicación y su nombre para mostrar
export const ROLES = ["revisor", "director", "subsecretario", "admin", "admin_revisor"];

// Roles que suman permisos de otros: Manuel administra y a veces reemplaza a revisores
const PERMISOS = { admin_revisor: ["admin", "revisor"] };

// ¿El rol (o el usuario) tiene este permiso? tieneRol("admin_revisor", "revisor") === true
export const tieneRol = (rolOUsuario, permiso) => {
  const rol = typeof rolOUsuario === "string" ? rolOUsuario : rolOUsuario?.rol;
  return rol === permiso || Boolean(PERMISOS[rol]?.includes(permiso));
};
// Roles que tienen un permiso (para consultas a la base: { rol: { $in: rolesCon("admin") } })
export const rolesCon = (permiso) => ROLES.filter((r) => tieneRol(r, permiso));

export const NOMBRE_ROL = {
  revisor: "Revisor(a)",
  director: "Responsable de presupuesto",
  subsecretario: "Ordenador del gasto",
  admin: "Administrador(a)",
  admin_revisor: "Administrador(a) y revisor(a)",
};

// Página de inicio según el rol
export const inicioDe = (rol) => (tieneRol(rol, "admin") ? "/admin/dashboard" : "/bandeja");

export const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
