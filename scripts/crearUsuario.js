// Crea un usuario desde la terminal (útil para el primer administrador o soporte técnico).
//   npm run crear-usuario -- <correo> "<Nombre completo>" <rol> ["<Cargo>"] ["<Subsecretaría>"]
//   npm run produccion:crear-usuario -- lesguerra@educacionbogota.gov.co "Lucas Esguerra Villegas" admin "Contratista – soporte técnico"
// rol: revisor | director | subsecretario | admin. Queda en la bitácora como "Carga inicial (script)".
import { validarConfiguracion } from "../config/config.js";
import { conectarDB, desconectarDB } from "../config/db.js";
import { crearUsuario } from "../services/usuarios.js";
import { SISTEMA } from "../services/bitacora.js";
import { ErrorFlujo } from "../services/flujo.js";

const [correo, nombre, rol, cargo = "", subsecretaria = ""] = process.argv.slice(2);
if (!correo || !nombre || !rol) {
  console.error('Uso: npm run crear-usuario -- <correo> "<Nombre completo>" <rol> ["<Cargo>"] ["<Subsecretaría>"]');
  process.exit(1);
}

try {
  validarConfiguracion();
  await conectarDB();
  const u = await crearUsuario({ datos: { correo, nombre, rol, cargo, subsecretaria }, autor: SISTEMA });
  console.log(`✔ Usuario creado: ${u.nombre} <${u._id}> con rol ${u.rol}.`);
} catch (err) {
  if (err instanceof ErrorFlujo) {
    console.error(`✘ ${err.message}`);
    Object.entries(err.errores).forEach(([k, v]) => console.error(`  • ${k}: ${v}`));
  } else console.error("✘ No se pudo crear:", err.message);
  process.exitCode = 1;
} finally {
  await desconectarDB().catch(() => {});
}
