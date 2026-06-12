import { Router } from "express";
import { db } from "../lib/database";
import { parseAuthHeader } from "../lib/auth";

const router = Router();

// Ensure tables exist on first load
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patrimony TEXT,
    category TEXT NOT NULL DEFAULT 'Outros',
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,
    warranty_until TEXT,
    value REAL DEFAULT 0,
    supplier TEXT,
    invoice TEXT,
    status TEXT NOT NULL DEFAULT 'Em Estoque',
    branch_id INTEGER REFERENCES branches(id),
    department_id INTEGER REFERENCES departments(id),
    assigned_user TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    type TEXT NOT NULL,
    from_location TEXT,
    to_location TEXT,
    responsible TEXT,
    notes TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function mapItem(r: any) {
  return {
    id: r.id, patrimony: r.patrimony, category: r.category,
    manufacturer: r.manufacturer, model: r.model, serialNumber: r.serial_number,
    warrantyUntil: r.warranty_until, value: r.value, supplier: r.supplier,
    invoice: r.invoice, status: r.status, branchId: r.branch_id,
    branchName: r.branch_name, departmentId: r.department_id,
    departmentName: r.department_name, assignedUser: r.assigned_user,
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// GET /api/inventory/stats
router.get("/inventory/stats", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });

  const total = (db.prepare("SELECT COUNT(*) as c FROM inventory_items").get() as { c: number }).c;
  const byStatus = db.prepare("SELECT status as label, COUNT(*) as count FROM inventory_items GROUP BY status").all() as any[];
  const byCategory = db.prepare("SELECT category as label, COUNT(*) as count FROM inventory_items GROUP BY category ORDER BY count DESC").all() as any[];
  const byBranch = db.prepare(`
    SELECT b.name as label, COUNT(i.id) as count
    FROM branches b LEFT JOIN inventory_items i ON i.branch_id = b.id
    GROUP BY b.id ORDER BY count DESC
  `).all() as any[];
  const totalValue = (db.prepare("SELECT SUM(value) as v FROM inventory_items").get() as { v: number | null }).v ?? 0;
  const warrantyExpiring = (db.prepare(`
    SELECT COUNT(*) as c FROM inventory_items
    WHERE warranty_until IS NOT NULL AND warranty_until != ''
    AND date(warranty_until) BETWEEN date('now') AND date('now', '+30 days')
  `).get() as { c: number }).c;
  const monthlyIn = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
    FROM inventory_items WHERE created_at >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all() as any[];

  const statusMap: Record<string, number> = {};
  byStatus.forEach((r: any) => { statusMap[r.label] = r.count; });

  res.json({
    total, totalValue, warrantyExpiring,
    available: statusMap["Em Estoque"] ?? 0,
    inUse: statusMap["Em Uso"] ?? 0,
    maintenance: statusMap["Em Manutenção"] ?? 0,
    reserved: statusMap["Reservado"] ?? 0,
    written_off: statusMap["Baixado"] ?? 0,
    byStatus, byCategory, byBranch, monthlyIn,
  });
});

