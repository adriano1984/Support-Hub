import { Router } from "express";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { db, addAuditLog } from "../lib/database";
import { sendMessage, sendAudioMessage, notifyStatusChange, setConvMode, getConvMode } from "../lib/whatsapp";
import { parseAuthHeader } from "../lib/auth";
import { logger } from "../lib/logger";
import { processarAnalista, gerarIA, analyzeTicketLocally } from "../overlay";
import { broadcastEvent } from "../lib/sse";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");

const router = Router();

// ─── List tickets ─────────────────────────────────────────────────────────────
router.get("/tickets", (req, res) => {
  const {
    status, branchId, departmentId, categoryId, assignedTo,
    search, page = "1", limit = "20"
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  let where = "WHERE 1=1";
  const params: any[] = [];

  // Analysts cannot see supplier-mode tickets
  const requestingUser = parseAuthHeader(req.headers.authorization);
  const isAnalyst = requestingUser && ["technician", "attendant"].includes(requestingUser.role);
  if (isAnalyst) {
    where += " AND (t.bot_mode IS NULL OR t.bot_mode != 'supplier')";
  }

  if (status === "not_closed") {
    where += " AND t.status != 'closed'";
  } else if (status) {
    where += " AND t.status = ?"; params.push(status);
  }
  if (branchId) { where += " AND t.branch_id = ?"; params.push(parseInt(branchId)); }
  if (departmentId) { where += " AND t.department_id = ?"; params.push(parseInt(departmentId)); }
  if (categoryId) { where += " AND t.category_id = ?"; params.push(parseInt(categoryId)); }
  if (assignedTo) { where += " AND t.assigned_to = ?"; params.push(parseInt(assignedTo)); }
  if ((req.query as any).unassigned === "true") { where += " AND t.assigned_to IS NULL"; }
  if (search) {
    where += " AND (t.ticket_number LIKE ? OR t.client_name LIKE ? OR t.whatsapp_phone LIKE ? OR t.description LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const query = `
    SELECT t.*, b.name as branch_name, d.name as department_name, c.name as category_name
    FROM tickets t
    LEFT JOIN branches b ON t.branch_id = b.id
    LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}
    ORDER BY t.updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const countQuery = `SELECT COUNT(*) as total FROM tickets t ${where}`;
  const tickets = db.prepare(query).all(...params, limitNum, offset) as any[];
  const { total } = db.prepare(countQuery).get(...params) as { total: number };

  res.json({ tickets: tickets.map(mapTicket), total, page: pageNum, limit: limitNum });
});

// ─── Get ticket detail ─────────────────────────────────────────────────────────
router.get("/tickets/:id", (req, res): void => {
  const id = parseInt(req.params.id);

  const ticket = db.prepare(
    `SELECT t.*, b.name as branch_name, d.name as department_name, c.name as category_name
     FROM tickets t
     LEFT JOIN branches b ON t.branch_id = b.id
     LEFT JOIN departments d ON t.department_id = d.id
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.id = ?`
  ).get(id) as any;

  if (!ticket) { res.status(404).json({ error: "Chamado não encontrado" }); return; }

  const messages = db.prepare("SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC").all(id) as any[];
  const botMode = getConvMode(ticket.whatsapp_phone);

  res.json({
    ticket: { ...mapTicket(ticket), botMode },
    messages: messages.map(mapMessage),
  });
});

// ─── Update status ─────────────────────────────────────────────────────────────
router.patch("/tickets/:id/status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { status, note } = req.body;
  const user = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  const allowed = ["open", "in_progress", "waiting_client", "waiting_analyst", "closed"];
  if (!allowed.includes(status)) { res.status(400).json({ error: "Status inválido" }); return; }

  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
  if (!ticket) { res.status(404).json({ error: "Chamado não encontrado" }); return; }

  const previousStatus = ticket.status;
  const statusLabels: Record<string, string> = {
    open: "Aberto", in_progress: "Em atendimento",
    waiting_client: "Aguardando Cliente", waiting_analyst: "Aguardando Analista",
    closed: "Fechado",
  };
  const actor = user?.name ?? "Admin";

  // ── Status flow enforcement: forward-only for non-admins ─────────────────
  const isAdmin = user?.role === "admin" || user?.role === "manager";
  if (!isAdmin) {
    const FORWARD_ONLY: Record<string, string[]> = {
      open:            ["open", "in_progress"],
      in_progress:     ["in_progress", "waiting_client", "waiting_analyst", "closed"],
      waiting_client:  ["waiting_client", "in_progress", "closed"],
      waiting_analyst: ["waiting_analyst", "in_progress", "closed"],
      closed:          ["closed"],
    };
    const allowedNext = FORWARD_ONLY[previousStatus] ?? [];
    if (!allowedNext.includes(status)) {
      res.status(400).json({
        error: `Não é permitido alterar de "${statusLabels[previousStatus] ?? previousStatus}" para "${statusLabels[status] ?? status}". O fluxo é em sentido único.`,
      });
      return;
    }
  }

  // Track reopen: if going from closed → open or in_progress (admin only at this point)
  const isReopen = previousStatus === "closed" && (status === "open" || status === "in_progress");
  if (isReopen) {
    db.prepare("UPDATE tickets SET reopen_count = reopen_count + 1, status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  } else {
    db.prepare("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  }

  db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'status_changed', ?)").run(
    id, `${actor} alterou para: ${statusLabels[status] ?? status}`
  );

  if (note) {
    db.prepare("INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'internal', 'note', ?, ?)").run(id, note, actor);
  }

  addAuditLog({
    userId: user?.userId, userName: actor, action: "ticket_status_changed",
    entity: "ticket", entityId: id,
    detail: `Chamado #${ticket.ticket_number}: ${statusLabels[previousStatus] ?? previousStatus} → ${statusLabels[status] ?? status}${isReopen ? " (reabertura)" : ""}`,
    ip,
  });

  await notifyStatusChange(id, status, previousStatus, actor);
  broadcastEvent("ticket:updated", { ticketId: id, status });

  const updated = db.prepare(
    `SELECT t.*, b.name as branch_name, d.name as department_name, c.name as category_name
     FROM tickets t
     LEFT JOIN branches b ON t.branch_id = b.id
     LEFT JOIN departments d ON t.department_id = d.id
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.id = ?`
  ).get(id) as any;

  res.json(mapTicket(updated));
});

// ─── Assign ticket to user ─────────────────────────────────────────────────────
router.post("/tickets/:id/assign", (req, res): void => {
  const id = parseInt(req.params.id);
  const { userId } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
  if (!ticket) { res.status(404).json({ error: "Chamado não encontrado" }); return; }

  if (!userId || userId === null) {
    db.prepare("UPDATE tickets SET assigned_to = NULL, assignee_name = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
    db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'assigned', ?)").run(id, `${actor?.name ?? "Admin"} removeu a atribuição`);
    addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "ticket_unassigned", entity: "ticket", entityId: id, detail: `Chamado #${ticket.ticket_number}: atribuição removida`, ip });
    res.json({ success: true, assigneeName: null }); return;
  }

  const targetUser = db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(parseInt(userId)) as any;
  if (!targetUser) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

  db.prepare("UPDATE tickets SET assigned_to = ?, assignee_name = ?, updated_at = datetime('now') WHERE id = ?").run(targetUser.id, targetUser.name, id);
  db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'assigned', ?)").run(id, `Chamado atribuído a ${targetUser.name} por ${actor?.name ?? "Admin"}`);

  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "ticket_assigned", entity: "ticket", entityId: id, detail: `Chamado #${ticket.ticket_number} atribuído a ${targetUser.name}`, ip });

  res.json({ success: true, assigneeName: targetUser.name });
});

