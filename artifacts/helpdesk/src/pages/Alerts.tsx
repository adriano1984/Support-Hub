import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertCircle, Clock, UserX, MessageSquare, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatTimeBR } from "@/lib/utils";

interface AlertTicket {
  id: number;
  ticketNumber: string;
  clientName: string | null;
  status: string;
  branchName: string | null;
  assigneeName: string | null;
  hoursOpen?: number;
  hoursWaiting?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface AlertData {
  slaBreached: AlertTicket[];
  nearSla: AlertTicket[];
  unassigned: AlertTicket[];
  waitingClient: AlertTicket[];
  resolvedToday: AlertTicket[];
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  open: { label: "Aberto", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "Em Atendimento", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  resolved: { label: "Resolvido", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  closed: { label: "Fechado", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

interface AlertSectionProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  tickets: AlertTicket[];
  showHoursOpen?: boolean;
  showHoursWaiting?: boolean;
  showResolved?: boolean;
  emptyText: string;
}

function AlertSection({ title, subtitle, icon, color, tickets, showHoursOpen, showHoursWaiting, showResolved, emptyText }: AlertSectionProps) {
  return (
    <Card className={`border-l-4 ${color}`}>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            {title}
            {tickets.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{tickets.length}</Badge>
            )}
          </div>
          {subtitle && <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {tickets.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">{emptyText}</div>
        ) : (
          <div className="space-y-2">
            {tickets.map(t => (
              <Link key={t.id} href={`/tickets/${t.id}`}>
                <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border border-border/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-primary">#{t.ticketNumber}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 font-medium border-0 ${STATUS_MAP[t.status]?.className ?? ""}`}>
                        {STATUS_MAP[t.status]?.label ?? t.status}
                      </Badge>
                      {t.branchName && (
                        <span className="text-[10px] text-muted-foreground">{t.branchName}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate mt-0.5">{t.clientName || "Desconhecido"}</div>
                    {t.assigneeName && (
                      <div className="text-xs text-muted-foreground">Analista: {t.assigneeName}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {showHoursOpen && t.hoursOpen != null && (
                      <div className={`text-sm font-bold ${t.hoursOpen > 72 ? "text-red-600" : t.hoursOpen > 48 ? "text-red-500" : "text-amber-500"}`}>
                        {t.hoursOpen.toFixed(1)}h
                      </div>
                    )}
                    {showHoursWaiting && t.hoursWaiting != null && (
                      <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
                        {t.hoursWaiting.toFixed(1)}h
                      </div>
                    )}
                    {showResolved && t.updatedAt && (
                      <div className="text-xs text-muted-foreground">
                        {formatTimeBR(t.updatedAt)}
                      </div>
                    )}
                    {t.createdAt && !showResolved && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true, locale: ptBR })}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Alerts() {
  const [data, setData] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<AlertData>("/api/dashboard/alerts");
      setData(result);
      setLastUpdated(new Date());
    } catch { /**/ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const total = data ? (
    data.slaBreached.length + data.nearSla.length + data.unassigned.length + data.waitingClient.length
  ) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alertas Operacionais</h1>
          <p className="text-sm text-muted-foreground">
            Painel em tempo real · atualização a cada 30s
            {lastUpdated && <span className="ml-2 opacity-60">· {lastUpdated.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <Badge variant="destructive" className="text-sm px-2.5 py-0.5">{total} alertas ativos</Badge>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {data && total === 0 && data.resolvedToday.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
          <h3 className="text-lg font-semibold text-green-600">Tudo sob controle!</h3>
          <p className="text-sm text-muted-foreground mt-1">Nenhum alerta operacional no momento.</p>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AlertSection
            title="SLA Vencido"
            subtitle="> 48h sem resolução"
            icon={<AlertCircle className="h-4 w-4 text-red-500" />}
            color="border-red-500"
            tickets={data.slaBreached}
            showHoursOpen
            emptyText="✓ Nenhum chamado com SLA vencido."
          />
          <AlertSection
            title="Próximo do Vencimento"
            subtitle="Entre 36h e 48h"
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            color="border-amber-500"
            tickets={data.nearSla}
            showHoursOpen
            emptyText="✓ Nenhum chamado próximo do vencimento."
          />
          <AlertSection
            title="Sem Responsável"
            subtitle="Aguardando atribuição"
            icon={<UserX className="h-4 w-4 text-orange-500" />}
            color="border-orange-500"
            tickets={data.unassigned}
            showHoursOpen
            emptyText="✓ Todos os chamados têm responsável."
          />
          <AlertSection
            title="Aguardando Cliente"
            subtitle="Chamados resolvidos sem retorno"
            icon={<MessageSquare className="h-4 w-4 text-purple-500" />}
            color="border-purple-500"
            tickets={data.waitingClient}
            showHoursWaiting
            emptyText="✓ Nenhum chamado aguardando cliente."
          />
          <div className="lg:col-span-2">
            <AlertSection
              title="Resolvidos Hoje"
              subtitle={`${data.resolvedToday.length} chamados encerrados`}
              icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
              color="border-green-500"
              tickets={data.resolvedToday}
              showResolved
              emptyText="Nenhum chamado encerrado hoje ainda."
            />
          </div>
        </div>
      )}
    </div>
  );
}
