import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fireDetectionRouter from "./fire-detection";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fireDetectionRouter);

export default router;
