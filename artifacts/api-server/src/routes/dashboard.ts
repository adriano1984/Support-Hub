import { Router } from "express";
import { db, getSetting } from "../lib/database";

const router = Router();

router.get("/dashboard/stats", (req, res) => {
  const { period, branchId, departmentId, categoryId, assigneeId, status: statusFilter } = req.query;

  let dateFilter = "";
  if (period === "7d") dateFilter = "AND t.created_at >= datetime('now', '-7 days')";
  else if (period === "30d") dateFilter = "AND t.created_at >= datetime('now', '-30 days')";
  else if (period === "90d") dateFilter = "AND t.created_at >= datetime('now', '-90 days')";
  else if (period === "1y") dateFilter = "AND t.created_at >= datetime('now', '-1 year')";

  let extraFilter = "";
  if (branchId) extraFilter += ` AND t.branch_id = ${parseInt(branchId as string)}`;
  if (departmentId) extraFilter += ` AND t.department_id = ${parseInt(departmentId as string)}`;
  if (categoryId) extraFilter += ` AND t.category_id = ${parseInt(categoryId as string)}`;
  if (assigneeId) extraFilter += ` AND t.assigned_to = ${parseInt(assigneeId as string)}`;
  if (statusFilter) extraFilter += ` AND t.status = '${(statusFilter as string).replace(/'/g, "''")}'`;

  const baseWhere = `WHERE 1=1 ${dateFilter} ${extraFilter}`;

  const statusCounts = db.prepare(`SELECT status, COUNT(*) as count FROM tickets t ${baseWhere} GROUP BY status`).all() as Array<{ status: string; count: number }>;
  const counts: Record<string, number> = {};
  statusCounts.forEach(r => { counts[r.status] = r.count; });

  const todayCount = (db.prepare("SELECT COUNT(*) as c FROM tickets WHERE date(created_at) = date('now')").get() as { c: number }).c;
  const totalAll = (db.prepare(`SELECT COUNT(*) as c FROM tickets t ${baseWhere}`).get() as { c: number }).c;

  const closedToday = (db.prepare(
    "SELECT COUNT(*) as c FROM tickets WHERE status IN ('resolved','closed') AND date(updated_at) = date('now')"
  ).get() as { c: number }).c;

  const waitingClient = (db.prepare(
    `SELECT COUNT(*) as c FROM tickets t ${baseWhere} AND t.status = 'resolved'`
  ).get() as { c: number }).c;

  const avgResRow = db.prepare(`
    SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24) as avg
    FROM tickets t ${baseWhere} AND t.status IN ('resolved','closed')
  `).get() as { avg: number | null };

  const avgFirstRow = db.prepare(`
    SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 24) as avg
    FROM tickets t ${baseWhere} AND t.first_response_at IS NOT NULL
  `).get() as { avg: number | null };

  const reopenedRow = db.prepare(`SELECT COUNT(*) as c FROM tickets t ${baseWhere} AND t.reopen_count > 0`).get() as { c: number };
  const transfersRow = db.prepare(`SELECT COUNT(*) as c FROM activity_log WHERE action = 'assigned' AND detail LIKE '%atribuído a%'`).get() as { c: number };

  // SLA: consider SLA breached if ticket is open/in_progress for > sla_hours (configurable)
  const slaHours = parseInt(getSetting("sla_hours", "48"));
  const slaTotal = (db.prepare(`SELECT COUNT(*) as c FROM tickets t ${baseWhere}`).get() as { c: number }).c;
  const slaBreached = (db.prepare(`
    SELECT COUNT(*) as c FROM tickets t ${baseWhere}
    AND t.status IN ('open','in_progress')
    AND (julianday('now') - julianday(t.created_at)) * 24 > ${slaHours}
  `).get() as { c: number }).c;
  const slaMet = slaTotal - slaBreached;
  const slaPercent = slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : 100;

  const byBranch = db.prepare(`SELECT b.name as label, COUNT(t.id) as count FROM branches b LEFT JOIN tickets t ON t.branch_id = b.id AND 1=1 ${dateFilter} ${extraFilter.replace(/t\./g,'t.')} GROUP BY b.id ORDER BY count DESC`).all() as Array<{ label: string; count: number }>;
  const byDepartment = db.prepare(`SELECT d.name as label, COUNT(t.id) as count FROM departments d LEFT JOIN tickets t ON t.department_id = d.id AND 1=1 ${dateFilter} ${extraFilter.replace(/t\./g,'t.')} GROUP BY d.id ORDER BY count DESC`).all() as Array<{ label: string; count: number }>;
  const byCategory = db.prepare(`SELECT c.name as label, COUNT(t.id) as count FROM categories c LEFT JOIN tickets t ON t.category_id = c.id AND 1=1 ${dateFilter} ${extraFilter.replace(/t\./g,'t.')} GROUP BY c.id ORDER BY count DESC`).all() as Array<{ label: string; count: number }>;
  const byClient = db.prepare(`SELECT client_name as label, COUNT(*) as count FROM tickets t ${baseWhere} AND t.client_name IS NOT NULL AND t.client_name != '' GROUP BY t.client_name ORDER BY count DESC LIMIT 10`).all() as Array<{ label: string; count: number }>;
  const byRequester = db.prepare(`SELECT client_name as label, COUNT(*) as count FROM tickets t ${baseWhere} AND t.client_name IS NOT NULL AND t.client_name != '' GROUP BY t.client_name ORDER BY count DESC LIMIT 10`).all() as Array<{ label: string; count: number }>;
  const byAssignee = db.prepare(`SELECT assignee_name as label, COUNT(*) as count FROM tickets t ${baseWhere} AND t.assignee_name IS NOT NULL GROUP BY t.assignee_name ORDER BY count DESC`).all() as Array<{ label: string; count: number }>;
  const byStatus = db.prepare(`SELECT status as label, COUNT(*) as count FROM tickets t ${baseWhere} GROUP BY t.status`).all() as Array<{ label: string; count: number }>;

  const last30days = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM tickets WHERE created_at >= date('now', '-30 days') GROUP BY day ORDER BY day`).all() as Array<{ day: string; count: number }>;
  const last7days = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM tickets WHERE created_at >= date('now', '-7 days') GROUP BY day ORDER BY day`).all() as Array<{ day: string; count: number }>;

  const openByBranch = db.prepare(`SELECT b.name as label, COUNT(t.id) as count FROM branches b LEFT JOIN tickets t ON t.branch_id = b.id AND t.status IN ('open','in_progress') GROUP BY b.id ORDER BY count DESC`).all() as Array<{ label: string; count: number }>;

  const assigneeAvgResponse = db.prepare(`
    SELECT assignee_name as label,
           AVG((julianday(first_response_at) - julianday(created_at)) * 60) as avgMinutes,
           COUNT(*) as totalTickets,
           SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved
    FROM tickets t ${baseWhere} AND t.assignee_name IS NOT NULL AND t.first_response_at IS NOT NULL
    GROUP BY t.assignee_name ORDER BY avgMinutes ASC LIMIT 10
  `).all() as Array<{ label: string; avgMinutes: number; totalTickets: number; resolved: number }>;

  // Ranking analistas por resolucao
  const analystRanking = db.prepare(`
    SELECT assignee_name as label,
           COUNT(*) as totalTickets,
           SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved,
           AVG(CASE WHEN status IN ('resolved','closed') THEN (julianday(updated_at) - julianday(created_at)) * 24 ELSE NULL END) as avgResolutionHours,
           AVG(CASE WHEN first_response_at IS NOT NULL THEN (julianday(first_response_at) - julianday(created_at)) * 60 ELSE NULL END) as avgResponseMinutes
    FROM tickets t ${baseWhere} AND t.assignee_name IS NOT NULL
    GROUP BY t.assignee_name ORDER BY resolved DESC LIMIT 10
  `).all() as Array<{ label: string; totalTickets: number; resolved: number; avgResolutionHours: number | null; avgResponseMinutes: number | null }>;

  // Heatmap: dia da semana x hora
  const heatmap = db.prepare(`
    SELECT
      CAST(strftime('%w', created_at) AS INTEGER) as dow,
      CAST(strftime('%H', created_at) AS INTEGER) as hour,
      COUNT(*) as count
    FROM tickets
    GROUP BY dow, hour
    ORDER BY dow, hour
  `).all() as Array<{ dow: number; hour: number; count: number }>;

  const statusByBranch = db.prepare(`
    SELECT b.name as branch, t.status, COUNT(*) as count
    FROM tickets t JOIN branches b ON t.branch_id = b.id
    GROUP BY b.id, t.status ORDER BY b.name, t.status
  `).all() as Array<{ branch: string; status: string; count: number }>;

  res.json({
    totalOpen: counts["open"] ?? 0,
    totalInProgress: counts["in_progress"] ?? 0,
    totalResolved: counts["resolved"] ?? 0,
    totalClosed: counts["closed"] ?? 0,
    totalToday: todayCount,
    totalAll,
    closedToday,
    waitingClient,
    avgResolutionHours: avgResRow.avg ?? null,
    avgFirstResponseHours: avgFirstRow.avg ?? null,
    totalReopened: reopenedRow.c,
    totalTransfers: transfersRow.c,
    slaPercent,
    slaBreached,
    slaMet,
    byBranch, byDepartment, byCategory, byClient, byRequester,
    byAssignee, byStatus, assigneeAvgResponse, analystRanking,
    last30days, last7days, openByBranch, heatmap, statusByBranch,
  });
});

