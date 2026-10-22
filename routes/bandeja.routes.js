import { Router } from "express";
import { bandeja } from "../controllers/bandejaController.js";
import { requiereSesion, soloRoles } from "../middlewares/auth.js";

const router = Router();
router.use(requiereSesion, soloRoles("revisor", "director", "subsecretario"));

router.get("/", bandeja);

export default router;
