import { Router } from "express";
import { db, addAuditLog } from "../lib/database";
import { parseAuthHeader } from "../lib/auth";

const router = Router();

// ─── Branches ──────────────────────────────────────────────────────────────────
router.get("/settings/branches", (_req, res) => {
  const rows = db.prepare("SELECT * FROM branches ORDER BY name ASC").all() as any[];
  res.json(rows.map(r => ({ id: r.id, name: r.name, active: r.active === 1 })));
});

router.post("/settings/branches", (req, res): void => {
  const { name, active = true } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  const { next_id } = db.prepare("SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM branches").get() as { next_id: number };
  db.prepare("INSERT INTO branches (id, name, active) VALUES (?, ?, ?)").run(next_id, name.trim(), active ? 1 : 0);
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "branch_created", entity: "branch", entityId: next_id, detail: `Filial "${name.trim()}" criada`, ip });
  const row = db.prepare("SELECT * FROM branches WHERE id = ?").get(next_id) as any;
  res.status(201).json({ id: row.id, name: row.name, active: row.active === 1 });
});

router.put("/settings/branches/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const { name, active } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  db.prepare("UPDATE branches SET name = ?, active = ? WHERE id = ?").run(name.trim(), active ? 1 : 0, id);
  const row = db.prepare("SELECT * FROM branches WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Filial não encontrada" }); return; }
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "branch_updated", entity: "branch", entityId: id, detail: `Filial "${name.trim()}" atualizada`, ip });
  res.json({ id: row.id, name: row.name, active: row.active === 1 });
});

router.delete("/settings/branches/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  const row = db.prepare("SELECT name FROM branches WHERE id = ?").get(id) as any;
  db.prepare("DELETE FROM branches WHERE id = ?").run(id);
  if (row) addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "branch_deleted", entity: "branch", entityId: id, detail: `Filial "${row.name}" removida`, ip });
  res.json({ success: true, message: "Filial removida" });
});

// ─── Departments ───────────────────────────────────────────────────────────────
router.get("/settings/departments", (_req, res) => {
  const rows = db.prepare("SELECT * FROM departments ORDER BY name ASC").all() as any[];
  res.json(rows.map(r => ({ id: r.id, name: r.name, active: r.active === 1 })));
});

router.post("/settings/departments", (req, res): void => {
  const { name, active = true } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  const { next_id } = db.prepare("SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM departments").get() as { next_id: number };
  db.prepare("INSERT INTO departments (id, name, active) VALUES (?, ?, ?)").run(next_id, name.trim(), active ? 1 : 0);
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "department_created", entity: "department", entityId: next_id, detail: `Departamento "${name.trim()}" criado`, ip });
  const row = db.prepare("SELECT * FROM departments WHERE id = ?").get(next_id) as any;
  res.status(201).json({ id: row.id, name: row.name, active: row.active === 1 });
});

router.put("/settings/departments/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const { name, active } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  db.prepare("UPDATE departments SET name = ?, active = ? WHERE id = ?").run(name.trim(), active ? 1 : 0, id);
  const row = db.prepare("SELECT * FROM departments WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Departamento não encontrado" }); return; }
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "department_updated", entity: "department", entityId: id, detail: `Departamento "${name.trim()}" atualizado`, ip });
  res.json({ id: row.id, name: row.name, active: row.active === 1 });
});

router.delete("/settings/departments/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  const row = db.prepare("SELECT name FROM departments WHERE id = ?").get(id) as any;
  db.prepare("DELETE FROM departments WHERE id = ?").run(id);
  if (row) addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "department_deleted", entity: "department", entityId: id, detail: `Departamento "${row.name}" removido`, ip });
  res.json({ success: true, message: "Departamento removido" });
});

// ─── Categories ────────────────────────────────────────────────────────────────
router.get("/settings/categories", (_req, res) => {
  const rows = db.prepare("SELECT * FROM categories ORDER BY name ASC").all() as any[];
  res.json(rows.map(r => ({ id: r.id, name: r.name, active: r.active === 1 })));
});

router.post("/settings/categories", (req, res): void => {
  const { name, active = true } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  const { next_id } = db.prepare("SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM categories").get() as { next_id: number };
  db.prepare("INSERT INTO categories (id, name, active) VALUES (?, ?, ?)").run(next_id, name.trim(), active ? 1 : 0);
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "category_created", entity: "category", entityId: next_id, detail: `Categoria "${name.trim()}" criada`, ip });
  const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(next_id) as any;
  res.status(201).json({ id: row.id, name: row.name, active: row.active === 1 });
});