router.get("/dashboard/alerts", (_req, res) => {
  const slaH = parseInt(getSetting("sla_hours", "48"));
  const nearSlaH = Math.round(slaH * 0.75); // "próximo" = 75% do SLA

  const slaBreached = db.prepare(`
    SELECT t.id, t.ticket_number, t.client_name, t.status, t.created_at, t.updated_at,
           b.name as branch_name, assignee_name,
           ROUND((julianday('now') - julianday(t.created_at)) * 24, 1) as hours_open
    FROM tickets t LEFT JOIN branches b ON t.branch_id = b.id
    WHERE t.status IN ('open','in_progress')
    AND (julianday('now') - julianday(t.created_at)) * 24 > ${slaH}
    ORDER BY hours_open DESC LIMIT 20
  `).all() as any[];

  const nearSla = db.prepare(`
    SELECT t.id, t.ticket_number, t.client_name, t.status, t.created_at,
           b.name as branch_name, assignee_name,
           ROUND((julianday('now') - julianday(t.created_at)) * 24, 1) as hours_open
    FROM tickets t LEFT JOIN branches b ON t.branch_id = b.id
    WHERE t.status IN ('open','in_progress')
    AND (julianday('now') - julianday(t.created_at)) * 24 BETWEEN ${nearSlaH} AND ${slaH}
    ORDER BY hours_open DESC LIMIT 20
  `).all() as any[];

  const unassigned = db.prepare(`
    SELECT t.id, t.ticket_number, t.client_name, t.status, t.created_at,
           b.name as branch_name,
           ROUND((julianday('now') - julianday(t.created_at)) * 24, 1) as hours_open
    FROM tickets t LEFT JOIN branches b ON t.branch_id = b.id
    WHERE t.status IN ('open','in_progress') AND (t.assigned_to IS NULL OR t.assigned_to = 0)
    ORDER BY t.created_at ASC LIMIT 20
  `).all() as any[];

  const waitingClient = db.prepare(`
    SELECT t.id, t.ticket_number, t.client_name, t.status, t.created_at, t.updated_at,
           b.name as branch_name, assignee_name,
           ROUND((julianday('now') - julianday(t.updated_at)) * 24, 1) as hours_waiting
    FROM tickets t LEFT JOIN branches b ON t.branch_id = b.id
    WHERE t.status = 'resolved'
    ORDER BY hours_waiting DESC LIMIT 20
  `).all() as any[];

  const resolvedToday = db.prepare(`
    SELECT t.id, t.ticket_number, t.client_name, t.status, t.updated_at,
           b.name as branch_name, assignee_name
    FROM tickets t LEFT JOIN branches b ON t.branch_id = b.id
    WHERE t.status IN ('resolved','closed') AND date(t.updated_at) = date('now')
    ORDER BY t.updated_at DESC LIMIT 20
  `).all() as any[];

  res.json({
    slaBreached: slaBreached.map(t => ({ ...t, ticketNumber: t.ticket_number, clientName: t.client_name, branchName: t.branch_name, assigneeName: t.assignee_name, hoursOpen: t.hours_open })),
    nearSla: nearSla.map(t => ({ ...t, ticketNumber: t.ticket_number, clientName: t.client_name, branchName: t.branch_name, assigneeName: t.assignee_name, hoursOpen: t.hours_open })),
    unassigned: unassigned.map(t => ({ ...t, ticketNumber: t.ticket_number, clientName: t.client_name, branchName: t.branch_name, hoursOpen: t.hours_open })),
    waitingClient: waitingClient.map(t => ({ ...t, ticketNumber: t.ticket_number, clientName: t.client_name, branchName: t.branch_name, assigneeName: t.assignee_name, hoursWaiting: t.hours_waiting })),
    resolvedToday: resolvedToday.map(t => ({ ...t, ticketNumber: t.ticket_number, clientName: t.client_name, branchName: t.branch_name, assigneeName: t.assignee_name })),
  });
});

