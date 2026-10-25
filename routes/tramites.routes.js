import { Router } from "express";
import * as tramites from "../controllers/tramiteController.js";
import { requiereSesion, soloRoles } from "../middlewares/auth.js";

const router = Router();
router.use(requiereSesion);

router.get("/", tramites.lista);
router.get("/nuevo", soloRoles("revisor"), tramites.nuevo);
router.post("/", soloRoles("revisor"), tramites.crear);
router.get("/:id", tramites.detalle);
// El rol exacto y la asignación los valida flujo.js
router.post("/:id/acciones", soloRoles("revisor", "director", "subsecretario"), tramites.ejecutarAccion);

export default router;
