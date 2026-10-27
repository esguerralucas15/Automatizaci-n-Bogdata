import { Router } from "express";
import * as admin from "../controllers/adminController.js";
import { requiereSesion, soloRoles } from "../middlewares/auth.js";

const router = Router();
router.use(requiereSesion, soloRoles("admin"));

router.get("/", (req, res) => res.redirect("/admin/dashboard"));
router.get("/dashboard", admin.dashboard);
router.get("/usuarios", admin.usuarios);
router.get("/tiempos", admin.tiempos);
router.get("/bitacora", admin.bitacora);

export default router;
