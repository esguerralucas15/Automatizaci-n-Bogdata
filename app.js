import express from "express";
import { join } from "path";
import mongoose from "mongoose";

import { PORT, EN_PRODUCCION, validarConfiguracion } from "./config/config.js";

validarConfiguracion();

const { conectarDB } = await import("./config/db.js");
const { default: sesion } = await import("./config/session.js");
const { default: appRouter } = await import("./routes/router.js");
const { variablesVista } = await import("./middlewares/auth.js");
const { noEncontrado, manejadorErrores } = await import("./middlewares/errores.js");

const app = express();

app.set("view engine", "ejs");
app.set("views", join(import.meta.dirname, "views"));

// Render pone un proxy HTTPS delante: sin esto la cookie segura no se enviaría
if (EN_PRODUCCION) app.set("trust proxy", 1);

// Ruta de salud para cron-job.org y Render. Va antes de la sesión.
app.get("/salud", (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({ estado: mongoOk ? "ok" : "sin-conexion-mongo" });
});

app.use(express.static(join(import.meta.dirname, "public")));
app.use(express.urlencoded({ extended: false }));
app.use(sesion);
app.use(variablesVista);

app.use("/", appRouter);

app.use(noEncontrado);
app.use(manejadorErrores);

try {
  await conectarDB();
  app.listen(PORT, (err) => {
    if (err) {
      console.error(
        `No se pudo iniciar el servidor en el puerto ${PORT}: ${err.code === "EADDRINUSE" ? "el puerto ya está en uso (¿hay otro servidor abierto?)" : err.message}`
      );
      process.exit(1);
    }
    console.log(`Server running 🚀 at http://localhost:${PORT}`);
  });
} catch (err) {
  console.error("No se pudo conectar a MongoDB:", err.message);
  process.exit(1);
}
