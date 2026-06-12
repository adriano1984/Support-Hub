import { Router } from "express";
import { db } from "../lib/database";
import { parseAuthHeader } from "../lib/auth";
import { addAuditLog } from "../lib/database";

const router = Router();

function mapRole(r: any) {
  let perms = {};
  try { perms = JSON.parse(r.permissions); } catch { /* ignore */ }
  return {
    id: r.id,
    name: r.name,
    label: r.label,
    permissions: perms,
    isSystem: r.is_system === 1,
    createdAt: r.created_at,
  };
}

router.get("/roles", (_req, res) => {
  const rows = db.prepare("SELECT * FROM roles_config ORDER BY id ASC").all() as any[];
  res.json(rows.map(mapRole));
});

router.get("/roles/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const row = db.prepare("SELECT * FROM roles_config WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Papel não encontrado" }); return; }
  res.json(mapRole(row));
});

router.post("/roles", (req, res): void => {
  const { name, label, permissions } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  if (!name?.trim() || !label?.trim()) {
    res.status(400).json({ error: "Nome e label são obrigatórios" }); return;
  }
  const exists = db.prepare("SELECT id FROM roles_config WHERE name = ?").get(name.trim()) as any;
  if (exists) { res.status(409).json({ error: "Já existe um papel com esse nome" }); return; }
  const result = db.prepare(
    "INSERT INTO roles_config (name, label, permissions, is_system) VALUES (?, ?, ?, 0)"
  ).run(name.trim(), label.trim(), JSON.stringify(permissions ?? {}));
  const row = db.prepare("SELECT * FROM roles_config WHERE id = ?").get(result.lastInsertRowid) as any;
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "role_created", entity: "roles_config", entityId: Number(result.lastInsertRowid), detail: `Papel "${label}" criado` });
  res.status(201).json(mapRole(row));
});

router.put("/roles/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const { label, permissions } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const row = db.prepare("SELECT * FROM roles_config WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Papel não encontrado" }); return; }
  if (!label?.trim()) { res.status(400).json({ error: "Label é obrigatório" }); return; }
  db.prepare("UPDATE roles_config SET label = ?, permissions = ? WHERE id = ?")
    .run(label.trim(), JSON.stringify(permissions ?? {}), id);
  const updated = db.prepare("SELECT * FROM roles_config WHERE id = ?").get(id) as any;
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "role_updated", entity: "roles_config", entityId: id, detail: `Papel "${label}" atualizado` });
  res.json(mapRole(updated));
});

router.delete("/roles/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const actor = parseAuthHeader(req.headers.authorization);
  const row = db.prepare("SELECT * FROM roles_config WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Papel não encontrado" }); return; }
  if (row.is_system === 1) { res.status(403).json({ error: "Papéis do sistema não podem ser excluídos" }); return; }
  db.prepare("DELETE FROM roles_config WHERE id = ?").run(id);
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "role_deleted", entity: "roles_config", entityId: id, detail: `Papel "${row.label}" excluído` });
  res.json({ success: true });
});

export default router;
