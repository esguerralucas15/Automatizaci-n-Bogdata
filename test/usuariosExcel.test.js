import { test } from "node:test";
import assert from "node:assert/strict";
import { validarUsuarios, validarCopias } from "../services/usuariosExcel.js";

const ENC = ["Correo institucional", "Nombre completo", "Cargo", "Rol", "Subsecretaría", "Activo", "Observaciones"];
const ejemplo = ["ana.perez@ejemplo.gov.co", "Ana Pérez (ejemplo)", "Profesional", "revisor", "", "SI", ""];
const admin = ["Marta@Ejemplo.gov.co", "Marta  Ruiz", "Profesional Especializada", "Administradora", "", "", ""];

test("lee la plantilla, normaliza correos y roles, y salta la fila de ejemplo", () => {
  const { usuarios, errores } = validarUsuarios({
    encabezados: ENC,
    filas: [
      ejemplo,
      ["luis@ejemplo.gov.co", "Luis Gómez", "Profesional", "Revisor", "", "SI", ""],
      ["laura@ejemplo.gov.co", "Laura Díaz", "Subsecretaria", "ordenador del gasto", "Gestión Institucional", "Sí", ""],
      admin,
      ["", "", "", "", "", "", ""],
    ],
  });
  assert.deepEqual(errores, []);
  assert.equal(usuarios.length, 3);
  assert.deepEqual(usuarios.map((u) => [u._id, u.rol, u.activo]), [
    ["luis@ejemplo.gov.co", "revisor", true],
    ["laura@ejemplo.gov.co", "subsecretario", true],
    ["marta@ejemplo.gov.co", "admin", true],
  ]);
  assert.equal(usuarios[2].nombre, "Marta Ruiz");
});

test("reporta cada error con su número de fila", () => {
  const { errores } = validarUsuarios({
    encabezados: ENC,
    filas: [
      ["no-es-correo", "", "", "jefe", "", "TAL VEZ", ""],
      ["pedro@ejemplo.gov.co", "Pedro", "", "subsecretario", "", "SI", ""],
      ["pedro@ejemplo.gov.co", "Pedro bis", "", "revisor", "", "SI", ""],
      admin,
    ],
  });
  assert.match(errores[0], /^Fila 2: correo no válido.*falta el nombre.*rol no válido.*Activo debe ser SI o NO/);
  assert.match(errores[1], /^Fila 3: falta la subsecretaría/);
  assert.equal(errores.length, 2); // la fila 4 (repetida) no se reporta porque la 3 no se aceptó
});

test("detecta correos repetidos", () => {
  const fila = ["luis@ejemplo.gov.co", "Luis", "", "revisor", "", "SI", ""];
  const { errores } = validarUsuarios({ encabezados: ENC, filas: [fila, fila, admin] });
  assert.match(errores[0], /Fila 3: correo repetido \(ya está en la fila 2\)/);
});

test("exige al menos una administradora activa", () => {
  const { errores } = validarUsuarios({ encabezados: ENC, filas: [["luis@ejemplo.gov.co", "Luis", "", "revisor", "", "SI", ""]] });
  assert.match(errores[0], /rol admin/);
});

test("avisa si faltan columnas", () => {
  const { errores } = validarUsuarios({ encabezados: ["Correo", "Nombre"], filas: [] });
  assert.match(errores[0], /correo, nombre, rol/);
});

test("hoja Solo copia", () => {
  const { copias, errores } = validarCopias({
    encabezados: ["Correo", "Nombre o área", "Qué correos debe recibir"],
    filas: [
      ["tesoreria@ejemplo.gov.co", "Tesorería (ejemplo)", "Liberación para pago"],
      ["Tesoreria@Sed.gov.co", "Tesorería", ""],
      ["malo", "X", ""],
    ],
  });
  assert.deepEqual(copias, [{ correo: "tesoreria@sed.gov.co", nombre: "Tesorería", recibe: "Todos", subsecretaria: "" }]);
  assert.match(errores[0], /fila 4/);
});
