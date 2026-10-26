import { Router } from "express";
import { mostrarLogin, iniciarSesion, cerrarSesion } from "../controllers/authController.js";
import { redirigirSiAutenticado } from "../middlewares/auth.js";

const router = Router();

router.get("/", (req, res) => res.redirect("/login"));
router.get("/login", redirigirSiAutenticado, mostrarLogin);
router.post("/login", redirigirSiAutenticado, iniciarSesion);
router.post("/logout", cerrarSesion);

// Pública: Google la exige para autorizar el envío de correos con Gmail
router.get("/privacidad", (req, res) => res.render("publico/privacidad", { titulo: "Política de privacidad" }));

export default router;
