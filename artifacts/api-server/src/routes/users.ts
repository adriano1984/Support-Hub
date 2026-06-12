import { Router } from "express";
import { db, addAuditLog } from "../lib/database";
import { hashPassword } from "../lib/crypto";
import { parseAuthHeader } from "../lib/auth";

const router = Router();

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  supervisor: "Supervisor",
  technician: "Técnico",
  attendant: "Atendente",
};

function mapUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role] ?? u.role,
    active: u.active === 1,
    createdAt: u.created_at,
  };
}

router.get("/users", (_req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY name ASC").all() as any[];
  res.json(users.map(mapUser));
});

router.post("/users", (req, res): void => {
  const { name, role, password } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  if (!name?.trim() || !password?.trim()) {
    res.status(400).json({ error: "Nome e senha são obrigatórios" }); return;
  }

  const validRoles = ["admin", "manager", "supervisor", "technician", "attendant"];
  const userRole = validRoles.includes(role) ? role : "attendant";

  const exists = db.prepare("SELECT id FROM users WHERE name = ?").get(name.trim()) as any;
  if (exists) {
    res.status(409).json({ error: "Já existe um usuário com esse nome" }); return;
  }

  const hash = hashPassword(password);
  const result = db.prepare(
    "INSERT INTO users (name, role, password_hash, must_change_password) VALUES (?, ?, ?, 1)"
  ).run(name.trim(), userRole, hash);

  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "user_created", entity: "user", entityId: result.lastInsertRowid as number, detail: `Usuário "${name.trim()}" criado com papel "${ROLE_LABELS[userRole] ?? userRole}"`, ip });

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as any;
  res.status(201).json(mapUser(user));
});

router.put("/users/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const { name, role, password, active } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

  const changes: string[] = [];

  if (name?.trim()) {
    const exists = db.prepare("SELECT id FROM users WHERE name = ? AND id != ?").get(name.trim(), id) as any;
    if (exists) { res.status(409).json({ error: "Já existe um usuário com esse nome" }); return; }
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), id);
    db.prepare("UPDATE tickets SET assignee_name = ? WHERE assigned_to = ?").run(name.trim(), id);
    changes.push(`nome: "${user.name}" → "${name.trim()}"`);
  }

  if (role) {
    const validRoles = ["admin", "manager", "supervisor", "technician", "attendant"];
    if (validRoles.includes(role)) {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
      changes.push(`papel: "${ROLE_LABELS[user.role] ?? user.role}" → "${ROLE_LABELS[role] ?? role}"`);
    }
  }

  if (password?.trim()) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), id);
    changes.push("senha alterada");
  }

  if (active !== undefined) {
    db.prepare("UPDATE users SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
    changes.push(active ? "reativado" : "bloqueado");
  }

  if (changes.length > 0) {
    addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "user_updated", entity: "user", entityId: id, detail: `Usuário "${user.name}" atualizado: ${changes.join("; ")}`, ip });
  }

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  res.json(mapUser(updated));
});

router.delete("/users/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const hard = req.query.hard === "true";
  const actor = parseAuthHeader(req.headers.authorization);
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  if (!actor) { res.status(401).json({ error: "Não autenticado" }); return; }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

  if (actor.userId === id) {
    res.status(400).json({ error: "Não é possível excluir sua própria conta" }); return;
  }

  if (hard) {
    const allowedRoles = ["admin", "manager"];
    if (!allowedRoles.includes(actor.role)) {
      res.status(403).json({ error: "Sem permissão para exclusão permanente" }); return;
    }
    db.prepare("UPDATE tickets SET assigned_to = NULL, assignee_name = NULL WHERE assigned_to = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    addAuditLog({ userId: actor.userId, userName: actor.name, action: "user_deleted", entity: "user", entityId: id, detail: `Usuário "${user.name}" excluído permanentemente`, ip });
  } else {
    db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(id);
    addAuditLog({ userId: actor.userId, userName: actor.name, action: "user_deleted", entity: "user", entityId: id, detail: `Usuário "${user.name}" desativado`, ip });
  }

  res.json({ success: true });
});

export default router;
