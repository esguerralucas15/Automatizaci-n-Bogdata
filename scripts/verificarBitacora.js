// Verifica la cadena de hashes de toda la bitácora.
//   node scripts/verificarBitacora.js
import { validarConfiguracion } from "../config/config.js";
import { conectarDB, desconectarDB } from "../config/db.js";
import { verificarBitacora } from "../services/bitacora.js";

try {
  validarConfiguracion();
  await conectarDB();
  const r = await verificarBitacora();
  if (r.ok) console.log(`✔ Bitácora íntegra: ${r.total} eventos verificados.`);
  else {
    console.error(`✘ La bitácora fue alterada en el evento ${r.secuencia}: ${r.motivo}.`);
    process.exitCode = 2;
  }
} catch (err) {
  console.error("No se pudo verificar:", err.message);
  process.exitCode = 1;
} finally {
  await desconectarDB().catch(() => {});
}
