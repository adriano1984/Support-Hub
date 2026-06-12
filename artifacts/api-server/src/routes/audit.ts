import { Router } from "express";
import { db } from "../lib/database";

const router = Router();

router.get("/audit", (req, res) => {
  const { limit = "100", offset = "0", user, action, entity } = req.query as Record<string, string>;

  let sql = "SELECT * FROM system_audit WHERE 1=1";
  const params: any[] = [];

  if (user) { sql += " AND user_name LIKE ?"; params.push(`%${user}%`); }
  if (action) { sql += " AND action LIKE ?"; params.push(`%${action}%`); }
  if (entity) { sql += " AND entity = ?"; params.push(entity); }

  const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as total");
  const total = (db.prepare(countSql).get(...params) as { total: number }).total;

  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));

  const rows = db.prepare(sql).all(...params) as any[];

  res.json({
    total,
    rows: rows.map(r => ({
      id: r.id,
      userId: r.user_id ?? null,
      userName: r.user_name ?? null,
      action: r.action,
      entity: r.entity ?? null,
      entityId: r.entity_id ?? null,
      detail: r.detail ?? null,
      ip: r.ip ?? null,
      createdAt: r.created_at,
    })),
  });
});

export default router;