// ─── Monthly breakdown for AGM presentation ──────────────────────────────────
router.get("/dashboard/monthly", (req, res) => {
  const { branchId, departmentId, categoryId } = req.query;

  // Date range: months (1–60, default 24) ending at endDate (YYYY-MM, default now)
  const months = Math.min(Math.max(parseInt((req.query.months as string) || "24"), 1), 60);
  const rawEnd = (req.query.endDate as string) || new Date().toISOString().slice(0, 7);
  const [eY, eM] = rawEnd.split("-").map(Number);
  const toD = new Date(eY, eM, 1);           // first day of month AFTER endDate (exclusive upper)
  const fromD = new Date(eY, eM - 1 - months, 1); // first day of first included month
  const fromDateStr = `${fromD.getFullYear()}-${String(fromD.getMonth() + 1).padStart(2, "0")}-01`;
  const toDateStr   = `${toD.getFullYear()}-${String(toD.getMonth() + 1).padStart(2, "0")}-01`;
  const subMonths = Math.min(months, 12);
  const subFromD = new Date(eY, eM - 1 - subMonths, 1);
  const subFromStr = `${subFromD.getFullYear()}-${String(subFromD.getMonth() + 1).padStart(2, "0")}-01`;
  const refYear = eY; // reference year for YoY comparison

  let extraFilter = "";
  if (branchId) extraFilter += ` AND t.branch_id = ${parseInt(branchId as string)}`;
  if (departmentId) extraFilter += ` AND t.department_id = ${parseInt(departmentId as string)}`;
  if (categoryId) extraFilter += ` AND t.category_id = ${parseInt(categoryId as string)}`;

  // Month-by-month totals
  const monthly = db.prepare(`
    SELECT
      strftime('%Y-%m', t.created_at) as month,
      COUNT(*) as total_opened,
      SUM(CASE WHEN t.status = 'closed' THEN 1 ELSE 0 END) as total_closed,
      SUM(CASE WHEN t.status IN ('open','in_progress') THEN 1 ELSE 0 END) as total_active,
      SUM(CASE WHEN t.reopen_count > 0 THEN 1 ELSE 0 END) as total_reopened,
      ROUND(AVG(CASE WHEN t.status = 'closed'
        THEN (julianday(t.updated_at) - julianday(t.created_at)) * 24
        ELSE NULL END), 1) as avg_resolution_hours,
      ROUND(AVG(CASE WHEN t.first_response_at IS NOT NULL
        THEN (julianday(t.first_response_at) - julianday(t.created_at)) * 60
        ELSE NULL END), 0) as avg_first_response_min,
      SUM(CASE WHEN t.status IN ('open','in_progress')
        AND (julianday('now') - julianday(t.created_at)) * 24 > 48 THEN 1 ELSE 0 END) as sla_breached,
      COUNT(*) - SUM(CASE WHEN t.status IN ('open','in_progress')
        AND (julianday('now') - julianday(t.created_at)) * 24 > 48 THEN 1 ELSE 0 END) as sla_met,
      ROUND(CAST(COUNT(*) - SUM(CASE WHEN t.status IN ('open','in_progress')
        AND (julianday('now') - julianday(t.created_at)) * 24 > 48 THEN 1 ELSE 0 END) AS REAL) * 100 / COUNT(*), 1) as sla_percent
    FROM tickets t
    WHERE t.created_at >= '${fromDateStr}' AND t.created_at < '${toDateStr}' ${extraFilter}
    GROUP BY month
    ORDER BY month ASC
  `).all() as Array<{
    month: string;
    total_opened: number;
    total_closed: number;
    total_active: number;
    total_reopened: number;
    avg_resolution_hours: number | null;
    avg_first_response_min: number | null;
    sla_breached: number;
    sla_met: number;
    sla_percent: number;
  }>;

  // Monthly by branch (within selected period)
  const monthlyByBranch = db.prepare(`
    SELECT
      strftime('%Y-%m', t.created_at) as month,
      COALESCE(b.name, 'Sem Filial') as branch,
      COUNT(*) as count
    FROM tickets t
    LEFT JOIN branches b ON t.branch_id = b.id
    WHERE t.created_at >= '${subFromStr}' AND t.created_at < '${toDateStr}' ${extraFilter}
    GROUP BY month, b.id
    ORDER BY month ASC, count DESC
  `).all() as Array<{ month: string; branch: string; count: number }>;

  // Monthly by category (within selected period)
  const monthlyByCategory = db.prepare(`
    SELECT
      strftime('%Y-%m', t.created_at) as month,
      COALESCE(c.name, 'Sem Categoria') as category,
      COUNT(*) as count
    FROM tickets t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.created_at >= '${subFromStr}' AND t.created_at < '${toDateStr}' ${extraFilter}
    GROUP BY month, c.id
    ORDER BY month ASC, count DESC
  `).all() as Array<{ month: string; category: string; count: number }>;

  // Monthly by analyst (within selected period)
  const monthlyByAnalyst = db.prepare(`
    SELECT
      strftime('%Y-%m', t.created_at) as month,
      COALESCE(t.assignee_name, 'Não atribuído') as analyst,
      COUNT(*) as count,
      SUM(CASE WHEN t.status = 'closed' THEN 1 ELSE 0 END) as closed
    FROM tickets t
    WHERE t.created_at >= '${subFromStr}' AND t.created_at < '${toDateStr}' ${extraFilter}
    GROUP BY month, t.assignee_name
    ORDER BY month ASC, count DESC
  `).all() as Array<{ month: string; analyst: string; count: number; closed: number }>;

  // Top categories (within selected period)
  const topCategories = db.prepare(`
    SELECT COALESCE(c.name,'Sem Categoria') as label, COUNT(*) as count
    FROM tickets t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.created_at >= '${fromDateStr}' AND t.created_at < '${toDateStr}' ${extraFilter}
    GROUP BY c.id ORDER BY count DESC LIMIT 5
  `).all() as Array<{ label: string; count: number }>;

  // Top branches (within selected period)
  const topBranches = db.prepare(`
    SELECT COALESCE(b.name,'Sem Filial') as label, COUNT(*) as count
    FROM tickets t LEFT JOIN branches b ON t.branch_id = b.id
    WHERE t.created_at >= '${fromDateStr}' AND t.created_at < '${toDateStr}' ${extraFilter}
    GROUP BY b.id ORDER BY count DESC LIMIT 5
  `).all() as Array<{ label: string; count: number }>;

  // Year-over-year: reference year vs previous year (based on endDate)
  const currentYear = refYear;
  const yoyCurrent = (db.prepare(
    `SELECT COUNT(*) as c FROM tickets t WHERE strftime('%Y', t.created_at) = ? ${extraFilter}`
  ).get(String(currentYear)) as { c: number }).c;
  const yoyPrev = (db.prepare(
    `SELECT COUNT(*) as c FROM tickets t WHERE strftime('%Y', t.created_at) = ? ${extraFilter}`
  ).get(String(currentYear - 1)) as { c: number }).c;

  res.json({
    monthly,
    monthlyByBranch,
    monthlyByCategory,
    monthlyByAnalyst,
    topCategories,
    topBranches,
    yoyCurrent,
    yoyPrev,
    currentYear,
  });
});

