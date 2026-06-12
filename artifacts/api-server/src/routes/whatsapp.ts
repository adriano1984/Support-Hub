import { Router } from "express";
import { getStatus, reconnect, disconnect } from "../lib/whatsapp";

const router = Router();

router.get("/whatsapp/status", (_req, res) => {
  res.json(getStatus());
});

router.post("/whatsapp/reconnect", async (_req, res) => {
  await reconnect();
  res.json({ success: true, message: "Reconectando ao WhatsApp..." });
});

router.post("/whatsapp/disconnect", async (_req, res) => {
  await disconnect();
  res.json({ success: true, message: "WhatsApp desconectado." });
});

export default router;