router.put("/settings/categories/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const { name, active } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  db.prepare("UPDATE categories SET name = ?, active = ? WHERE id = ?").run(name.trim(), active ? 1 : 0, id);
  const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Categoria não encontrada" }); return; }
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "category_updated", entity: "category", entityId: id, detail: `Categoria "${name.trim()}" atualizada`, ip });
  res.json({ id: row.id, name: row.name, active: row.active === 1 });
});

router.delete("/settings/categories/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  const row = db.prepare("SELECT name FROM categories WHERE id = ?").get(id) as any;
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  if (row) addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "category_deleted", entity: "category", entityId: id, detail: `Categoria "${row.name}" removida`, ip });
  res.json({ success: true, message: "Categoria removida" });
});

// ─── Auto Messages ─────────────────────────────────────────────────────────────
router.get("/settings/messages", (_req, res) => {
  const rows = db.prepare("SELECT * FROM auto_messages ORDER BY id ASC").all() as any[];
  res.json(rows.map(r => ({ id: r.id, trigger: r.trigger, content: r.content, active: r.active === 1 })));
});

router.post("/settings/messages", (req, res): void => {
  const { trigger, content, active = true } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!trigger || !content?.trim()) { res.status(400).json({ error: "Trigger e conteúdo são obrigatórios" }); return; }
  const result = db.prepare("INSERT INTO auto_messages (trigger, content, active) VALUES (?, ?, ?)").run(trigger, content.trim(), active ? 1 : 0);
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "message_created", entity: "auto_message", entityId: result.lastInsertRowid as number, detail: `Mensagem automática "${trigger}" criada`, ip });
  const row = db.prepare("SELECT * FROM auto_messages WHERE id = ?").get(result.lastInsertRowid) as any;
  res.status(201).json({ id: row.id, trigger: row.trigger, content: row.content, active: row.active === 1 });
});

router.put("/settings/messages/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const { trigger, content, active } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!trigger || !content?.trim()) { res.status(400).json({ error: "Trigger e conteúdo são obrigatórios" }); return; }
  db.prepare("UPDATE auto_messages SET trigger = ?, content = ?, active = ? WHERE id = ?").run(trigger, content.trim(), active ? 1 : 0, id);
  const row = db.prepare("SELECT * FROM auto_messages WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Mensagem não encontrada" }); return; }
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "message_updated", entity: "auto_message", entityId: id, detail: `Mensagem automática "${trigger}" atualizada`, ip });
  res.json({ id: row.id, trigger: row.trigger, content: row.content, active: row.active === 1 });
});

router.delete("/settings/messages/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  const row = db.prepare("SELECT trigger FROM auto_messages WHERE id = ?").get(id) as any;
  db.prepare("DELETE FROM auto_messages WHERE id = ?").run(id);
  if (row) addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "message_deleted", entity: "auto_message", entityId: id, detail: `Mensagem automática "${row.trigger}" removida`, ip });
  res.json({ success: true, message: "Mensagem removida" });
});

// ─── System Config (key-value) ─────────────────────────────────────────────────
const SYSTEM_CONFIG_KEYS = [
  "company_name","system_title","bot_name","ticket_prefix",
  "sla_hours","inactivity_minutes","inactivity_warn_minutes",
  "invalid_option_msg","ask_name_msg","ask_name_retry_msg",
  "ask_description_retry_msg","returning_client_msg","analyst_greeting_template",
  "business_hours_enabled","business_hours_start","business_hours_end",
  "business_days","outside_hours_msg",
  "client_label","clients_label",
];

router.get("/settings/system-config", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key != 'ticket_counter' AND key != 'seed_version'").all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  rows.forEach(r => { result[r.key] = r.value; });
  res.json(result);
});

router.put("/settings/system-config/:key", (req, res): void => {
  const { key } = req.params;
  const { value } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  if (!SYSTEM_CONFIG_KEYS.includes(key)) {
    res.status(400).json({ error: "Chave de configuração inválida" }); return;
  }
  if (value === undefined || value === null) {
    res.status(400).json({ error: "Valor é obrigatório" }); return;
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "system_config_updated", entity: "settings", detail: `Config "${key}" atualizada`, ip });
  res.json({ key, value: String(value) });
});

router.post("/settings/system-config/batch", (req, res): void => {
  const { updates } = req.body as { updates: Record<string, string> };
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "updates deve ser um objeto" }); return;
  }

  const invalid = Object.keys(updates).filter(k => !SYSTEM_CONFIG_KEYS.includes(k));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Chaves inválidas: ${invalid.join(", ")}` }); return;
  }

  for (const [key, value] of Object.entries(updates)) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
  }
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "system_config_batch_updated", entity: "settings", detail: `${Object.keys(updates).length} configurações atualizadas`, ip });
  res.json({ success: true, updated: Object.keys(updates).length });
});

export default router;
