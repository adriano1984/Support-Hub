import { useState, useEffect } from "react";
import { API, type DashboardStats, type RecentActivity } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Ticket, Clock, CheckCircle2, AlertTriangle, TrendingUp,
  ArrowRight, Inbox, Circle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  supervisor: "Supervisor",
  technician: "Analista",
  attendant: "Analista",
};

function getGreeting(d: Date): string {
  const hour = d.getHours();
  if (hour >= 6 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

const STATUS_COLORS: Record<string, string> = {
  open: "text-blue-500",
  in_progress: "text-amber-500",
  closed: "text-slate-400",
};

const ACTION_LABELS: Record<string, string> = {
  opened: "Chamado aberto",
  assigned: "Atribuído",
  status_changed: "Status alterado",
  reply: "Resposta enviada",
  note_added: "Nota interna",
  closed: "Fechado",
  sla_warning: "Aviso SLA",
  sla_closed: "Encerrado por SLA",
};

export default function Home() {
  const { user } = useAuth();
  const now = useClock();
  const isAnalyst = ["technician", "attendant"].includes(user?.role ?? "");

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<RecentActivity[]>([]);
  const [myTickets, setMyTickets] = useState({ total: 0, open: 0, inProgress: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const promises: Promise<any>[] = [
      API.getDashboardRecent().then(setRecent).catch(() => {}),
    ];

    if (!isAnalyst) {
      promises.push(API.stats().then(setStats).catch(() => {}));
    }

    if (isAnalyst && user) {
      promises.push(
        Promise.all([
          API.listTickets({ assignedTo: user.userId, limit: 1 }),
          API.listTickets({ assignedTo: user.userId, status: "open", limit: 1 }),
          API.listTickets({ assignedTo: user.userId, status: "in_progress", limit: 1 }),
        ])
          .then(([all, open, inProg]) =>
            setMyTickets({ total: all.total, open: open.total, inProgress: inProg.total })
          )
          .catch(() => {})
      );
    }

    Promise.all(promises).finally(() => setLoading(false));
  }, [isAnalyst, user]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {getGreeting(now)}, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-muted-foreground text-sm">
          {ROLE_LABELS[user?.role ?? ""] ?? user?.role} ·{" "}
          {now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          <span className="ml-2 font-mono tabular-nums text-foreground/70">
            {now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </span>
        </p>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isAnalyst ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{myTickets.open}</div>
                  <div className="text-xs text-muted-foreground">Meus Abertos</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{myTickets.inProgress}</div>
                  <div className="text-xs text-muted-foreground">Em Atendimento</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Ticket className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{myTickets.total}</div>
                  <div className="text-xs text-muted-foreground">Total Atribuídos</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Ticket className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.totalOpen}</div>
                  <div className="text-xs text-muted-foreground">Abertos</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.totalInProgress}</div>
                  <div className="text-xs text-muted-foreground">Em Atendimento</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.totalResolved}</div>
                  <div className="text-xs text-muted-foreground">Resolvidos</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.totalToday}</div>
                  <div className="text-xs text-muted-foreground">Abertos Hoje</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
            Acesso Rápido
          </h2>
          <div className="flex flex-col gap-2">
            <Link href="/tickets">
              <Button variant="outline" className="w-full justify-between h-12">
                <div className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-primary" />
                  <span>Ver todos os chamados</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            </Link>
            {!isAnalyst && (
              <>
                <Link href="/alerts">
                  <Button variant="outline" className="w-full justify-between h-12">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span>Alertas Operacionais</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" className="w-full justify-between h-12">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      <span>Dashboard completo</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Recent Activity — hidden from analysts */}
        {!isAnalyst && (
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
            Atividade Recente
          </h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg bg-card">
              Sem atividades recentes.
            </div>
          ) : (
            <div className="border rounded-lg bg-card divide-y overflow-hidden">
              {recent.slice(0, 8).map((item) => (
                <Link key={item.id} href={`/tickets/${item.ticketId}`}>
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                    <Circle
                      className={`h-2 w-2 mt-2 shrink-0 fill-current ${STATUS_COLORS[item.status] ?? "text-slate-400"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-primary">
                          #{item.ticketNumber}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ACTION_LABELS[item.action] ?? item.action}
                        </span>
                        {item.clientName && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {item.clientName}
                          </span>
                        )}
                      </div>
                      {item.detail && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.detail}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