// ─── Reply to ticket ───────────────────────────────────────────────────────────
router.post("/tickets/:id/reply", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { message } = req.body;
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }
  const senderName = user.name;
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  if (!message?.trim()) { res.status(400).json({ error: "Mensagem não pode ser vazia" }); return; }

  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
  if (!ticket) { res.status(404).json({ error: "Chamado não encontrado" }); return; }

  const cmd = message.trim().toLowerCase();

  if (cmd === "/assumir") {
    setConvMode(ticket.whatsapp_phone, "human");
    db.prepare("INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'internal', 'note', ?, 'Sistema')").run(id, `⚙️ Modo HUMANO ativado — bot pausado. ${senderName} assumiu o chamado.`);
    db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(id);
    db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'status_changed', ?)").run(id, `${senderName} assumiu o chamado (/assumir)`);
    addAuditLog({ userId: user?.userId, userName: senderName, action: "ticket_assumed", entity: "ticket", entityId: id, detail: `Chamado #${ticket.ticket_number} assumido por ${senderName}`, ip });
    res.json({ success: true, message: "Modo humano ativado." }); return;
  }

  if (cmd === "/bot") {
    setConvMode(ticket.whatsapp_phone, "bot");
    db.prepare("INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'internal', 'note', ?, 'Sistema')").run(id, "⚙️ Modo BOT reativado — automação retomada.");
    db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(id);
    db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'status_changed', ?)").run(id, `Bot reativado por ${senderName}`);
    res.json({ success: true, message: "Bot reativado." }); return;
  }

  if (cmd === "/fornecedor") {
    setConvMode(ticket.whatsapp_phone, "supplier");
    db.prepare("UPDATE tickets SET bot_mode = 'supplier' WHERE id = ?").run(id);
    db.prepare("INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'internal', 'note', ?, 'Sistema')").run(id, "⚙️ Modo FORNECEDOR ativado — conversa livre.");
    db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(id);
    db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'status_changed', ?)").run(id, `Modo fornecedor ativado por ${senderName}`);
    res.json({ success: true, message: "Modo fornecedor ativado." }); return;
  }

  // Bloquear resposta se o chamado não estiver Em Atendimento
  if (ticket.status !== "in_progress") {
    res.status(400).json({ error: "Altere o status para 'Em Atendimento' antes de responder ao cliente." });
    return;
  }

  // Registrar primeira resposta do atendente (se ainda não registrada)
  if (!ticket.first_response_at) {
    db.prepare("UPDATE tickets SET first_response_at = datetime('now') WHERE id = ?").run(id);
  }

  const whatsappMsg = `👤 *${senderName}:* ${message}`;

  db.prepare("INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'outbound', 'text', ?, ?)").run(id, whatsappMsg, senderName);
  db.prepare("UPDATE tickets SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
  broadcastEvent("message:new", { ticketId: id });

  const sent = await sendMessage(ticket.whatsapp_phone, whatsappMsg);
  db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'reply', ?)").run(id, sent ? `Resposta enviada por ${senderName}` : `Mensagem salva (WhatsApp offline) — ${senderName}`);

  addAuditLog({ userId: user?.userId, userName: senderName, action: "ticket_replied", entity: "ticket", entityId: id, detail: `Chamado #${ticket.ticket_number}: resposta enviada`, ip });

  try {
    processarAnalista(id, ticket.ticket_number, message, ticket.whatsapp_phone, sendMessage);
  } catch (err) {
    logger.warn({ err }, "processarAnalista error (non-fatal)");
  }

  res.json({ success: true, message: sent ? "Mensagem enviada" : "Mensagem salva (WhatsApp offline)" });
});

