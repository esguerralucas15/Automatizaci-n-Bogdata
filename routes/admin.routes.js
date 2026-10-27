import { Router } from "express";
import * as admin from "../controllers/adminController.js";
import * as usuarios from "../controllers/usuariosController.js";
import { requiereSesion, soloRoles } from "../middlewares/auth.js";

const router = Router();
router.use(requiereSesion, soloRoles("admin"));

router.get("/", (req, res) => res.redirect("/admin/dashboard"));
router.get("/dashboard", admin.dashboard);
router.get("/usuarios", admin.usuarios);
router.get("/usuarios/nuevo", usuarios.nuevo);
router.post("/usuarios", usuarios.crear);
router.get("/usuarios/:correo", usuarios.ficha);
router.post("/usuarios/:correo", usuarios.actualizar);
router.post("/usuarios/:correo/estado", usuarios.estado);
router.post("/usuarios/:correo/reasignar", usuarios.reasignar);
router.get("/tiempos", admin.tiempos);
router.get("/bitacora", admin.bitacora);

export default router;
