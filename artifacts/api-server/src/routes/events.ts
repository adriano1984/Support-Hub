import { Router } from "express";
import { parseAuthHeader } from "../lib/auth";
import { addSSEClient, removeSSEClient } from "../lib/sse";

const router = Router();

router.get("/events", (req, res): void => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const clientId = `${user.userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  addSSEClient(clientId, res);

  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
  }, 25000);

  res.write(`event: connected\ndata: {"ok":true}\n\n`);

  req.on("close", () => {
    clearInterval(ping);
    removeSSEClient(clientId);
  });
});

export default router;
