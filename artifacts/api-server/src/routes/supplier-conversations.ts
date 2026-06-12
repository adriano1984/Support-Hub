import { Router } from "express";
import { db, saveSupplierMessage, getOrCreateSupplierConversation } from "../lib/database";
import { parseAuthHeader } from "../lib/auth";
import { sendSupplierMessage } from "../lib/whatsapp";
import { logger } from "../lib/logger";

const router = Router();

function requireManagerOrAdmin(req: any, res: any, next: any): void {
  const actor = parseAuthHeader(req.headers.authorization);
  if (!actor || !["admin", "manager"].includes(actor.role)) {
    res.status(403).json({ error: "Acesso restrito a gestores e administradores" });
    return;
  }
  (req as any).actor = actor;
  next();
}

// GET /supplier-conversations — lista conversas (mais recentes primeiro)
router.get("/supplier-conversations", requireManagerOrAdmin, (req, res): void => {
  const { status } = req.query as Record<string, string>;
  const where = status ? "WHERE sc.status = ?" : "";
  const params = status ? [status] : [];

  const rows = (db.prepare(`
    SELECT
      sc.id,
      sc.phone,
      sc.client_name,
      sc.status,
      sc.created_at,
      sc.updated_at,
      (SELECT sm.content FROM supplier_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message,
      (SELECT sm.created_at FROM supplier_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM supplier_messages sm WHERE sm.conversation_id = sc.id AND sm.direction = 'inbound') AS message_count
    FROM supplier_conversations sc
    ${where}
    ORDER BY sc.updated_at DESC
    LIMIT 200
  `).all(...params) as any[]);

  res.json(rows);
});

// GET /supplier-conversations/:id — conversa com mensagens
router.get("/supplier-conversations/:id", requireManagerOrAdmin, (req, res): void => {
  const id = parseInt(req.params.id);
  const conversation = db.prepare("SELECT * FROM supplier_conversations WHERE id = ?").get(id) as any;
  if (!conversation) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return;
  }
  const messages = db.prepare(
    "SELECT * FROM supplier_messages WHERE conversation_id = ? ORDER BY created_at ASC"
  ).all(id) as any[];

  res.json({ conversation, messages });
});

// POST /supplier-conversations/:id/reply — enviar mensagem ao fornecedor
router.post("/supplier-conversations/:id/reply", requireManagerOrAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const conv = db.prepare("SELECT * FROM supplier_conversations WHERE id = ?").get(id) as any;
  if (!conv) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return;
  }
  if (conv.status === "closed") {
    res.status(400).json({ error: "Conversa encerrada. Não é possível enviar mensagens." });
    return;
  }
  const { message } = req.body;
  if (!message?.trim()) {
    res.status(400).json({ error: "Mensagem é obrigatória" });
    return;
  }

  const actor = (req as any).actor;
  const agentName = actor?.name ?? "Atendente";

  try {
    const sent = await sendSupplierMessage(conv.phone, message.trim(), agentName, id);
    if (!sent) {
      res.status(503).json({ error: "WhatsApp não está conectado. Mensagem não enviada." });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Erro ao enviar mensagem para fornecedor");
    res.status(500).json({ error: "Erro interno ao enviar mensagem" });
  }
});

// PATCH /supplier-conversations/:id/close — encerrar conversa
router.patch("/supplier-conversations/:id/close", requireManagerOrAdmin, (req, res): void => {
  const id = parseInt(req.params.id);
  const conv = db.prepare("SELECT * FROM supplier_conversations WHERE id = ?").get(id) as any;
  if (!conv) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return;
  }
  db.prepare("UPDATE supplier_conversations SET status = 'closed', updated_at = datetime('now') WHERE id = ?").run(id);
  res.json({ success: true });
});

// PATCH /supplier-conversations/:id/reopen — reabrir conversa
router.patch("/supplier-conversations/:id/reopen", requireManagerOrAdmin, (req, res): void => {
  const id = parseInt(req.params.id);
  const conv = db.prepare("SELECT * FROM supplier_conversations WHERE id = ?").get(id) as any;
  if (!conv) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return;
  }
  db.prepare("UPDATE supplier_conversations SET status = 'open', updated_at = datetime('now') WHERE id = ?").run(id);
  res.json({ success: true });
});

export default router;
