// Envía un correo de ejemplo con el proveedor configurado (Gmail o Brevo) para comprobar la configuración y ver
// si llega a la bandeja de entrada o a spam. No usa la base de datos.
//   npm run probar-correo -- tu.correo@educacionbogota.gov.co
import { CORREO, correoActivo, faltaParaCorreo } from "../config/config.js";
import { enviadorDe } from "../services/correo/despachador.js";
import { armarCorreo } from "../services/correo/plantillas.js";
import { horaTexto } from "../services/registrarAccion.js";

const destino = (process.argv[2] || CORREO.redirigirA || CORREO.remitente).trim().toLowerCase();

if (!correoActivo()) {
  console.error(`Falta en el archivo .env: ${faltaParaCorreo().join(", ")} (ver .env.example).`);
  process.exit(1);
}

const ahora = new Date();
const { asunto, cuerpoHtml } = armarCorreo({
  tramite: { _id: "TR-PRUEBA-0001", wfActual: "999", lote: null, valorTotal: 1250000, numRegistros: 3, estado: "WF_CARGADO" },
  evento: {
    accion: "REGISTRAR_WF",
    estadoNuevo: "WF_CARGADO",
    usuario: { nombre: "Correo de prueba", correo: CORREO.remitente },
    datos: { segmento: "SE01", descripcion: "Este es un correo de prueba de la Bitácora de Pagos" },
  },
  horaTexto: horaTexto(ahora),
});

try {
  const nombre = CORREO.proveedor === "gmail" ? "Gmail" : "Brevo";
  const id = await enviadorDe(CORREO.proveedor)({ ...CORREO, para: [destino], asunto: `[PRUEBA] ${asunto}`, cuerpoHtml });
  console.log(`✔ ${nombre} aceptó el correo para ${destino} (id ${id || "sin id"}), remitente ${CORREO.remitente}.`);
  console.log("  Revisa la bandeja de entrada y también Correo no deseado.");
} catch (err) {
  console.error(`✘ ${err.message}`);
  if (CORREO.proveedor === "brevo" && /401|key/i.test(err.message)) console.error("  Revisa que BREVO_API_KEY esté completa en el .env.");
  if (/sender|remitente/i.test(err.message)) console.error("  Revisa que CORREO_REMITENTE esté verificado en Brevo (Remitentes).");
  process.exitCode = 1;
}