router.get("/dashboard/recent", (_req, res) => {
  const activity = db.prepare(
    `SELECT al.id, al.ticket_id, al.action, al.detail, al.created_at,
            t.ticket_number, t.client_name, t.whatsapp_phone, t.status
     FROM activity_log al
     JOIN tickets t ON al.ticket_id = t.id
     ORDER BY al.created_at DESC LIMIT 30`
  ).all() as any[];

  res.json(activity.map(a => ({
    id: a.id, ticketId: a.ticket_id, ticketNumber: a.ticket_number,
    clientName: a.client_name ?? null, whatsappPhone: a.whatsapp_phone,
    action: a.action, detail: a.detail ?? null, status: a.status, createdAt: a.created_at,
  })));
});

router.get("/dashboard/export", (_req, res) => {
  const tickets = db.prepare(`
    SELECT t.ticket_number, t.client_name, t.whatsapp_phone,
           b.name as branch, d.name as department, c.name as category,
           t.description, t.status, t.assignee_name,
           t.reopen_count, t.first_response_at, t.created_at, t.updated_at
    FROM tickets t
    LEFT JOIN branches b ON t.branch_id = b.id
    LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN categories c ON t.category_id = c.id
    ORDER BY t.created_at DESC
  `).all() as any[];

  res.json(tickets);
});

export default router;
