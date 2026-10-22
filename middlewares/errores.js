export function noEncontrado(req, res) {
  res.status(404).render("errores/404", { titulo: "Página no encontrada" });
}

// eslint-disable-next-line no-unused-vars
export function manejadorErrores(err, req, res, next) {
  console.error(err);
  res.status(500).render("errores/500", { titulo: "Error" });
}
