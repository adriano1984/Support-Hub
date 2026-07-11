import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Ticket, MessageSquare, Building2, Layers, Tags,
  Smartphone, Menu, UserCheck, LogOut, ChevronDown, MessageCircleCode,
  ShieldCheck, ClipboardList, Bell, Search, X, Circle, Users2,
  AlertTriangle, Monitor, Home as HomeIcon, KeyRound, Loader2, Package,
  ListTodo, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { API, type RecentActivity, type Ticket as TicketType } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

const navItems: { group: string; items: NavItem[] }[] = [
  {
    group: "Visão Geral",
    items: [
      { title: "Início", href: "/home", icon: HomeIcon },
      { title: "Dashboard", href: "/", icon: LayoutDashboard },
      { title: "Chamados", href: "/tickets", icon: Ticket },
      { title: "Alertas Operacionais", href: "/alerts", icon: AlertTriangle },
      { title: "Estoque de TI", href: "/inventory", icon: Monitor },
    ],
  },
  {
    group: "Configurações",
    items: [
      { title: "WhatsApp", href: "/settings/whatsapp", icon: Smartphone },
      { title: "Filiais", href: "/settings/branches", icon: Building2 },
      { title: "Departamentos", href: "/settings/departments", icon: Layers },
      { title: "Categorias", href: "/settings/categories", icon: Tags },
      { title: "Mensagens Automáticas", href: "/settings/messages", icon: MessageSquare },
      { title: "Respostas Prontas", href: "/settings/canned-responses", icon: MessageCircleCode },
      { title: "Usuários", href: "/settings/usuarios", icon: UserCheck },
      { title: "Papéis e Permissões", href: "/settings/roles", icon: ShieldCheck },
      { title: "Configurações do Sistema", href: "/settings/sistema", icon: KeyRound },
      { title: "Auditoria", href: "/settings/audit", icon: ClipboardList },
    ],
  },
  {
    group: "Fornecedores",
    items: [
      { title: "Conversas de Fornecedores", href: "/supplier-conversations", icon: Package },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  supervisor: "Supervisor",
  technician: "Analista",
  attendant: "Analista",
};

const STATUS_COLORS: Record<string, string> = {
  open: "text-blue-500",
  in_progress: "text-amber-500",
  closed: "text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Atendimento",
  closed: "Fechado",
};

const ACTION_LABELS: Record<string, string> = {
  opened: "Chamado aberto",
  assigned: "Atribuído",
  status_changed: "Status alterado",
  replied: "Resposta enviada",
  note_added: "Nota interna",
  closed: "Fechado",
};

// ─── Quick Ticket Switcher ─────────────────────────────────────────────────────
function QuickTicketSwitcher() {
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.listTickets({ status: "not_closed", limit: 50 });
      setTickets(res.tickets ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const STATUS_DOT: Record<string, string> = {
    open: "bg-blue-500",
    in_progress: "bg-amber-500",
    closed: "bg-slate-400",
  };
  const STATUS_LBL: Record<string, string> = {
    open: "Aberto",
    in_progress: "Em Atend.",
  };

  const open_tickets = tickets.filter(t => t.status === "open");
  const inprog_tickets = tickets.filter(t => t.status === "in_progress");
  const total = tickets.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-full shadow-lg border text-sm font-semibold transition-all ${
          open
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground border-border hover:bg-accent"
        }`}
        title="Troca rápida de chamados"
      >
        <ListTodo className="h-4 w-4" />
        <span className="hidden sm:inline">Chamados</span>
        {total > 0 && (
          <span className={`h-5 min-w-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${open ? "bg-white/20 text-white" : "bg-primary text-primary-foreground"}`}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 sm:w-96 max-h-[70vh] border rounded-xl shadow-2xl bg-popover flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Chamados Ativos</span>
              <span className="text-xs text-muted-foreground">({total})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={load}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1"
                title="Atualizar"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "↻"}
              </button>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loading && tickets.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                Carregando…
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Nenhum chamado ativo.</div>
            ) : (
              <div>
                {[
                  { label: `Em Atendimento (${inprog_tickets.length})`, color: "text-amber-600 dark:text-amber-400", items: inprog_tickets },
                  { label: `Abertos (${open_tickets.length})`, color: "text-blue-600 dark:text-blue-400", items: open_tickets },
                ].map(group => (
                  group.items.length > 0 && (
                    <div key={group.label}>
                      <div className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide ${group.color} bg-muted/20 border-b`}>
                        {group.label}
                      </div>
                      {group.items.map(ticket => (
                        <button
                          key={ticket.id}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b last:border-b-0"
                          onClick={() => { navigate(`/tickets/${ticket.id}`); setOpen(false); }}
                        >
                          <div className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[ticket.status] ?? "bg-slate-400"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-primary">#{ticket.ticketNumber}</span>
                              <span className="text-[10px] text-muted-foreground">{STATUS_LBL[ticket.status] ?? ticket.status}</span>
                            </div>
                            <div className="text-xs text-foreground truncate font-medium">
                              {ticket.clientName || "—"}
                            </div>
                            {ticket.categoryName && (
                              <div className="text-[10px] text-muted-foreground truncate">{ticket.categoryName}</div>
                            )}
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  )
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/20">
            <span className="text-[10px] text-muted-foreground">Abertos: {open_tickets.length} · Em Atend.: {inprog_tickets.length}</span>
            <button
              className="text-[10px] text-primary hover:underline font-medium"
              onClick={() => { navigate("/tickets"); setOpen(false); }}
            >
              Ver todos →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentActivity[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() =>
    parseInt(localStorage.getItem("notif_last_seen") || "0")
  );
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    API.getDashboardRecent().then(setItems).catch(() => {});
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unseen = items.filter(i => new Date(i.createdAt).getTime() > lastSeen).length;

  const handleOpen = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      const now = Date.now();
      setLastSeen(now);
      localStorage.setItem("notif_last_seen", String(now));
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="relative h-8 w-8" onClick={handleOpen}>
        <Bell className="h-4 w-4" />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white font-bold flex items-center justify-center">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 border rounded-xl shadow-xl bg-popover z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">Notificações</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="max-h-80">
            {items.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Sem atividades recentes.</div>
            ) : (
              <div className="divide-y">
                {items.slice(0, 15).map(item => (
                  <Link key={item.id} href={`/tickets/${item.ticketId}`} onClick={() => setOpen(false)}>
                    <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-start gap-2">
                        <Circle className={`h-2 w-2 mt-1.5 shrink-0 fill-current ${STATUS_COLORS[item.status] ?? "text-slate-400"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-primary">#{item.ticketNumber}</span>
                            <span className="text-xs text-muted-foreground">{ACTION_LABELS[item.action] ?? item.action}</span>
                          </div>
                          {item.clientName && (
                            <div className="text-xs text-muted-foreground truncate">{item.clientName}</div>
                          )}
                          {item.detail && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">{item.detail}</div>
                          )}
                          <div className="text-[10px] text-muted-foreground/60 mt-1">
                            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

interface SearchResult {
  id: number;
  ticketNumber: string;
  clientName: string | null;
  whatsappPhone: string;
  status: string;
  branchName: string | null;
}

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); return; }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return; }
    const timeout = setTimeout(() => {
      setLoading(true);
      API.listTickets({ search: query, limit: 8, page: 1 })
        .then(d => setResults(d.tickets as any))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const go = (id: number) => {
    navigate(`/tickets/${id}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(v => !v)}>
        <Search className="h-4 w-4" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 border rounded-xl shadow-xl bg-popover z-50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Buscar chamados, clientes..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setQuery("")}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {query.length >= 2 ? (
            <ScrollArea className="max-h-72">
              {loading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Buscando...</div>
              ) : results.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
              ) : (
                <div className="divide-y">
                  {results.map(r => (
                    <button
                      key={r.id}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                      onClick={() => go(r.id)}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-primary">#{r.ticketNumber}</span>
                        <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${STATUS_COLORS[r.status] ?? ""}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </div>
                      <div className="text-sm font-medium truncate">{r.clientName || "Desconhecido"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.whatsappPhone}{r.branchName ? ` · ${r.branchName}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Digite para pesquisar chamados...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamPanel() {
  const [users, setUsers] = useState<Array<{ id: number; name: string; role: string; active: boolean }>>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    API.listUsers().then(u => setUsers(u.filter(x => x.active))).catch(() => {});
  }, []);

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <Users2 className="h-3.5 w-3.5" />
        Equipe
        <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 mt-1">
          {users.length === 0 && (
            <div className="text-xs text-sidebar-foreground/40 px-3 py-1">Sem usuários ativos.</div>
          )}
          {users.slice(0, 8).map(u => (
            <div key={u.id} className="flex items-center gap-2 px-3 py-1.5 rounded-md">
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                {getInitials(u.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-sidebar-foreground truncate">{u.name}</div>
                <div className="text-[10px] text-sidebar-foreground/40">{ROLE_LABELS[u.role] ?? u.role}</div>
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Ativo" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  // Password change dialog state
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleOpenPw = () => {
    setPwCurrent(""); setPwNew(""); setPwConfirm("");
    setPwError(""); setPwSuccess(false);
    setPwOpen(true);
  };

  const handleChangePw = async () => {
    setPwError("");
    if (!pwCurrent || !pwNew || !pwConfirm) { setPwError("Preencha todos os campos."); return; }
    if (pwNew.length < 4) { setPwError("A nova senha deve ter pelo menos 4 caracteres."); return; }
    if (pwNew !== pwConfirm) { setPwError("As senhas não coincidem."); return; }
    setPwLoading(true);
    try {
      await API.changePassword(pwCurrent, pwNew);
      setPwSuccess(true);
      setTimeout(() => setPwOpen(false), 1500);
    } catch (e: any) {
      setPwError(e?.message ?? "Erro ao alterar senha.");
    } finally {
      setPwLoading(false);
    }
  };

  const NavContent = () => (
    <div className="flex flex-col gap-4 py-6 px-4 h-full">
      <div className="flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Ticket className="h-5 w-5" />
        </div>
        <span className="text-xl font-bold tracking-tight">Support Hub</span>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        {(() => {
          const isAnalyst = user && ["technician", "attendant"].includes(user.role);
          const isManagerOrAdmin = user && ["admin", "manager"].includes(user.role);
          const visible = isAnalyst
            ? [{ group: "Principal", items: navItems[0].items.filter(i => i.href === "/home" || i.href === "/tickets") }]
            : navItems.filter(g => g.group !== "Fornecedores" || isManagerOrAdmin);
          return visible.map((group) => (
            <div key={group.group} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase text-sidebar-foreground/50 px-2">
                {group.group}
              </span>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = location === item.href || (item.href !== "/" && item.href !== "/home" && location.startsWith(item.href)) || (item.href === "/home" && location === "/home");
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                      <div className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      }`}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.title}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ));
        })()}

        {user && !["technician", "attendant"].includes(user.role) && (
          <div className="border-t border-sidebar-border pt-3">
            <TeamPanel />
          </div>
        )}
      </div>

      {user && (
        <div className="border-t border-sidebar-border pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sidebar-accent/50 transition-colors text-left">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                  {getInitials(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</div>
                  <div className="text-xs text-sidebar-foreground/50">{ROLE_LABELS[user.role] ?? user.role}</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/50 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-3 py-2">
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={handleOpenPw}>
                <KeyRound className="h-4 w-4 mr-2" /> Trocar Senha
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive cursor-pointer" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
        <ScrollArea className="flex-1">
          <NavContent />
        </ScrollArea>
      </aside>

      {/* Quick Ticket Switcher — floating button always visible */}
      <QuickTicketSwitcher />

      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-2 border-b bg-background px-4 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
              <ScrollArea className="h-full">
                <NavContent />
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 font-semibold flex-1">
            <Ticket className="h-5 w-5 text-primary" />
            <span>Support Hub</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <GlobalSearch />
            <NotificationBell />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                      {getInitials(user.name)}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-3 py-2">
                    <div className="text-sm font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={handleOpenPw}>
                    <KeyRound className="h-4 w-4 mr-2" /> Trocar Senha
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive cursor-pointer" onClick={logout}>
                    <LogOut className="h-4 w-4 mr-2" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="hidden lg:flex h-12 items-center gap-2 border-b bg-background/95 backdrop-blur px-6 justify-end">
          <GlobalSearch />
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-auto bg-muted/30">
          {children}
        </main>
      </div>

      {/* Change password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Trocar Senha
            </DialogTitle>
          </DialogHeader>
          {pwSuccess ? (
            <div className="py-6 text-center">
              <p className="text-green-600 font-medium">Senha alterada com sucesso!</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="pw-current">Senha atual</Label>
                <Input id="pw-current" type="password" value={pwCurrent}
                  onChange={e => setPwCurrent(e.target.value)} placeholder="Digite a senha atual" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-new">Nova senha</Label>
                <Input id="pw-new" type="password" value={pwNew}
                  onChange={e => setPwNew(e.target.value)} placeholder="Mínimo 4 caracteres" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-confirm">Confirmar nova senha</Label>
                <Input id="pw-confirm" type="password" value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)} placeholder="Repita a nova senha"
                  onKeyDown={e => e.key === "Enter" && handleChangePw()} />
              </div>
              {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            </div>
          )}
          {!pwSuccess && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setPwOpen(false)} disabled={pwLoading}>Cancelar</Button>
              <Button onClick={handleChangePw} disabled={pwLoading}>
                {pwLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Alterar Senha
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
