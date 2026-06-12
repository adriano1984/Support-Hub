import { Router } from "express";
import { db } from "../lib/database";
import { parseAuthHeader } from "../lib/auth";
import { addAuditLog } from "../lib/database";

const router = Router();

function mapCanned(r: any) {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    content: r.content,
    active: r.active === 1,
    createdAt: r.created_at,
  };
}

router.get("/canned-responses", (req, res) => {
  const { category, q } = req.query as Record<string, string>;
  let sql = "SELECT * FROM canned_responses WHERE 1=1";
  const params: any[] = [];
  if (category) { sql += " AND category = ?"; params.push(category); }
  if (q) { sql += " AND (title LIKE ? OR content LIKE ?)"; params.push(`%${q}%`, `%${q}%`); }
  sql += " ORDER BY category ASC, title ASC";
  const rows = db.prepare(sql).all(...params) as any[];
  res.json(rows.map(mapCanned));
});

router.get("/canned-responses/categories", (_req, res) => {
  const rows = db.prepare("SELECT DISTINCT category FROM canned_responses ORDER BY category ASC").all() as { category: string }[];
  res.json(rows.map(r => r.category));
});

router.post("/canned-responses", (req, res): void => {
  const { category, title, content } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: "Título e conteúdo são obrigatórios" }); return;
  }
  const result = db.prepare(
    "INSERT INTO canned_responses (category, title, content) VALUES (?, ?, ?)"
  ).run((category || "Geral").trim(), title.trim(), content.trim());
  const row = db.prepare("SELECT * FROM canned_responses WHERE id = ?").get(result.lastInsertRowid) as any;
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "canned_response_created", entity: "canned_responses", entityId: Number(result.lastInsertRowid), detail: `Resposta "${title}" criada` });
  res.status(201).json(mapCanned(row));
});

router.put("/canned-responses/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const { category, title, content, active } = req.body;
  const actor = parseAuthHeader(req.headers.authorization);
  const row = db.prepare("SELECT * FROM canned_responses WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Resposta não encontrada" }); return; }
  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: "Título e conteúdo são obrigatórios" }); return;
  }
  db.prepare("UPDATE canned_responses SET category = ?, title = ?, content = ?, active = ? WHERE id = ?")
    .run((category || "Geral").trim(), title.trim(), content.trim(), active !== false ? 1 : 0, id);
  const updated = db.prepare("SELECT * FROM canned_responses WHERE id = ?").get(id) as any;
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "canned_response_updated", entity: "canned_responses", entityId: id, detail: `Resposta "${title}" atualizada` });
  res.json(mapCanned(updated));
});

router.delete("/canned-responses/:id", (req, res): void => {
  const id = parseInt(req.params.id);
  const actor = parseAuthHeader(req.headers.authorization);
  const row = db.prepare("SELECT * FROM canned_responses WHERE id = ?").get(id) as any;
  if (!row) { res.status(404).json({ error: "Resposta não encontrada" }); return; }
  db.prepare("DELETE FROM canned_responses WHERE id = ?").run(id);
  addAuditLog({ userId: actor?.userId, userName: actor?.name, action: "canned_response_deleted", entity: "canned_responses", entityId: id, detail: `Resposta "${row.title}" excluída` });
  res.json({ success: true });
});

export default router;
