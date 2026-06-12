import { Router, type IRouter } from "express";
import healthRouter from "./health";
import whatsappRouter from "./whatsapp";
import ticketsRouter from "./tickets";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import authRouter from "./auth";
import usersRouter from "./users";
import mediaRouter from "./media";
import cannedResponsesRouter from "./canned-responses";
import rolesRouter from "./roles";
import auditRouter from "./audit";
import inventoryRouter from "./inventory";
import stockRouter from "./stock";
import eventsRouter from "./events";
import supplierConversationsRouter from "./supplier-conversations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(whatsappRouter);
router.use(ticketsRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(mediaRouter);
router.use(cannedResponsesRouter);
router.use(rolesRouter);
router.use(auditRouter);
router.use(inventoryRouter);
router.use(stockRouter);
router.use(eventsRouter);
router.use(supplierConversationsRouter);

export default router;
