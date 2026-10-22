// Roles de la aplicación y su nombre para mostrar
export const ROLES = ["revisor", "director", "subsecretario", "admin"];

export const NOMBRE_ROL = {
  revisor: "Revisor",
  director: "Responsable de presupuesto",
  subsecretario: "Ordenador del gasto",
  admin: "Administradora",
};

// Página de inicio según el rol
export const inicioDe = (rol) => (rol === "admin" ? "/admin/dashboard" : "/bandeja");

export const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
