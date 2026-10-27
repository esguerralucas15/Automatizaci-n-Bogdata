// Convierte las claves de notificar (flujo.js) en direcciones de correo.
//   director | ordenador | revisor -> el correo asignado en el trámite
//   admin  -> todas las personas activas con rol admin
// copias: correos que van en copia para esta acción (services/copias.js)
// Quien registró el paso no se envía correo a sí mismo.
export function resolverDestinatarios(claves, tramite, { admins = [], copias = [], autor = null }) {
  const para = new Set();
  const cc = new Set();
  for (const clave of claves) {
    if (["director", "ordenador", "revisor"].includes(clave) && tramite[clave]) para.add(tramite[clave]);
    else if (clave === "admin") admins.forEach((c) => para.add(c));
  }
  copias.forEach((c) => cc.add(c.correo ?? c));
  if (autor) {
    para.delete(autor);
    cc.delete(autor);
  }
  for (const c of para) cc.delete(c);
  return { para: [...para], cc: [...cc] };
}