// GET /api/inventory
router.get("/inventory", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });

  const { branchId, departmentId, category, status, search, page = "1", limit = "50" } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  let where = "WHERE 1=1";
  const params: any[] = [];
  if (branchId) { where += " AND i.branch_id = ?"; params.push(parseInt(branchId as string)); }
  if (departmentId) { where += " AND i.department_id = ?"; params.push(parseInt(departmentId as string)); }
  if (category) { where += " AND i.category = ?"; params.push(category); }
  if (status) { where += " AND i.status = ?"; params.push(status); }
  if (search) {
    where += " AND (i.patrimony LIKE ? OR i.model LIKE ? OR i.manufacturer LIKE ? OR i.serial_number LIKE ? OR i.assigned_user LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  const total = (db.prepare(`SELECT COUNT(*) as c FROM inventory_items i ${where}`).get(...params) as { c: number }).c;
  const items = db.prepare(`
    SELECT i.*, b.name as branch_name, d.name as department_name
    FROM inventory_items i
    LEFT JOIN branches b ON i.branch_id = b.id
    LEFT JOIN departments d ON i.department_id = d.id
    ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit as string), offset) as any[];

  res.json({ items: items.map(mapItem), total, page: parseInt(page as string), limit: parseInt(limit as string) });
});

// GET /api/inventory/:id
router.get("/inventory/:id", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });

  const item = db.prepare(`
    SELECT i.*, b.name as branch_name, d.name as department_name
    FROM inventory_items i
    LEFT JOIN branches b ON i.branch_id = b.id
    LEFT JOIN departments d ON i.department_id = d.id
    WHERE i.id = ?
  `).get(parseInt(req.params.id)) as any;
  if (!item) return res.status(404).json({ error: "Item não encontrado" });

  const movements = db.prepare(
    "SELECT * FROM inventory_movements WHERE item_id = ? ORDER BY created_at DESC"
  ).all(item.id) as any[];

  res.json({ ...mapItem(item), movements });
});

// POST /api/inventory
router.post("/inventory", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });

  const { patrimony, category, manufacturer, model, serialNumber, warrantyUntil,
    value, supplier, invoice, status, branchId, departmentId, assignedUser, notes } = req.body;

  if (!category) return res.status(400).json({ error: "Categoria obrigatória" });

  const r = db.prepare(`
    INSERT INTO inventory_items
      (patrimony, category, manufacturer, model, serial_number, warranty_until,
       value, supplier, invoice, status, branch_id, department_id, assigned_user, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patrimony ?? null, category, manufacturer ?? null, model ?? null,
    serialNumber ?? null, warrantyUntil ?? null, value ?? 0,
    supplier ?? null, invoice ?? null, status ?? "Em Estoque",
    branchId ?? null, departmentId ?? null, assignedUser ?? null, notes ?? null
  );

  const item = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(r.lastInsertRowid) as any;
  res.status(201).json(mapItem(item));
});

// PUT /api/inventory/:id
router.put("/inventory/:id", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });

  const id = parseInt(req.params.id);
  const existing = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Item não encontrado" });

  const { patrimony, category, manufacturer, model, serialNumber, warrantyUntil,
    value, supplier, invoice, status, branchId, departmentId, assignedUser, notes } = req.body;

  db.prepare(`
    UPDATE inventory_items SET
      patrimony = ?, category = ?, manufacturer = ?, model = ?, serial_number = ?,
      warranty_until = ?, value = ?, supplier = ?, invoice = ?, status = ?,
      branch_id = ?, department_id = ?, assigned_user = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    patrimony ?? existing.patrimony, category ?? existing.category,
    manufacturer ?? existing.manufacturer, model ?? existing.model,
    serialNumber ?? existing.serial_number, warrantyUntil ?? existing.warranty_until,
    value ?? existing.value, supplier ?? existing.supplier, invoice ?? existing.invoice,
    status ?? existing.status, branchId ?? existing.branch_id,
    departmentId ?? existing.department_id, assignedUser ?? existing.assigned_user,
    notes ?? existing.notes, id
  );

  if (status && status !== existing.status) {
    db.prepare(`
      INSERT INTO inventory_movements (item_id, type, from_location, to_location, responsible, notes)
      VALUES (?, 'status_change', ?, ?, ?, ?)
    `).run(id, existing.status, status, user.name, `Status alterado de ${existing.status} para ${status}`);
  }

  const updated = db.prepare(`
    SELECT i.*, b.name as branch_name, d.name as department_name
    FROM inventory_items i LEFT JOIN branches b ON i.branch_id = b.id LEFT JOIN departments d ON i.department_id = d.id
    WHERE i.id = ?
  `).get(id) as any;
  res.json(mapItem(updated));
});

// DELETE /api/inventory/:id
router.delete("/inventory/:id", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });

  const id = parseInt(req.params.id);
  db.prepare("DELETE FROM inventory_movements WHERE item_id = ?").run(id);
  db.prepare("DELETE FROM inventory_items WHERE id = ?").run(id);
  res.status(204).end();
});

// POST /api/inventory/:id/movements
router.post("/inventory/:id/movements", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });

  const id = parseInt(req.params.id);
  const { type, fromLocation, toLocation, responsible, notes, quantity } = req.body;
  if (!type) return res.status(400).json({ error: "Tipo obrigatório" });

  db.prepare(`
    INSERT INTO inventory_movements (item_id, type, from_location, to_location, responsible, notes, quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, fromLocation ?? null, toLocation ?? null,
    responsible ?? user.name, notes ?? null, quantity ?? 1);

  res.status(201).json({ ok: true });
});

export default router;
