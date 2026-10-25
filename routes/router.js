import { Router } from "express";
import authRoutes from "./auth.routes.js";
import bandejaRoutes from "./bandeja.routes.js";
import adminRoutes from "./admin.routes.js";
import tramitesRoutes from "./tramites.routes.js";

const router = Router();

router.use("/", authRoutes);
router.use("/bandeja", bandejaRoutes);
router.use("/tramites", tramitesRoutes);
router.use("/admin", adminRoutes);

export default router;
