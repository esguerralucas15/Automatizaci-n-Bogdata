import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirLibro, leerHoja } from "../services/leerExcel.js";
import { validarUsuarios, validarCopias } from "../services/usuariosExcel.js";

test("lee el Excel de prueba (plantilla con notas en los encabezados)", async () => {
  const libro = await abrirLibro("scripts/datos-prueba/usuarios-prueba.xlsx");
  const u = validarUsuarios(leerHoja(libro, "Usuarios"));
  const c = validarCopias(leerHoja(libro, "Solo copia"));
  assert.deepEqual(u.errores, []);
  assert.equal(u.usuarios.length, 8);
  assert.equal(u.usuarios.filter((x) => x.rol === "subsecretario").length, 3);
  assert.deepEqual(c.copias, [{ correo: "tesoreria@prueba.gov.co", nombre: "Tesorería", recibe: "Liberación para pago" }]);
});

test("la plantilla vacía no tiene personas (solo la fila de ejemplo)", async () => {
  const libro = await abrirLibro("docs/Plantilla_Usuarios_Bitacora.xlsx");
  const u = validarUsuarios(leerHoja(libro, "Usuarios"));
  assert.match(u.errores[0], /no tiene personas/);
});
