import { useState, useEffect, useCallback } from "react";
import { API, type Ticket } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateBR } from "@/lib/utils";
import {
  Search, ChevronLeft, ChevronRight, Filter, X, Star,
  UserCircle2, AlertTriangle, Clock
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useTicketNavigation } from "@/contexts/TicketNavigationContext";

interface FilterState {
  status: string;
  branchId: string;
  departmentId: string;
  categoryId: string;
  assignedTo: string;
}

const EMPTY_FILTERS: FilterState = {
  status: "all",
  branchId: "all",
  departmentId: "all",
  categoryId: "all",
  assignedTo: "all",
};

type QuickFilter = "mine" | "awaiting" | "favorites" | null;

function getSlaStatus(ticket: Ticket): "ok" | "warning" | "overdue" {
  if (ticket.status === "resolved" || ticket.status === "closed") return "ok";
  const openHours = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000;
  if (openHours >= 48) return "overdue";
  if (openHours >= 24) return "warning";
  return "ok";
}

function SlaBadge({ ticket }: { ticket: Ticket }) {
  const sla = getSlaStatus(ticket);
  if (sla === "ok") return null;
  const openHours = Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 3600000);
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1 py-0 h-4 shrink-0 ${
        sla === "overdue"
          ? "text-red-600 border-red-300 dark:text-red-400 dark:border-red-800"
          : "text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-800"
      }`}
    >
      {sla === "overdue" ? <AlertTriangle className="h-2.5 w-2.5 mr-0.5 inline" /> : <Clock className="h-2.5 w-2.5 mr-0.5 inline" />}
      {openHours}h
    </Badge>
  );
}

function useFavorites() {
  const [favs, setFavs] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem("ticket_favorites");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  const toggle = useCallback((id: number) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("ticket_favorites", JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { favs, toggle };
}

export default function Tickets() {
  const { user } = useAuth();
  const isAnalyst = ["technician", "attendant"].includes(user?.role ?? "");
  const { favs, toggle } = useFavorites();
  const { setTicketIds } = useTicketNavigation();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const [page, setPage] = useState(1);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sseRefresh, setSseRefresh] = useState(0);

  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);

  const LIMIT = 50;

  const activeFilterCount = Object.values(filters).filter(v => v !== "all").length;

  useEffect(() => {
    Promise.all([
      API.listBranches(),
      API.listDepartments(),
      API.listCategories(),
      API.listUsers(),
    ]).then(([b, d, c, u]) => {
      setBranches(b.filter(x => x.active));
      setDepartments(d.filter(x => x.active));
      setCategories(c.filter(x => x.active));
      setUsers(u.filter(x => x.active));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, any> = {
      page,
      limit: LIMIT,
      search: debouncedSearch || undefined,
      // Analysts see all non-closed tickets (open, in_progress, waiting_client, waiting_analyst)
      status: isAnalyst ? "not_closed" : (filters.status !== "all" ? filters.status : undefined),
      branchId: filters.branchId !== "all" ? parseInt(filters.branchId) : undefined,
      departmentId: filters.departmentId !== "all" ? parseInt(filters.departmentId) : undefined,
      categoryId: filters.categoryId !== "all" ? parseInt(filters.categoryId) : undefined,
      assignedTo: filters.assignedTo !== "all" ? parseInt(filters.assignedTo) : undefined,
    };

    if (quickFilter === "mine" && user) params.assignedTo = user.userId;
    if (!isAnalyst && quickFilter === "awaiting") params.status = "open";

    API.listTickets(params)
      .then(data => {
        setTickets(data.tickets);
        setTotal(data.total);
        setTicketIds(data.tickets.map((t: Ticket) => t.id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch, filters, page, quickFilter, user, sseRefresh]);

  // Atualização em tempo real via SSE
  useEffect(() => {
    const handler = () => setSseRefresh(r => r + 1);
    window.addEventListener("sse:ticket:updated", handler);
    window.addEventListener("sse:ticket:new", handler);
    window.addEventListener("sse:message:new", handler);
    return () => {
      window.removeEventListener("sse:ticket:updated", handler);
      window.removeEventListener("sse:ticket:new", handler);
      window.removeEventListener("sse:message:new", handler);
    };
  }, []);

  const setFilter = (key: keyof FilterState, val: string) => {
    setFilters(f => ({ ...f, [key]: val }));
    setQuickFilter(null);
    setPage(1);
  };

  const setQuick = (qf: QuickFilter) => {
    setQuickFilter(prev => prev === qf ? null : qf);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setSearch("");
    setQuickFilter(null);
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT);

  const displayedTickets = quickFilter === "favorites"
    ? tickets.filter(t => favs.has(t.id))
    : tickets;

  const quickButtons: Array<{ key: QuickFilter; label: string; icon: React.ElementType; color: string }> = [
    { key: "mine", label: "Meus Chamados", icon: UserCircle2, color: "text-blue-600 dark:text-blue-400" },
    { key: "awaiting", label: "Aguardando", icon: Clock, color: "text-purple-600 dark:text-purple-400" },
    ...(!isAnalyst ? [{ key: "favorites" as QuickFilter, label: "Favoritos", icon: Star, color: "text-yellow-500 dark:text-yellow-400" }] : []),
  ];

  return (
    <div className="p-6 space-y-4 flex flex-col h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3rem)]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chamados</h1>
          <p className="text-muted-foreground text-sm">
            {total > 0 ? `${total} chamado${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}` : "Gerencie as solicitações de suporte."}
          </p>
        </div>
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 shrink-0">
        {quickButtons.map(qb => {
          const Icon = qb.icon;
          const isActive = quickFilter === qb.key;
          return (
            <button
              key={qb.key}
              onClick={() => setQuick(qb.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? "" : qb.color}`} />
              {qb.label}
              {qb.key === "favorites" && favs.size > 0 && (
                <span className={`ml-0.5 rounded-full px-1 text-[10px] font-bold ${isActive ? "bg-white/20" : "bg-muted"}`}>
                  {favs.size}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar chamados..."
              className="pl-9 h-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {!isAnalyst && (
            <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
              <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="not_closed">Ativos (não encerrados)</SelectItem>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="in_progress">Em Atendimento</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
              </SelectContent>
            </Select>
          )}

          {!isAnalyst && (
            <Select value={filters.branchId} onValueChange={v => setFilter("branchId", v)}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Filial" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filiais</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {!isAnalyst && (
            <Select value={filters.departmentId} onValueChange={v => setFilter("departmentId", v)}>
              <SelectTrigger className="w-[155px] h-9"><SelectValue placeholder="Departamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os depto.</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {!isAnalyst && (
            <Select value={filters.categoryId} onValueChange={v => setFilter("categoryId", v)}>
              <SelectTrigger className="w-[145px] h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categ.</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {(activeFilterCount > 0 || search || quickFilter) && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 gap-1 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              Limpar
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{activeFilterCount}</Badge>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-md bg-card flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-24">Chamado</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead className="hidden md:table-cell">Filial</TableHead>
                <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Abertura</TableHead>
                <TableHead className="hidden md:table-cell">Última msg.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full max-w-[120px]" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : displayedTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    <Filter className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Nenhum chamado encontrado com os filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : (
                displayedTickets.map((ticket) => {
                  const isFav = favs.has(ticket.id);
                  return (
                    <TableRow key={ticket.id} className="cursor-pointer hover:bg-muted/50 transition-colors group">
                      <TableCell className="pr-0">
                        <button
                          onClick={e => { e.preventDefault(); toggle(ticket.id); }}
                          className={`p-1 rounded transition-colors ${isFav ? "text-yellow-500" : "text-muted-foreground/30 hover:text-yellow-400 opacity-0 group-hover:opacity-100"}`}
                          title={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        >
                          <Star className="h-3.5 w-3.5" fill={isFav ? "currentColor" : "none"} />
                        </button>
                      </TableCell>
                      <TableCell>
                        <Link href={`/tickets/${ticket.id}`} className="block font-medium text-primary">
                          #{ticket.ticketNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/tickets/${ticket.id}`} className="block">
                          <div className="font-medium text-sm">{ticket.clientName || "Desconhecido"}</div>
                          <div className="text-xs text-muted-foreground">{ticket.whatsappPhone}</div>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Link href={`/tickets/${ticket.id}`} className="block text-sm text-muted-foreground">
                          {ticket.branchName || "-"}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Link href={`/tickets/${ticket.id}`} className="block text-sm text-muted-foreground">
                          {ticket.categoryName || "-"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/tickets/${ticket.id}`} className="block">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <StatusBadge status={ticket.status as any} />
                            {ticket.reopenCount > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300">
                                ↺{ticket.reopenCount}
                              </Badge>
                            )}
                            <SlaBadge ticket={ticket} />
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Link href={`/tickets/${ticket.id}`} className="block text-sm text-muted-foreground">
                          {formatDateBR(ticket.createdAt, false)}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Link href={`/tickets/${ticket.id}`} className="block text-sm text-muted-foreground">
                          {ticket.lastMessageAt ? formatDateBR(ticket.lastMessageAt) : "-"}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && quickFilter !== "favorites" && (
          <div className="border-t px-4 py-2 flex items-center justify-between text-sm text-muted-foreground shrink-0">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
