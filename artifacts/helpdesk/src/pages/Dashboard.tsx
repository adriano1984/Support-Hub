import { useEffect, useState, useCallback } from "react";
import { API, type DashboardStats } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend,
  AreaChart, Area,
} from "recharts";
import {
  Ticket, Clock, CheckCircle, XCircle, TrendingUp, Users, AlertTriangle,
  Download, FileSpreadsheet, Presentation, Loader2, RefreshCw, Target,
  ArrowUpRight, ArrowDownRight, Minus, Award, Zap, BarChart2,
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
  const header = ["Chamado","Cliente","Telefone","Filial","Departamento","Categoria","Status","Técnico","Descrição","Criado em","Atualizado em"];
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
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv"|"pdf"|"pptx"|null>(null);
  const [period, setPeriod] = useState("all");
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [filterBranch, setFilterBranch] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const handleExport = async (type: "csv"|"pdf"|"pptx") => {
    if (!stats) return;
    setExporting(type);
    try {
      if (type === "csv") exportCsv(tickets);
      else if (type === "pdf") exportPdf(stats, tickets);
      else await exportPptx(stats);
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

  const kpiCards: KpiCardProps[] = [
    { label: "Total Geral", value: stats.totalAll, icon: BarChart2, color: "text-primary", bg: "bg-primary/10" },
    { label: "Abertos", value: stats.totalOpen, icon: Ticket, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Em Atendimento", value: stats.totalInProgress, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Aguardando Cliente", value: stats.totalResolved, icon: Users, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Encerrados", value: stats.totalClosed, icon: XCircle, color: "text-slate-500", bg: "bg-slate-500/10" },
    { label: "Abertos Hoje", value: stats.totalToday, icon: TrendingUp, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "Encerrados Hoje", value: stats.closedToday ?? 0, icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "SLA Vencido", value: slaBreached, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
    { label: "Reabertos", value: stats.totalReopened ?? 0, icon: RefreshCw, color: "text-orange-500", bg: "bg-orange-500/10" },
    {
      label: "TM Resolução",
      value: stats.avgResolutionHours != null ? `${stats.avgResolutionHours.toFixed(1)}h` : "—",
      icon: Clock, color: "text-teal-500", bg: "bg-teal-500/10",
      subtitle: stats.avgFirstResponseHours != null ? `1ª resp: ${((stats.avgFirstResponseHours) * 60).toFixed(0)}min` : undefined,
    },
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
      <Tabs defaultValue="filiais">
        <TabsList className="flex-wrap h-auto gap-1 bg-muted/50">
          <TabsTrigger value="filiais">Filiais</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
          <TabsTrigger value="clientes">Clientes (Top 10)</TabsTrigger>
          <TabsTrigger value="status">Por Status</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="tendencia">Tendência</TabsTrigger>
        </TabsList>

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
