import { useEffect, useState, useCallback } from "react";
import { API, type DashboardStats, type MonthlyStats } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend,
  AreaChart, Area, ComposedChart,
} from "recharts";
import {
  Ticket, Clock, CheckCircle, XCircle, TrendingUp, Users, AlertTriangle,
  Download, FileSpreadsheet, Presentation, Loader2, RefreshCw, Target,
  ArrowUpRight, ArrowDownRight, Minus, Award, Zap, BarChart2, CalendarDays,
  TrendingDown, Building2, Tag, UserCheck,
} from "lucide-react";

const COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#14b8a6","#f97316","#84cc16"];

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto", in_progress: "Em Atendimento", closed: "Fechado",
};

const STATUS_COLORS: Record<string, string> = {
  open: "#6366f1", in_progress: "#f59e0b", closed: "#94a3b8",
};

const DAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

// ─── Export helpers ───────────────────────────────────────────────────────────
function exportCsv(tickets: any[]) {
  const header = ["Chamado","Colaborador","Telefone","Filial","Departamento","Categoria","Status","Técnico","Descrição","Criado em","Atualizado em"];
  const rows = tickets.map(t => [
    t.ticket_number, t.client_name ?? "", t.whatsapp_phone,
    t.branch ?? "", t.department ?? "", t.category ?? "",
    STATUS_LABELS[t.status] ?? t.status, t.assignee_name ?? "",
    (t.description ?? "").replace(/"/g,"'"), t.created_at, t.updated_at,
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `helpdesk-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function exportPdf(stats: DashboardStats, tickets: any[]) {
  const bar = (items: Array<{ label: string; count: number }>) => {
    const max = Math.max(...items.map(i => i.count), 1);
    return items.map(item =>
      `<div class="bar-row"><span class="bar-label" title="${item.label}">${item.label}</span><div class="bar-bg"><div class="bar-fill" style="width:${Math.round((item.count/max)*100)}%"></div></div><span class="bar-count">${item.count}</span></div>`
    ).join("");
  };
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório Support Hub</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1e1b4b;padding:24px}
h1{font-size:26px;margin-bottom:4px}h2{font-size:15px;color:#6366f1;margin:22px 0 8px;border-bottom:2px solid #e0e7ff;padding-bottom:5px}
.subtitle{color:#64748b;font-size:13px;margin-bottom:20px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.kpi{background:#f0f0ff;border:1px solid #e0e7ff;border-radius:8px;padding:12px;text-align:center}
.kpi-val{font-size:30px;font-weight:700;color:#6366f1}.kpi-lbl{font-size:11px;color:#64748b;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:11px}th{background:#6366f1;color:#fff;padding:6px 7px;text-align:left}
td{padding:5px 7px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f8f8ff}
.bar-row{display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:12px}
.bar-bg{flex:1;background:#e0e7ff;border-radius:3px;height:16px;overflow:hidden}
.bar-fill{height:100%;background:#6366f1;border-radius:3px;min-width:3px}
.bar-count{width:28px;text-align:right;font-weight:600}.bar-label{width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.sla{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;margin-bottom:16px}
.sla-val{font-size:40px;font-weight:700;color:#22c55e}
@media print{.no-print{display:none}@page{margin:1.2cm;size:A4}}</style></head><body>
<div class="no-print" style="margin-bottom:14px">
<button onclick="window.print()" style="background:#6366f1;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Imprimir / Salvar PDF</button>
</div>
<h1>📊 Support Hub — Relatório Executivo</h1>
<p class="subtitle">Gerado em ${new Date().toLocaleString("pt-BR")} | Total de chamados: ${stats.totalAll}</p>
<div class="sla"><div class="sla-val">${(stats as any).slaPercent ?? 0}%</div><div style="font-size:13px;color:#16a34a">SLA Cumprido</div></div>
<div class="grid">
<div class="kpi"><div class="kpi-val">${stats.totalAll}</div><div class="kpi-lbl">Total Geral</div></div>
<div class="kpi"><div class="kpi-val" style="color:#6366f1">${stats.totalOpen}</div><div class="kpi-lbl">Abertos</div></div>
<div class="kpi"><div class="kpi-val" style="color:#f59e0b">${stats.totalInProgress}</div><div class="kpi-lbl">Em Atendimento</div></div>
<div class="kpi"><div class="kpi-val" style="color:#22c55e">${stats.totalResolved}</div><div class="kpi-lbl">Resolvidos</div></div>
<div class="kpi"><div class="kpi-val">${stats.totalClosed}</div><div class="kpi-lbl">Fechados</div></div>
<div class="kpi"><div class="kpi-val">${stats.totalToday}</div><div class="kpi-lbl">Hoje</div></div>
<div class="kpi"><div class="kpi-val">${(stats as any).closedToday ?? 0}</div><div class="kpi-lbl">Encerrados Hoje</div></div>
<div class="kpi"><div class="kpi-val">${stats.avgResolutionHours != null ? stats.avgResolutionHours.toFixed(1)+"h" : "-"}</div><div class="kpi-lbl">TMR</div></div>
</div>
<div class="cols">
<div><h2>Por Filial</h2>${bar(stats.byBranch)}</div>
<div><h2>Por Categoria</h2>${bar(stats.byCategory)}</div>
</div>
<div class="cols">
<div><h2>Por Departamento</h2>${bar(stats.byDepartment)}</div>
${stats.byAssignee?.length ? `<div><h2>Por Analista</h2>${bar(stats.byAssignee)}</div>` : ""}
</div>
${stats.byClient?.length ? `<h2>Top 10 Clientes</h2>${bar(stats.byClient.slice(0,10))}` : ""}
<h2>Chamados Recentes (últimos 50)</h2>
<table><thead><tr><th>Nº</th><th>Cliente</th><th>Filial</th><th>Categoria</th><th>Status</th><th>Analista</th><th>Criado em</th></tr></thead>
<tbody>${tickets.slice(0,50).map(t =>
  `<tr><td>${t.ticket_number}</td><td>${t.client_name ?? "-"}</td><td>${t.branch ?? "-"}</td><td>${t.category ?? "-"}</td><td>${STATUS_LABELS[t.status] ?? t.status}</td><td>${t.assignee_name ?? "-"}</td><td>${new Date(t.created_at).toLocaleDateString("pt-BR")}</td></tr>`
).join("")}</tbody></table>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

async function exportPptx(stats: DashboardStats) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  const today = new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" });
  let sl = pptx.addSlide();
  sl.background = { color: "1e1b4b" };
  sl.addText("📊 Support Hub", { x:0.8, y:1.8, w:8.4, h:1, fontSize:40, bold:true, color:"FFFFFF" });
  sl.addText("Relatório Executivo de Atendimento", { x:0.8, y:3.0, w:8.4, h:0.6, fontSize:22, color:"a5b4fc" });
  sl.addText(today, { x:0.8, y:3.8, w:8.4, h:0.4, fontSize:14, color:"64748b" });
  sl = pptx.addSlide();
  sl.addText("Resumo Executivo", { x:0.5, y:0.3, w:9, h:0.6, fontSize:24, bold:true, color:"1e1b4b" });
  const kpis = [
    { label:"Total", val:String(stats.totalAll), color:"1e1b4b" },
    { label:"Em Atendimento", val:String(stats.totalInProgress), color:"f59e0b" },
    { label:"Resolvidos", val:String(stats.totalResolved), color:"22c55e" },
    { label:"SLA", val:`${(stats as any).slaPercent ?? 0}%`, color:"6366f1" },
  ];
  kpis.forEach((k, i) => {
    const x = 0.4 + i * 2.3;
    sl.addShape((pptx.ShapeType as any).roundRect, { x, y:1.2, w:2.1, h:1.8, fill:{ color:k.color }, line:{ color:k.color } });
    sl.addText(k.val, { x, y:1.4, w:2.1, h:0.9, fontSize:32, bold:true, color:"FFFFFF", align:"center" });
    sl.addText(k.label, { x, y:2.3, w:2.1, h:0.5, fontSize:11, color:"FFFFFF", align:"center" });
  });
  if (stats.byBranch?.length) {
    sl = pptx.addSlide();
    sl.addText("Chamados por Filial", { x:0.5, y:0.3, w:9, h:0.6, fontSize:22, bold:true, color:"1e1b4b" });
    sl.addChart((pptx.ChartType as any).bar, [{ name:"Chamados", labels:stats.byBranch.map(b => b.label.slice(0,22)), values:stats.byBranch.map(b => b.count) }],
      { x:0.5, y:1.1, w:9, h:5.3, chartColors:["6366f1"], showLegend:false } as any);
  }
  if (stats.last30days?.length) {
    sl = pptx.addSlide();
    sl.addText("Tendência — Últimos 30 Dias", { x:0.5, y:0.3, w:9, h:0.6, fontSize:22, bold:true, color:"1e1b4b" });
    sl.addChart((pptx.ChartType as any).line, [{ name:"Chamados", labels:stats.last30days.map(d => d.day.slice(5)), values:stats.last30days.map(d => d.count) }],
      { x:0.5, y:1.1, w:9, h:5.3, chartColors:["6366f1"], showLegend:false } as any);
  }
  await pptx.writeFile({ fileName: `helpdesk-${new Date().toISOString().slice(0,10)}.pptx` });
}

// ─── Month label helper ───────────────────────────────────────────────────────
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function fmtMonth(m: string) {
  const [year, mon] = m.split("-");
  return MONTH_NAMES[parseInt(mon) - 1] + "/" + year.slice(2);
}
function fmtMonthFull(m: string) {
  const [year, mon] = m.split("-");
  const names = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return names[parseInt(mon) - 1] + " de " + year;
}

// ─── Monthly PDF export (AGM) ─────────────────────────────────────────────────
function exportMonthlyPdf(monthly: MonthlyStats, periodLabel?: string) {
  const rows = monthly.monthly.map(r => `
    <tr>
      <td>${fmtMonthFull(r.month)}</td>
      <td class="num">${r.total_opened}</td>
      <td class="num">${r.total_closed}</td>
      <td class="num">${r.total_active}</td>
      <td class="num sla ${r.sla_percent >= 90 ? "ok" : "nok"}">${r.sla_percent}%</td>
      <td class="num">${r.avg_resolution_hours != null ? r.avg_resolution_hours.toFixed(1)+"h" : "—"}</td>
      <td class="num">${r.avg_first_response_min != null ? r.avg_first_response_min+"min" : "—"}</td>
      <td class="num">${r.sla_breached}</td>
      <td class="num">${r.total_reopened}</td>
    </tr>`).join("");

  const yoyDiff = monthly.yoyCurrent - monthly.yoyPrev;
  const yoyPct = monthly.yoyPrev > 0 ? ((yoyDiff / monthly.yoyPrev) * 100).toFixed(1) : "—";

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório AGM — Mês a Mês</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;color:#1e1b4b;padding:24px;font-size:12px}
h1{font-size:24px;margin-bottom:4px;color:#1e1b4b}
h2{font-size:13px;color:#6366f1;margin:20px 0 8px;border-bottom:2px solid #e0e7ff;padding-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
.subtitle{color:#64748b;font-size:11px;margin-bottom:20px}
.yoy{display:flex;gap:16px;margin-bottom:20px}
.yoy-card{background:#f0f0ff;border:1px solid #e0e7ff;border-radius:8px;padding:14px 20px;text-align:center;flex:1}
.yoy-val{font-size:28px;font-weight:700;color:#6366f1}
.yoy-lbl{font-size:10px;color:#64748b;margin-top:2px}
.yoy-diff{font-size:12px;font-weight:600;margin-top:4px}
.green{color:#16a34a}.red{color:#dc2626}
table{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}
th{background:#6366f1;color:#fff;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
td{padding:6px 8px;border-bottom:1px solid #e5e7eb}
td.num{text-align:right;font-family:monospace}
tr:nth-child(even) td{background:#f8f8ff}
td.sla.ok{color:#16a34a;font-weight:700}
td.sla.nok{color:#dc2626;font-weight:700}
.badge{display:inline-block;padding:1px 6px;border-radius:9999px;font-size:9px;font-weight:600}
.badge-green{background:#dcfce7;color:#166534}
.badge-red{background:#fee2e2;color:#991b1b}
@media print{.no-print{display:none}@page{margin:1cm;size:A4 landscape}}
</style></head><body>
<div class="no-print" style="margin-bottom:14px">
<button onclick="window.print()" style="background:#6366f1;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer">🖨️ Imprimir / Salvar PDF</button>
</div>
<h1>📊 Support Hub — Relatório AGM · Mês a Mês</h1>
<p class="subtitle">Gerado em ${new Date().toLocaleString("pt-BR")} · ${periodLabel ?? "Últimos 24 meses"}</p>

<h2>Comparativo Ano a Ano</h2>
<div class="yoy">
  <div class="yoy-card">
    <div class="yoy-val">${monthly.yoyPrev}</div>
    <div class="yoy-lbl">Chamados ${monthly.currentYear - 1}</div>
  </div>
  <div class="yoy-card">
    <div class="yoy-val">${monthly.yoyCurrent}</div>
    <div class="yoy-lbl">Chamados ${monthly.currentYear}</div>
  </div>
  <div class="yoy-card">
    <div class="yoy-val ${yoyDiff >= 0 ? "red" : "green"}">${yoyDiff >= 0 ? "+" : ""}${yoyDiff}</div>
    <div class="yoy-lbl">Variação absoluta</div>
    <div class="yoy-diff ${yoyDiff >= 0 ? "red" : "green"}">${yoyDiff >= 0 ? "+" : ""}${yoyPct}%</div>
  </div>
</div>

<h2>Detalhamento Mensal</h2>
<table>
<thead><tr>
  <th>Mês</th><th>Abertos</th><th>Fechados</th><th>Ativos</th>
  <th>SLA %</th><th>TM Resolução</th><th>1ª Resposta</th><th>SLA Venc.</th><th>Reabertos</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

${monthly.topBranches.length ? `<h2>Top Filiais</h2>
<table><thead><tr><th>Filial</th><th>Total</th></tr></thead><tbody>
${monthly.topBranches.map(b => `<tr><td>${b.label}</td><td class="num">${b.count}</td></tr>`).join("")}
</tbody></table>` : ""}

${monthly.topCategories.length ? `<h2>Top Categorias</h2>
<table><thead><tr><th>Categoria</th><th>Total</th></tr></thead><tbody>
${monthly.topCategories.map(c => `<tr><td>${c.label}</td><td class="num">${c.count}</td></tr>`).join("")}
</tbody></table>` : ""}
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Monthly PPTX export (AGM) ────────────────────────────────────────────────
async function exportMonthlyPptx(monthly: MonthlyStats) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  const today = new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" });

  // Cover
  let sl = pptx.addSlide();
  sl.background = { color: "1e1b4b" };
  sl.addText("📊 Support Hub", { x:0.8, y:1.5, w:8.4, h:1, fontSize:44, bold:true, color:"FFFFFF" });
  sl.addText("Relatório Executivo — Análise Mês a Mês", { x:0.8, y:2.7, w:8.4, h:0.6, fontSize:20, color:"a5b4fc" });
  sl.addText(`AGM ${new Date().getFullYear()} · ${today}`, { x:0.8, y:3.5, w:8.4, h:0.4, fontSize:13, color:"64748b" });

  // YoY slide
  sl = pptx.addSlide();
  sl.addText("Comparativo Ano a Ano", { x:0.5, y:0.3, w:9, h:0.6, fontSize:24, bold:true, color:"1e1b4b" });
  const yoyDiff = monthly.yoyCurrent - monthly.yoyPrev;
  const yoyPct = monthly.yoyPrev > 0 ? ((yoyDiff / monthly.yoyPrev) * 100).toFixed(1) : "0";
  const cards = [
    { label: String(monthly.currentYear - 1), val: String(monthly.yoyPrev), color: "475569" },
    { label: String(monthly.currentYear), val: String(monthly.yoyCurrent), color: "6366f1" },
    { label: "Variação", val: `${yoyDiff >= 0 ? "+" : ""}${yoyDiff} (${yoyPct}%)`, color: yoyDiff > 0 ? "ef4444" : "22c55e" },
  ];
  cards.forEach((c, i) => {
    const x = 0.8 + i * 2.8;
    sl.addShape((pptx.ShapeType as any).roundRect, { x, y:1.3, w:2.4, h:2.0, fill:{ color:c.color } });
    sl.addText(c.val, { x, y:1.5, w:2.4, h:1.0, fontSize:28, bold:true, color:"FFFFFF", align:"center" });
    sl.addText(c.label, { x, y:2.6, w:2.4, h:0.5, fontSize:12, color:"FFFFFF", align:"center" });
  });

  // Monthly overview bar chart
  if (monthly.monthly.length > 0) {
    sl = pptx.addSlide();
    sl.addText("Volume de Chamados — Mês a Mês", { x:0.5, y:0.3, w:9, h:0.6, fontSize:22, bold:true, color:"1e1b4b" });
    const labels = monthly.monthly.map(r => fmtMonth(r.month));
    sl.addChart((pptx.ChartType as any).bar,
      [
        { name:"Abertos", labels, values: monthly.monthly.map(r => r.total_opened) },
        { name:"Fechados", labels, values: monthly.monthly.map(r => r.total_closed) },
      ],
      { x:0.5, y:1.1, w:9, h:5.2, barGrouping:"clustered", chartColors:["6366f1","22c55e"], showLegend:true } as any);
  }

  // SLA trend slide
  if (monthly.monthly.length > 0) {
    sl = pptx.addSlide();
    sl.addText("SLA % — Evolução Mensal", { x:0.5, y:0.3, w:9, h:0.6, fontSize:22, bold:true, color:"1e1b4b" });
    sl.addText("Meta: 90%", { x:0.5, y:0.85, w:9, h:0.35, fontSize:12, color:"64748b" });
    const labels = monthly.monthly.map(r => fmtMonth(r.month));
    sl.addChart((pptx.ChartType as any).line,
      [{ name:"SLA %", labels, values: monthly.monthly.map(r => r.sla_percent) }],
      { x:0.5, y:1.2, w:9, h:5.1, chartColors:["22c55e"], showLegend:false, dataLabelFormatCode:"0\"%\"" } as any);
  }

  // Avg resolution slide
  if (monthly.monthly.some(r => r.avg_resolution_hours != null)) {
    sl = pptx.addSlide();
    sl.addText("Tempo Médio de Resolução (horas) — Mês a Mês", { x:0.5, y:0.3, w:9, h:0.6, fontSize:20, bold:true, color:"1e1b4b" });
    const labels = monthly.monthly.map(r => fmtMonth(r.month));
    sl.addChart((pptx.ChartType as any).line,
      [{ name:"TMR (horas)", labels, values: monthly.monthly.map(r => r.avg_resolution_hours ?? 0) }],
      { x:0.5, y:1.1, w:9, h:5.2, chartColors:["f59e0b"], showLegend:false } as any);
  }

  // By branch slide
  if (monthly.topBranches.length > 0) {
    sl = pptx.addSlide();
    sl.addText("Total por Filial (acumulado)", { x:0.5, y:0.3, w:9, h:0.6, fontSize:22, bold:true, color:"1e1b4b" });
    sl.addChart((pptx.ChartType as any).bar,
      [{ name:"Chamados", labels: monthly.topBranches.map(b => b.label), values: monthly.topBranches.map(b => b.count) }],
      { x:0.5, y:1.1, w:9, h:5.2, chartColors:["6366f1"], showLegend:false } as any);
  }

  // By category slide
  if (monthly.topCategories.length > 0) {
    sl = pptx.addSlide();
    sl.addText("Top Categorias (acumulado)", { x:0.5, y:0.3, w:9, h:0.6, fontSize:22, bold:true, color:"1e1b4b" });
    sl.addChart((pptx.ChartType as any).bar,
      [{ name:"Chamados", labels: monthly.topCategories.map(c => c.label), values: monthly.topCategories.map(c => c.count) }],
      { x:0.5, y:1.1, w:9, h:5.2, chartColors:["8b5cf6"], showLegend:false } as any);
  }

  // Monthly detail table slide (text-based)
  sl = pptx.addSlide();
  sl.addText("Tabela Mensal Detalhada", { x:0.5, y:0.3, w:9, h:0.5, fontSize:18, bold:true, color:"1e1b4b" });
  const tableRows: any[] = [
    [
      { text:"Mês", options:{ bold:true, fill:"6366f1", color:"FFFFFF", fontSize:9 } },
      { text:"Abertos", options:{ bold:true, fill:"6366f1", color:"FFFFFF", fontSize:9, align:"right" } },
      { text:"Fechados", options:{ bold:true, fill:"6366f1", color:"FFFFFF", fontSize:9, align:"right" } },
      { text:"Ativos", options:{ bold:true, fill:"6366f1", color:"FFFFFF", fontSize:9, align:"right" } },
      { text:"SLA %", options:{ bold:true, fill:"6366f1", color:"FFFFFF", fontSize:9, align:"right" } },
      { text:"TMR", options:{ bold:true, fill:"6366f1", color:"FFFFFF", fontSize:9, align:"right" } },
      { text:"SLA Venc.", options:{ bold:true, fill:"6366f1", color:"FFFFFF", fontSize:9, align:"right" } },
    ],
    ...monthly.monthly.slice(-18).map((r, i) => [
      { text:fmtMonthFull(r.month), options:{ fontSize:8, fill: i%2===0 ? "f8f8ff" : "FFFFFF" } },
      { text:String(r.total_opened), options:{ fontSize:8, align:"right", fill: i%2===0 ? "f8f8ff" : "FFFFFF" } },
      { text:String(r.total_closed), options:{ fontSize:8, align:"right", fill: i%2===0 ? "f8f8ff" : "FFFFFF" } },
      { text:String(r.total_active), options:{ fontSize:8, align:"right", fill: i%2===0 ? "f8f8ff" : "FFFFFF" } },
      { text:`${r.sla_percent}%`, options:{ fontSize:8, align:"right", bold:true, color: r.sla_percent >= 90 ? "16a34a" : "dc2626", fill: i%2===0 ? "f8f8ff" : "FFFFFF" } },
      { text:r.avg_resolution_hours != null ? `${r.avg_resolution_hours.toFixed(1)}h` : "—", options:{ fontSize:8, align:"right", fill: i%2===0 ? "f8f8ff" : "FFFFFF" } },
      { text:String(r.sla_breached), options:{ fontSize:8, align:"right", fill: i%2===0 ? "f8f8ff" : "FFFFFF" } },
    ]),
  ];
  sl.addTable(tableRows, { x:0.3, y:0.9, w:9.4, h:5.5, colW:[2.4,0.85,0.85,0.75,0.75,0.85,0.9], border:{ pt:0.5, color:"e5e7eb" } });

  await pptx.writeFile({ fileName: `helpdesk-agm-${new Date().getFullYear()}-mensal.pptx` });
}

// ─── KPI Card Component ───────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
}
function KpiCard({ label, value, icon: Icon, color, bg, trend, subtitle }: KpiCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={`inline-flex p-2 rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          {trend && (
            <span className={`text-xs font-medium ${trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground"}`}>
              {trend === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : trend === "down" ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>
        <div className={`text-2xl font-bold mt-2 ${color}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5 font-medium">{label}</div>
        {subtitle && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

// ─── SLA Gauge ────────────────────────────────────────────────────────────────
function SlaGauge({ percent, breached, met }: { percent: number; breached: number; met: number }) {
  const data = [{ name: "SLA", value: percent, fill: percent >= 90 ? "#22c55e" : percent >= 70 ? "#f59e0b" : "#ef4444" }];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> SLA — Meta 90%
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="relative">
            <ResponsiveContainer width={120} height={120}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={data} startAngle={180} endAngle={0}>
                <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "#e2e8f0" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center flex-col" style={{ paddingTop: 20 }}>
              <span className={`text-2xl font-bold ${percent >= 90 ? "text-green-600" : percent >= 70 ? "text-amber-500" : "text-red-500"}`}>{percent}%</span>
              <span className="text-[10px] text-muted-foreground">atual</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Cumpridos:</span>
              <span className="font-semibold">{met}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Vencidos:</span>
              <span className="font-semibold">{breached}</span>
            </div>
            <div className={`text-xs px-2 py-1 rounded-full font-medium ${percent >= 90 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
              {percent >= 90 ? "✓ Meta atingida" : "⚠ Abaixo da meta"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
function HeatmapChart({ data }: { data: Array<{ dow: number; hour: number; count: number }> }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const max = Math.max(...data.map(d => d.count), 1);
  const grid: Record<string, number> = {};
  data.forEach(d => { grid[`${d.dow}_${d.hour}`] = d.count; });

  const getColor = (val: number) => {
    if (val === 0) return "bg-muted/30";
    const intensity = val / max;
    if (intensity < 0.2) return "bg-indigo-100 dark:bg-indigo-900/20";
    if (intensity < 0.4) return "bg-indigo-200 dark:bg-indigo-800/40";
    if (intensity < 0.6) return "bg-indigo-400 dark:bg-indigo-600/60";
    if (intensity < 0.8) return "bg-indigo-500 dark:bg-indigo-500/80";
    return "bg-indigo-700 dark:bg-indigo-400";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Heatmap — Volume por Dia/Hora
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="flex gap-1 mb-1 ml-8">
            {hours.filter((_, i) => i % 2 === 0).map(h => (
              <div key={h} className="text-[9px] text-muted-foreground w-5 text-center" style={{ flex: "0 0 auto", width: 18 }}>
                {String(h).padStart(2,"0")}h
              </div>
            ))}
          </div>
          {DAYS.map((day, dow) => (
            <div key={dow} className="flex items-center gap-1 mb-0.5">
              <div className="text-[10px] text-muted-foreground w-7 shrink-0 text-right pr-1">{day}</div>
              {hours.map(h => {
                const val = grid[`${dow}_${h}`] ?? 0;
                return (
                  <div
                    key={h}
                    title={`${day} ${String(h).padStart(2,"0")}:00 — ${val} chamados`}
                    className={`rounded-sm ${getColor(val)} cursor-default transition-colors`}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
            <span>Menos</span>
            {["bg-muted/30","bg-indigo-100 dark:bg-indigo-900/20","bg-indigo-200 dark:bg-indigo-800/40","bg-indigo-400","bg-indigo-600","bg-indigo-700 dark:bg-indigo-400"].map((c, i) => (
              <div key={i} className={`w-3.5 h-3.5 rounded-sm ${c}`} />
            ))}
            <span>Mais</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Analyst Ranking ─────────────────────────────────────────────────────────
function AnalystRanking({ data }: { data: Array<{ label: string; totalTickets: number; resolved: number; avgResolutionHours: number | null; avgResponseMinutes: number | null }> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-500" /> Ranking de Analistas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">Nenhum chamado atribuído ainda.</div>
        ) : (
          <div className="space-y-2">
            {data.map((a, i) => {
              const rate = a.totalTickets > 0 ? Math.round((a.resolved / a.totalTickets) * 100) : 0;
              return (
                <div key={a.label} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : i === 1 ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" : i === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" : "bg-muted text-muted-foreground"}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.label}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="h-1.5 rounded-full bg-muted flex-1 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${rate}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{rate}%</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-green-600 dark:text-green-400">{a.resolved}</div>
                    <div className="text-[10px] text-muted-foreground">resolvidos</div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="text-sm font-semibold">{a.avgResolutionHours != null ? a.avgResolutionHours.toFixed(1)+"h" : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">TMR</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats & { slaPercent?: number; slaBreached?: number; slaMet?: number; closedToday?: number; byStatus?: any[]; analystRanking?: any[]; heatmap?: any[]; last7days?: any[] } | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyStats | null>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [exporting, setExporting] = useState<"csv"|"pdf"|"pptx"|"monthly-pdf"|"monthly-pptx"|null>(null);
  const [period, setPeriod] = useState("all");
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [filterBranch, setFilterBranch] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // AGM period picker state
  const _now = new Date();
  const [agmMonths, setAgmMonths] = useState("24");
  const [agmEndYear, setAgmEndYear] = useState(String(_now.getFullYear()));
  const [agmEndMonth, setAgmEndMonth] = useState(String(_now.getMonth() + 1).padStart(2, "0"));

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    try {
      const params: Record<string, any> = {
        months: parseInt(agmMonths),
        endDate: `${agmEndYear}-${agmEndMonth}`,
      };
      if (filterBranch !== "all") params.branchId = parseInt(filterBranch);
      const m = await API.monthlyStats(params);
      setMonthlyData(m);
    } catch { /**/ } finally { setMonthlyLoading(false); }
  }, [filterBranch, agmMonths, agmEndYear, agmEndMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period !== "all") params.set("period", period);
      if (filterBranch !== "all") params.set("branchId", filterBranch);
      const qs = params.toString();
      const [s, t, br] = await Promise.all([
        apiFetch<any>(`/api/dashboard/stats${qs ? "?" + qs : ""}`),
        API.exportTickets(),
        API.listBranches(),
      ]);
      setStats(s); setTickets(t); setBranches(br);
      setLastUpdated(new Date());
    } catch { /**/ } finally { setLoading(false); }
  }, [period, filterBranch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMonthly(); }, [loadMonthly]);

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(() => { load(); loadMonthly(); }, 60000);
    return () => clearInterval(t);
  }, [load, loadMonthly]);

  const handleExport = async (type: "csv"|"pdf"|"pptx"|"monthly-pdf"|"monthly-pptx") => {
    if (!stats) return;
    setExporting(type);
    try {
      if (type === "csv") exportCsv(tickets);
      else if (type === "pdf") exportPdf(stats, tickets);
      else if (type === "pptx") await exportPptx(stats);
      else if (type === "monthly-pdf" && monthlyData) exportMonthlyPdf(monthlyData);
      else if (type === "monthly-pptx" && monthlyData) await exportMonthlyPptx(monthlyData);
    } catch (e) { console.error(e); }
    finally { setExporting(null); }
  };

  if (loading && !stats) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-7 w-40 bg-muted rounded animate-pulse" />
            <div className="h-4 w-56 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const slaPercent = stats.slaPercent ?? 100;
  const slaBreached = stats.slaBreached ?? 0;
  const slaMet = stats.slaMet ?? stats.totalAll;

  const resolRate = stats.totalAll > 0
    ? Math.round((stats.totalClosed / stats.totalAll) * 100)
    : 0;

  const kpiCards: KpiCardProps[] = [
    { label: "Total Geral", value: stats.totalAll, icon: BarChart2, color: "text-primary", bg: "bg-primary/10" },
    { label: "Abertos", value: stats.totalOpen, icon: Ticket, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Em Atendimento", value: stats.totalInProgress, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Encerrados", value: stats.totalClosed, icon: XCircle, color: "text-slate-500", bg: "bg-slate-500/10" },
    { label: "Abertos Hoje", value: stats.totalToday, icon: TrendingUp, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "Encerrados Hoje", value: stats.closedToday ?? 0, icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "SLA Cumprido", value: `${slaPercent}%`, icon: Target, color: slaPercent >= 90 ? "text-green-500" : slaPercent >= 70 ? "text-amber-500" : "text-red-500", bg: slaPercent >= 90 ? "bg-green-500/10" : "bg-red-500/10", subtitle: `${slaBreached} vencido(s)` },
    { label: "SLA Vencido", value: slaBreached, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
    { label: "Reabertos", value: stats.totalReopened ?? 0, icon: RefreshCw, color: "text-orange-500", bg: "bg-orange-500/10" },
    {
      label: "TM Resolução",
      value: stats.avgResolutionHours != null ? `${stats.avgResolutionHours.toFixed(1)}h` : "—",
      icon: Clock, color: "text-teal-500", bg: "bg-teal-500/10",
      subtitle: stats.avgFirstResponseHours != null ? `1ª resp: ${((stats.avgFirstResponseHours) * 60).toFixed(0)}min` : undefined,
    },
    { label: "Taxa Resolução", value: `${resolRate}%`, icon: Award, color: "text-emerald-500", bg: "bg-emerald-500/10", subtitle: `${stats.totalClosed}/${stats.totalAll} encerrados` },
  ];

  const trendData = stats.last30days ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Executivo</h1>
          <p className="text-sm text-muted-foreground">
            Visão corporativa do suporte de TI
            {lastUpdated && <span className="ml-2 text-xs opacity-60">· atualizado {lastUpdated.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo período</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="1y">Último ano</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Todas filiais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas filiais</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={!!exporting} className="h-9">
            {exporting === "csv" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />}
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={!!exporting} className="h-9">
            {exporting === "pdf" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pptx")} disabled={!!exporting} className="h-9">
            {exporting === "pptx" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Presentation className="h-3.5 w-3.5 mr-1" />}
            PowerPoint
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-3">
        {kpiCards.map(card => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {/* SLA + Trend Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SlaGauge percent={slaPercent} breached={slaBreached} met={slaMet} />

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Evolução — Últimos 30 Dias</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={trendData} margin={{ right: 12 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                <Tooltip labelFormatter={(d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long" })} formatter={(v: any) => [v, "Chamados"]} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} fill="url(#grad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      {stats.heatmap && stats.heatmap.length > 0 && (
        <HeatmapChart data={stats.heatmap} />
      )}

      {/* Analyst Ranking */}
      {stats.analystRanking && (
        <AnalystRanking data={stats.analystRanking} />
      )}

      {/* Tabs de análise */}
      <Tabs defaultValue="mensal">
        <TabsList className="flex-wrap h-auto gap-1 bg-muted/50">
          <TabsTrigger value="mensal" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white font-semibold">
            <CalendarDays className="h-3.5 w-3.5 mr-1" />Mês a Mês
          </TabsTrigger>
          <TabsTrigger value="filiais">Filiais</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
           <TabsTrigger value="clientes">Top 10 Chamados por Volume</TabsTrigger>
          <TabsTrigger value="status">Por Status</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="tendencia">Tendência</TabsTrigger>
        </TabsList>

        {/* ── Mês a Mês (AGM) ───────────────────────────────────────────── */}
        <TabsContent value="mensal" className="mt-4 space-y-5">
          {monthlyLoading && !monthlyData ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados mensais…
            </div>
          ) : !monthlyData || monthlyData.monthly.length === 0 ? (
            <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">Nenhum dado mensal disponível ainda.</CardContent></Card>
          ) : (
            <>
              {/* AGM export bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" /> Painel AGM — Análise Mês a Mês
                  </p>
                   <p className="text-xs text-indigo-500/80 mt-0.5">{agmMonths} meses até {agmEndMonth}/{agmEndYear} · dados consolidados para apresentação em assembleia</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="h-8 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                    onClick={() => handleExport("monthly-pdf")} disabled={!!exporting}>
                    {exporting === "monthly-pdf" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                    Relatório PDF (AGM)
                  </Button>
                  <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => handleExport("monthly-pptx")} disabled={!!exporting}>
                    {exporting === "monthly-pptx" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Presentation className="h-3.5 w-3.5 mr-1" />}
                    PowerPoint (AGM)
                  </Button>
                </div>
              </div>

              {/* YoY Comparison */}
              {(() => {
                const diff = monthlyData.yoyCurrent - monthlyData.yoyPrev;
                const pct = monthlyData.yoyPrev > 0 ? ((diff / monthlyData.yoyPrev) * 100).toFixed(1) : null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-slate-600 dark:text-slate-300">{monthlyData.yoyPrev}</div>
                        <div className="text-xs text-muted-foreground mt-1">Chamados {monthlyData.currentYear - 1}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{monthlyData.yoyCurrent}</div>
                        <div className="text-xs text-muted-foreground mt-1">Chamados {monthlyData.currentYear}</div>
                      </CardContent>
                    </Card>
                    <Card className={`${diff > 0 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900" : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"}`}>
                      <CardContent className="p-4 text-center">
                        <div className={`text-2xl font-bold ${diff > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {diff >= 0 ? "+" : ""}{diff}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Variação absoluta</div>
                      </CardContent>
                    </Card>
                    <Card className={`${diff > 0 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900" : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"}`}>
                      <CardContent className="p-4 text-center">
                        <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${diff > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {diff > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                          {pct != null ? `${diff >= 0 ? "+" : ""}${pct}%` : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Variação percentual</div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Main chart: abertos vs fechados grouped bar */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-primary" /> Volume de Chamados — Mês a Mês (últimos 24 meses)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={monthlyData.monthly.map(r => ({ name: fmtMonth(r.month), abertos: r.total_opened, fechados: r.total_closed, sla: r.sla_percent }))} margin={{ right: 16, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" width={36} />
                      <Tooltip formatter={(v: any, n: string) => [n === "sla" ? `${v}%` : v, n === "abertos" ? "Abertos" : n === "fechados" ? "Fechados" : "SLA %"]} />
                      <Legend formatter={(v: string) => v === "abertos" ? "Abertos" : v === "fechados" ? "Fechados" : "SLA %"} />
                      <Bar yAxisId="left" dataKey="abertos" fill="#6366f1" radius={[3,3,0,0]} name="abertos" />
                      <Bar yAxisId="left" dataKey="fechados" fill="#22c55e" radius={[3,3,0,0]} name="fechados" />
                      <Line yAxisId="right" type="monotone" dataKey="sla" stroke="#f59e0b" strokeWidth={2} dot={false} name="sla" strokeDasharray="4 2" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* SLA trend + TMR trend */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4 text-amber-500" /> SLA % — Evolução Mensal · Meta 90%
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <ComposedChart data={monthlyData.monthly.map(r => ({ name: fmtMonth(r.month), sla: r.sla_percent, meta: 90 }))} margin={{ right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} unit="%" width={32} />
                        <Tooltip formatter={(v: any, n: string) => [`${v}%`, n === "sla" ? "SLA Cumprido" : "Meta"]} />
                        <Line type="monotone" dataKey="sla" stroke="#22c55e" strokeWidth={2.5} dot={(p: any) => (
                          <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill={p.payload.sla >= 90 ? "#22c55e" : "#ef4444"} stroke="none" />
                        )} />
                        <Line type="monotone" dataKey="meta" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                     <CardTitle className="text-sm font-medium flex items-center gap-2">
                       <Clock className="h-4 w-4 text-teal-500" /> Tempo Médio de Resolução (minutos)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                     <AreaChart data={monthlyData.monthly.map(r => ({ name: fmtMonth(r.month), tmr: r.avg_resolution_hours != null ? Math.round(r.avg_resolution_hours * 60) : null }))} margin={{ right: 8 }}>
                        <defs>
                          <linearGradient id="tmrGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                         <YAxis tick={{ fontSize: 9 }} unit="min" width={40} />
                         <Tooltip formatter={(v: any) => [v != null ? `${v} min` : "—", "TMR"]} />
                        <Area type="monotone" dataKey="tmr" stroke="#14b8a6" strokeWidth={2} fill="url(#tmrGrad)" dot={{ r: 3, fill: "#14b8a6" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Per-branch and per-category monthly breakdown */}
              {monthlyData.monthlyByBranch.length > 0 && (() => {
                const months = [...new Set(monthlyData.monthlyByBranch.map(r => r.month))].slice(-12);
                const branchNames = [...new Set(monthlyData.monthlyByBranch.map(r => r.branch))].slice(0, 8);
                const branchColors = ["#6366f1","#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#14b8a6"];
                const branchData = months.map(m => {
                  const row: Record<string, any> = { name: fmtMonth(m) };
                  branchNames.forEach(b => {
                    const found = monthlyData.monthlyByBranch.find(r => r.month === m && r.branch === b);
                    row[b] = found?.count ?? 0;
                  });
                  return row;
                });
                return (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-indigo-500" /> Chamados por Filial — Últimos 12 Meses
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={branchData} margin={{ right: 8, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                          <Tooltip />
                          <Legend formatter={(v: string) => v} wrapperStyle={{ fontSize: 10 }} />
                          {branchNames.map((b, i) => (
                            <Bar key={b} dataKey={b} stackId="br" fill={branchColors[i % branchColors.length]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                );
              })()}

              {monthlyData.monthlyByCategory.length > 0 && (() => {
                const months = [...new Set(monthlyData.monthlyByCategory.map(r => r.month))].slice(-12);
                const catNames = [...new Set(monthlyData.monthlyByCategory.map(r => r.category))].slice(0, 8);
                const catColors = ["#6366f1","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#22c55e","#ec4899","#14b8a6"];
                const catData = months.map(m => {
                  const row: Record<string, any> = { name: fmtMonth(m) };
                  catNames.forEach(c => {
                    const found = monthlyData.monthlyByCategory.find(r => r.month === m && r.category === c);
                    row[c] = found?.count ?? 0;
                  });
                  return row;
                });
                return (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Tag className="h-4 w-4 text-purple-500" /> Chamados por Categoria — Últimos 12 Meses
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={catData} margin={{ right: 8, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {catNames.map((c, i) => (
                            <Bar key={c} dataKey={c} stackId="cat" fill={catColors[i % catColors.length]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Detailed table — all months */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" /> Tabela Mensal Detalhada — últimos 24 meses
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-indigo-600 text-white">
                        <th className="text-left px-3 py-2.5 font-semibold">Mês</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Abertos</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Fechados</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Ativos</th>
                        <th className="text-right px-3 py-2.5 font-semibold">SLA %</th>
                        <th className="text-right px-3 py-2.5 font-semibold">SLA Venc.</th>
                        <th className="text-right px-3 py-2.5 font-semibold">TMR</th>
                        <th className="text-right px-3 py-2.5 font-semibold">1ª Resp.</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Reabertos</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Taxa Res.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...monthlyData.monthly].reverse().map((r, i) => {
                        const resolRate = r.total_opened > 0 ? Math.round((r.total_closed / r.total_opened) * 100) : 0;
                        return (
                          <tr key={r.month} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                            <td className="px-3 py-2 font-medium">{fmtMonthFull(r.month)}</td>
                            <td className="px-3 py-2 text-right font-mono">{r.total_opened}</td>
                            <td className="px-3 py-2 text-right font-mono text-green-600 dark:text-green-400 font-semibold">{r.total_closed}</td>
                            <td className="px-3 py-2 text-right font-mono text-amber-600 dark:text-amber-400">{r.total_active}</td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${r.sla_percent >= 90 ? "text-green-600 dark:text-green-400" : r.sla_percent >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                              {r.sla_percent}%
                            </td>
                            <td className={`px-3 py-2 text-right font-mono ${r.sla_breached > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{r.sla_breached}</td>
                            <td className="px-3 py-2 text-right font-mono text-teal-600 dark:text-teal-400">{r.avg_resolution_hours != null ? `${Math.round(r.avg_resolution_hours * 60)} min` : "—"}</td>
                            <td className="px-3 py-2 text-right font-mono">{r.avg_first_response_min != null ? `${r.avg_first_response_min}min` : "—"}</td>
                            <td className="px-3 py-2 text-right font-mono">{r.total_reopened}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${resolRate >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : resolRate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"}`}>
                                {resolRate}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const tot = monthlyData.monthly.reduce((acc, r) => ({
                          opened: acc.opened + r.total_opened,
                          closed: acc.closed + r.total_closed,
                          breached: acc.breached + r.sla_breached,
                          reopened: acc.reopened + r.total_reopened,
                        }), { opened: 0, closed: 0, breached: 0, reopened: 0 });
                        const avgSla = monthlyData.monthly.length > 0
                          ? Math.round(monthlyData.monthly.reduce((s, r) => s + r.sla_percent, 0) / monthlyData.monthly.length)
                          : 0;
                        const avgTmr = (() => {
                          const valid = monthlyData.monthly.filter(r => r.avg_resolution_hours != null);
                           return valid.length > 0 ? Math.round((valid.reduce((s, r) => s + (r.avg_resolution_hours ?? 0), 0) / valid.length) * 60) : null;
                        })();
                        const resolRate = tot.opened > 0 ? Math.round((tot.closed / tot.opened) * 100) : 0;
                        return (
                          <tr className="border-t-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 font-bold">
                            <td className="px-3 py-2.5 text-xs text-indigo-700 dark:text-indigo-300">Total / Média</td>
                            <td className="px-3 py-2.5 text-right font-mono">{tot.opened}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-green-600 dark:text-green-400">{tot.closed}</td>
                            <td className="px-3 py-2.5 text-right font-mono">—</td>
                            <td className={`px-3 py-2.5 text-right font-mono ${avgSla >= 90 ? "text-green-600" : "text-amber-600"}`}>{avgSla}%</td>
                            <td className="px-3 py-2.5 text-right font-mono text-red-600 dark:text-red-400">{tot.breached}</td>
                             <td className="px-3 py-2.5 text-right font-mono text-teal-600 dark:text-teal-400">{avgTmr != null ? `${avgTmr} min` : "—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono">—</td>
                            <td className="px-3 py-2.5 text-right font-mono">{tot.reopened}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{resolRate}%</td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Monthly analyst performance table */}
              {monthlyData.monthlyByAnalyst.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-emerald-500" /> Desempenho por Analista — últimos 12 meses
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    {(() => {
                      const months = [...new Set(monthlyData.monthlyByAnalyst.map(r => r.month))].sort().slice(-12);
                      const analysts = [...new Set(monthlyData.monthlyByAnalyst.map(r => r.analyst))].slice(0, 10);
                      return (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-emerald-600 text-white">
                              <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-emerald-600">Analista</th>
                              {months.map(m => <th key={m} className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">{fmtMonth(m)}</th>)}
                              <th className="text-right px-3 py-2.5 font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysts.map((analyst, ai) => {
                              const total = monthlyData.monthlyByAnalyst
                                .filter(r => r.analyst === analyst)
                                .reduce((s, r) => s + r.count, 0);
                              return (
                                <tr key={analyst} className={ai % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                                  <td className="px-3 py-2 font-medium">{analyst}</td>
                                  {months.map(m => {
                                    const found = monthlyData.monthlyByAnalyst.find(r => r.month === m && r.analyst === analyst);
                                    return <td key={m} className="px-3 py-2 text-right font-mono">{found?.count ?? "—"}</td>;
                                  })}
                                  <td className="px-3 py-2 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">{total}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Filiais */}
        <TabsContent value="filiais" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total por Filial</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.byBranch} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => [v, "Chamados"]} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]}>
                      {stats.byBranch.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Abertos por Filial</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.openByBranch} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => [v, "Em aberto"]} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categorias */}
        <TabsContent value="categorias" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Por Categoria</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stats.byCategory} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={230} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => [v, "Chamados"]} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {stats.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Distribuição por Categoria</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={stats.byCategory.filter(c => c.count > 0)} cx="50%" cy="50%" outerRadius={110} innerRadius={50} dataKey="count" nameKey="label" label={({ label, percent }) => `${(label as string).slice(0, 10)} ${((percent as number) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {stats.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Departamentos */}
        <TabsContent value="departamentos" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Por Departamento</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={stats.byDepartment} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [v, "Chamados"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stats.byDepartment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clientes */}
        <TabsContent value="clientes" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top 10 Clientes por Volume</CardTitle></CardHeader>
            <CardContent>
              {stats.byClient.length === 0 ? (
                <div className="text-center text-muted-foreground py-12 text-sm">Nenhum dado disponível ainda.</div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={stats.byClient} layout="vertical" margin={{ left: 0, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [v, "Chamados"]} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {stats.byClient.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Status */}
        <TabsContent value="status" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Distribuição por Status</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={(stats.byStatus ?? []).map((s: any) => ({ label: STATUS_LABELS[s.label] ?? s.label, count: s.count }))}
                      cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="count" nameKey="label"
                      label={({ label, percent }) => `${label} ${((percent as number) * 100).toFixed(0)}%`}
                      labelLine={false} fontSize={10}
                    >
                      {(stats.byStatus ?? []).map((s: any, i: number) => (
                        <Cell key={i} fill={STATUS_COLORS[s.label] ?? COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v, n]} />
                    <Legend formatter={(v: any) => v} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Contagem por Status</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 pt-2">
                  {(stats.byStatus ?? []).map((s: any) => (
                    <div key={s.label} className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ background: STATUS_COLORS[s.label] ?? "#6366f1" }} />
                      <span className="text-sm flex-1">{STATUS_LABELS[s.label] ?? s.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-muted overflow-hidden w-24">
                          <div className="h-full rounded-full" style={{
                            background: STATUS_COLORS[s.label] ?? "#6366f1",
                            width: `${stats.totalAll > 0 ? Math.round((s.count / stats.totalAll) * 100) : 0}%`
                          }} />
                        </div>
                        <Badge variant="secondary" className="text-xs w-8 text-center">{s.count}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Equipe */}
        <TabsContent value="equipe" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Chamados por Analista</CardTitle></CardHeader>
            <CardContent>
              {stats.byAssignee.length === 0 ? (
                <div className="text-center text-muted-foreground py-12 text-sm">Nenhum chamado atribuído ainda.</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.byAssignee} margin={{ bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [v, "Chamados"]} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {stats.byAssignee.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tendência */}
        <TabsContent value="tendencia" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Novos Chamados — Últimos 30 Dias</CardTitle></CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <div className="text-center text-muted-foreground py-12 text-sm">Sem dados nos últimos 30 dias.</div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={trendData} margin={{ bottom: 20, right: 12 }}>
                    <defs>
                      <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip labelFormatter={(d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long" })} formatter={(v: any) => [v, "Chamados"]} />
                    <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} fill="url(#grad2)" dot={{ r: 3, fill: "#6366f1" }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
