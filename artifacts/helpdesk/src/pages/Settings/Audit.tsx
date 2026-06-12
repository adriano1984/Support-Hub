import { useState, useEffect, useCallback } from "react";
import { API, type AuditEntry } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardList, Search, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { formatDateBR } from "@/lib/utils";

const ACTION_COLORS: Record<string, string> = {
  ticket_opened: "bg-green-500",
  status_changed: "bg-blue-500",
  assigned: "bg-purple-500",
  reply: "bg-sky-500",
  note_added: "bg-yellow-500",
  user_created: "bg-emerald-500",
  user_updated: "bg-amber-500",
  user_deleted: "bg-rose-500",
  role_created: "bg-indigo-500",
  role_updated: "bg-violet-500",
  role_deleted: "bg-red-500",
  canned_response_created: "bg-teal-500",
  canned_response_updated: "bg-cyan-500",
  canned_response_deleted: "bg-orange-500",
};

const ACTION_LABELS: Record<string, string> = {
  ticket_opened: "Chamado aberto",
  status_changed: "Status alterado",
  assigned: "Atribuição",
  reply: "Resposta enviada",
  note_added: "Nota interna",
  user_created: "Usuário criado",
  user_updated: "Usuário atualizado",
  user_deleted: "Usuário excluído",
  role_created: "Papel criado",
  role_updated: "Papel atualizado",
  role_deleted: "Papel excluído",
  canned_response_created: "Resposta criada",
  canned_response_updated: "Resposta atualizada",
  canned_response_deleted: "Resposta excluída",
};

const ENTITY_LABELS: Record<string, string> = {
  tickets: "Chamados",
  users: "Usuários",
  roles_config: "Papéis",
  canned_responses: "Respostas Prontas",
};

const PAGE_SIZE = 50;

export default function Audit() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await API.listAudit({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        user: filterUser || undefined,
        action: filterAction !== "all" ? filterAction : undefined,
        entity: filterEntity !== "all" ? filterEntity : undefined,
      });
      setEntries(result.rows);
      setTotal(result.total);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [page, filterUser, filterAction, filterEntity]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = () => { setPage(0); load(); };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Auditoria do Sistema
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro de todas as ações realizadas no sistema. Total: {total.toLocaleString("pt-BR")} eventos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filtrar por usuário..." className="pl-9" value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()} />
        </div>
        <Select value={filterAction} onValueChange={v => { setFilterAction(v); setPage(0); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterEntity} onValueChange={v => { setFilterEntity(v); setPage(0); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Entidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as entidades</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Nenhum evento encontrado.</p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data/Hora</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ação</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Entidade</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateBR(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.userName ? (
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                            {entry.userName.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-xs">{entry.userName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sistema</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${ACTION_COLORS[entry.action] ?? "bg-slate-500"} text-white text-xs`}>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {entry.entity ? (
                        <span>{ENTITY_LABELS[entry.entity] ?? entry.entity}{entry.entityId ? ` #${entry.entityId}` : ""}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground max-w-xs truncate">
                      {entry.detail ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {totalPages} · {total.toLocaleString("pt-BR")} eventos
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
