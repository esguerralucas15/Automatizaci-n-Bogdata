import { Router } from "express";
import { mostrarLogin, iniciarSesion, cerrarSesion } from "../controllers/authController.js";
import { redirigirSiAutenticado } from "../middlewares/auth.js";

const router = Router();

router.get("/", (req, res) => res.redirect("/login"));
router.get("/login", redirigirSiAutenticado, mostrarLogin);
router.post("/login", redirigirSiAutenticado, iniciarSesion);
router.post("/logout", cerrarSesion);

export default router;
