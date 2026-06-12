import { Router } from "express";
import { db } from "../lib/database";
import { parseAuthHeader } from "../lib/auth";

const router = Router();

db.exec(`
  CREATE TABLE IF NOT EXISTS stock_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// GET /api/stock
router.get("/stock", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });
  const products = db.prepare(
    "SELECT * FROM stock_products ORDER BY name ASC"
  ).all();
  res.json(products);
});

// POST /api/stock
router.post("/stock", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });
  const { name, quantity } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Nome é obrigatório" });
  const qty = Math.max(0, parseInt(quantity ?? "0") || 0);
  try {
    const r = db.prepare(
      "INSERT INTO stock_products (name, quantity) VALUES (?, ?)"
    ).run(name.trim(), qty);
    if (qty > 0) {
      db.prepare(
        "INSERT INTO stock_movements (product_id, product_name, type, quantity, notes) VALUES (?, ?, 'entrada', ?, 'Estoque inicial')"
      ).run(r.lastInsertRowid, name.trim(), qty);
    }
    const product = db.prepare("SELECT * FROM stock_products WHERE id = ?").get(r.lastInsertRowid);
    res.status(201).json(product);
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE")) return res.status(409).json({ error: "Produto já existe" });
    throw e;
  }
});

// PUT /api/stock/:id
router.put("/stock/:id", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });
  const id = parseInt(req.params.id);
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Nome é obrigatório" });
  const existing = db.prepare("SELECT * FROM stock_products WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Produto não encontrado" });
  db.prepare("UPDATE stock_products SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name.trim(), id);
  // Update product_name in movements
  db.prepare("UPDATE stock_movements SET product_name = ? WHERE product_id = ?")
    .run(name.trim(), id);
  const updated = db.prepare("SELECT * FROM stock_products WHERE id = ?").get(id);
  res.json(updated);
});

// DELETE /api/stock/:id
router.delete("/stock/:id", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });
  const id = parseInt(req.params.id);
  db.prepare("DELETE FROM stock_movements WHERE product_id = ?").run(id);
  db.prepare("DELETE FROM stock_products WHERE id = ?").run(id);
  res.status(204).end();
});

// POST /api/stock/:id/entrada
router.post("/stock/:id/entrada", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });
  const id = parseInt(req.params.id);
  const { quantity, notes } = req.body;
  const qty = Math.max(1, parseInt(quantity ?? "1") || 1);
  const product = db.prepare("SELECT * FROM stock_products WHERE id = ?").get(id) as any;
  if (!product) return res.status(404).json({ error: "Produto não encontrado" });
  db.prepare("INSERT INTO stock_movements (product_id, product_name, type, quantity, notes) VALUES (?, ?, 'entrada', ?, ?)")
    .run(id, product.name, qty, notes ?? null);
  db.prepare("UPDATE stock_products SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?")
    .run(qty, id);
  const updated = db.prepare("SELECT * FROM stock_products WHERE id = ?").get(id);
  res.json(updated);
});

// POST /api/stock/:id/saida
router.post("/stock/:id/saida", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });
  const id = parseInt(req.params.id);
  const { quantity, notes } = req.body;
  const qty = Math.max(1, parseInt(quantity ?? "1") || 1);
  const product = db.prepare("SELECT * FROM stock_products WHERE id = ?").get(id) as any;
  if (!product) return res.status(404).json({ error: "Produto não encontrado" });
  if (product.quantity < qty) return res.status(400).json({ error: "Quantidade insuficiente em estoque" });
  db.prepare("INSERT INTO stock_movements (product_id, product_name, type, quantity, notes) VALUES (?, ?, 'saida', ?, ?)")
    .run(id, product.name, qty, notes ?? null);
  db.prepare("UPDATE stock_products SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?")
    .run(qty, id);
  const updated = db.prepare("SELECT * FROM stock_products WHERE id = ?").get(id);
  res.json(updated);
});

// GET /api/stock/movements?type=entrada|saida
router.get("/stock/movements", (req, res) => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Não autorizado" });
  const { type } = req.query;
  let sql = "SELECT * FROM stock_movements";
  const params: any[] = [];
  if (type === "entrada" || type === "saida") {
    sql += " WHERE type = ?";
    params.push(type);
  }
  sql += " ORDER BY created_at DESC LIMIT 500";
  const movements = db.prepare(sql).all(...params);
  res.json(movements);
});

export default router;