// ─── Add internal note ─────────────────────────────────────────────────────────
router.post("/tickets/:id/notes", (req, res): void => {
  const id = parseInt(req.params.id);
  const { content } = req.body;
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }
  const senderName = user.name;
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  if (!content?.trim()) { res.status(400).json({ error: "Conteúdo não pode ser vazio" }); return; }

  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
  if (!ticket) { res.status(404).json({ error: "Chamado não encontrado" }); return; }

  const result = db.prepare("INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'internal', 'note', ?, ?)").run(id, content, senderName);
  db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(id);
  db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'note_added', ?)").run(id, `Nota interna por ${senderName}`);

  addAuditLog({ userId: user?.userId, userName: senderName, action: "ticket_note_added", entity: "ticket", entityId: id, detail: `Chamado #${ticket.ticket_number}: nota interna adicionada`, ip });

  const note = db.prepare("SELECT * FROM messages WHERE id = ?").get(result.lastInsertRowid) as any;
  res.status(201).json(mapMessage(note));
});

// ─── AI Suggestion ─────────────────────────────────────────────────────────────
// Tenta Groq primeiro (se GROQ_API_KEY configurada); fallback automático para
// IA local gratuita que aprende com o histórico de chamados resolvidos.
router.post("/tickets/:id/ai-suggest", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }

  const ticket = db.prepare(`
    SELECT t.*, c.name AS category_name
    FROM tickets t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).get(id) as any;
  if (!ticket) { res.status(404).json({ error: "Chamado não encontrado" }); return; }

  const recentMsgs = db.prepare(
    "SELECT direction, content, sender_name FROM messages WHERE ticket_id = ? ORDER BY created_at ASC LIMIT 20"
  ).all(id) as any[];

  // Try Groq if key is available
  if (process.env.GROQ_API_KEY) {
    const lastInbound = [...recentMsgs].reverse().find(m => m.direction === "inbound");
    if (lastInbound) {
      const contexto = recentMsgs
        .filter(m => m.direction !== "internal")
        .map(m => `[${m.direction === "inbound" ? "Cliente" : m.sender_name}]: ${m.content}`)
        .join("\n");
      try {
        const suggestion = await gerarIA(lastInbound.content, user.name, contexto);
        res.json({ suggestion, source: "groq" });
        return;
      } catch {
        // fall through to local AI
      }
    }
  }

  // Local AI — always available, no API key needed
  const analysis = analyzeTicketLocally(id, ticket.description ?? "", recentMsgs, ticket.category_name ?? null);
  res.json(analysis);
});

// ─── Activity log ─────────────────────────────────────────────────────────────
router.get("/tickets/:id/activity", (req, res): void => {
  const id = parseInt(req.params.id);
  const rows = db.prepare(
    "SELECT id, ticket_id, action, detail, created_at FROM activity_log WHERE ticket_id = ? ORDER BY created_at ASC"
  ).all(id) as any[];
  res.json(rows.map(r => ({
    id: r.id,
    ticketId: r.ticket_id,
    action: r.action,
    detail: r.detail ?? null,
    createdAt: r.created_at,
  })));
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function mapTicket(t: any) {
  return {
    id: t.id,
    ticketNumber: t.ticket_number,
    whatsappPhone: t.whatsapp_phone,
    clientName: t.client_name ?? null,
    branchId: t.branch_id ?? null,
    branchName: t.branch_name ?? null,
    departmentId: t.department_id ?? null,
    departmentName: t.department_name ?? null,
    categoryId: t.category_id ?? null,
    categoryName: t.category_name ?? null,
    description: t.description,
    status: t.status,
    assignedTo: t.assigned_to ?? null,
    assigneeName: t.assignee_name ?? null,
    reopenCount: t.reopen_count ?? 0,
    firstResponseAt: t.first_response_at ?? null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    lastMessageAt: t.last_message_at ?? null,
  };
}

// ─── Send audio message ────────────────────────────────────────────────────────
router.post("/tickets/:id/audio", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { audioBase64 } = req.body;
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }
  if (!audioBase64) { res.status(400).json({ error: "Dados de áudio não fornecidos" }); return; }

  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
  if (!ticket) { res.status(404).json({ error: "Chamado não encontrado" }); return; }
  if (ticket.status !== "in_progress") {
    res.status(400).json({ error: "Altere o status para 'Em Atendimento' antes de enviar mensagens." });
    return;
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");

  // Convert any browser audio format (WebM/MP4/OGG) to OGG/Opus for WhatsApp + playback
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const tag = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpIn  = path.join(os.tmpdir(), `audio_in_${tag}.tmp`);
  const outFilename = `${tag}.ogg`;
  const outPath = path.join(MEDIA_DIR, outFilename);

  let oggBuffer = audioBuffer;
  let mediaUrl: string | null = null;

  try {
    fs.writeFileSync(tmpIn, audioBuffer);
    execSync(
      `ffmpeg -y -i "${tmpIn}" -acodec libopus -b:a 64k -vn "${outPath}"`,
      { stdio: "pipe" }
    );
    oggBuffer = fs.readFileSync(outPath);
    mediaUrl = `/api/media/${outFilename}`;
  } catch (ffErr) {
    logger.warn({ err: ffErr }, "ffmpeg audio conversion failed — sending original");
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* ignore */ }
  }

  const sent = await sendAudioMessage(ticket.whatsapp_phone, oggBuffer);

  const content = `🎤 Áudio enviado por ${user.name}`;
  db.prepare(
    "INSERT INTO messages (ticket_id, direction, type, content, sender_name, media_url, media_mime) VALUES (?, 'outbound', 'audio', ?, ?, ?, ?)"
  ).run(id, content, user.name, mediaUrl, mediaUrl ? "audio/ogg; codecs=opus" : null);
  db.prepare("UPDATE tickets SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
  broadcastEvent("message:new", { ticketId: id });

  addAuditLog({
    userId: user.userId, userName: user.name, action: "ticket_replied",
    entity: "ticket", entityId: id,
    detail: `Chamado #${ticket.ticket_number}: áudio enviado`,
    ip: req.ip ?? null,
  });

  res.json({ success: true, sent });
});

// ─── Block reply if not in_progress (enforce on backend too) ──────────────────
// Applied inside the reply handler below
function mapMessage(m: any) {
  return {
    id: m.id,
    ticketId: m.ticket_id,
    direction: m.direction,
    type: m.type,
    content: m.content,
    mediaUrl: m.media_url ?? null,
    mediaMime: m.media_mime ?? null,
    senderName: m.sender_name ?? null,
    createdAt: m.created_at,
  };
}

export default router;
