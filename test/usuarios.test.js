import { test } from "node:test";
import assert from "node:assert/strict";
import { validarDatosUsuario, tipoDeCambio, validarCambioSensible } from "../services/usuarios.js";
import { ErrorFlujo } from "../services/flujo.js";

test("datos de un usuario nuevo: correo en minúsculas, subsecretaría solo para ordenadores", () => {
  const u = validarDatosUsuario({ correo: " Ana.Rosales@SED.gov.co ", nombre: "Ana  Lucía Rosales", rol: "subsecretario", subsecretaria: "Gestión Institucional" }, { nuevo: true });
  assert.equal(u._id, "ana.rosales@sed.gov.co");
  assert.equal(u.nombre, "Ana Lucía Rosales");
  assert.equal(validarDatosUsuario({ nombre: "X", rol: "revisor", subsecretaria: "Algo" }).subsecretaria, "");
});

test("errores por campo", () => {
  try {
    validarDatosUsuario({ correo: "malo", rol: "jefe" }, { nuevo: true });
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof ErrorFlujo);
    assert.deepEqual(Object.keys(e.errores).sort(), ["correo", "nombre", "rol"]);
  }
  assert.throws(() => validarDatosUsuario({ nombre: "X", rol: "subsecretario" }), (e) => /subsecretaría/.test(e.errores.subsecretaria));
});

test("tipo de cambio para la bitácora", () => {
  const actual = { nombre: "Ana", cargo: "", rol: "revisor", subsecretaria: "", observaciones: "" };
  assert.equal(tipoDeCambio(actual, { ...actual }), null);
  assert.equal(tipoDeCambio(actual, { ...actual, cargo: "Profesional" }).accion, "USUARIO_ACTUALIZADO");
  const r = tipoDeCambio(actual, { ...actual, rol: "admin" });
  assert.equal(r.accion, "ROL_CAMBIADO");
  assert.deepEqual(r.cambios.rol, { antes: "revisor", ahora: "admin" });
});

const farid = { _id: "farid@sed.gov.co", nombre: "Farid", rol: "admin", activo: true };
const manuel = { correo: "manuel@sed.gov.co", rol: "admin" };
const director = { _id: "carmona@sed.gov.co", nombre: "Cristian Carmona", rol: "director", activo: true };

test("nadie se quita a sí mismo la administración", () => {
  assert.throws(
    () => validarCambioSensible({ actual: farid, rolNuevo: "admin", activoNuevo: false, autor: { correo: farid._id }, adminsActivos: 2, asignados: 0 }),
    /propio rol/
  );
});

test("siempre queda al menos una persona con rol de administración", () => {
  assert.throws(
    () => validarCambioSensible({ actual: farid, rolNuevo: "revisor", activoNuevo: true, autor: manuel, adminsActivos: 1, asignados: 0 }),
    /al menos una/
  );
  assert.doesNotThrow(() => validarCambioSensible({ actual: farid, rolNuevo: "revisor", activoNuevo: true, autor: manuel, adminsActivos: 2, asignados: 0 }));
});

test("un firmante con trámites en curso no se desactiva ni cambia de rol sin reasignar", () => {
  assert.throws(
    () => validarCambioSensible({ actual: director, rolNuevo: "director", activoNuevo: false, autor: manuel, adminsActivos: 2, asignados: 3 }),
    /3 trámites en curso.*Reasígnalos/
  );
  assert.throws(() => validarCambioSensible({ actual: director, rolNuevo: "revisor", activoNuevo: true, autor: manuel, adminsActivos: 2, asignados: 1 }), /1 trámite en curso/);
  assert.doesNotThrow(() => validarCambioSensible({ actual: director, rolNuevo: "director", activoNuevo: false, autor: manuel, adminsActivos: 2, asignados: 0 }));
});
