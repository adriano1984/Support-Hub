import { useState, useEffect } from "react";
import { API, type Role } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, ShieldCheck, Lock } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

const SCOPE_LABELS: Record<string, string> = {
  all: "Ver todos os chamados",
  sector: "Ver chamados do setor",
  team: "Ver chamados da equipe",
  own: "Ver apenas meus chamados",
};

const PERMISSION_SECTIONS = [
  {
    key: "users",
    label: "Usuários",
    items: [
      { key: "create", label: "Criar" },
      { key: "edit", label: "Editar" },
      { key: "delete", label: "Excluir" },
      { key: "block", label: "Bloquear" },
      { key: "resetPassword", label: "Resetar senha" },
    ],
  },
  {
    key: "tickets",
    label: "Chamados",
    items: [
      { key: "view", label: "Visualizar" },
      { key: "create", label: "Criar" },
      { key: "edit", label: "Editar" },
      { key: "assign", label: "Assumir" },
      { key: "transfer", label: "Transferir" },
      { key: "close", label: "Encerrar" },
      { key: "reopen", label: "Reabrir" },
      { key: "delete", label: "Excluir" },
    ],
  },
  {
    key: "conversations",
    label: "Conversas",
    items: [
      { key: "viewHistory", label: "Ver histórico completo" },
      { key: "viewInternal", label: "Ver mensagens internas" },
      { key: "addNotes", label: "Adicionar notas internas" },
    ],
  },
  {
    key: "reports",
    label: "Relatórios",
    items: [
      { key: "view", label: "Visualizar" },
      { key: "exportPdf", label: "Exportar PDF" },
      { key: "exportExcel", label: "Exportar Excel" },
    ],
  },
  {
    key: "settings",
    label: "Configurações",
    items: [
      { key: "view", label: "Visualizar" },
      { key: "edit", label: "Editar" },
    ],
  },
];

const SCOPE_OPTIONS = [
  { value: "all", label: "Todos os chamados" },
  { value: "sector", label: "Chamados do setor" },
  { value: "team", label: "Chamados da equipe" },
  { value: "own", label: "Apenas meus chamados" },
];

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: "bg-red-500",
  manager: "bg-purple-500",
  supervisor: "bg-blue-500",
  technician: "bg-green-500",
  attendant: "bg-amber-500",
};

interface FormState {
  label: string;
  name: string;
  permissions: Record<string, any>;
}

const defaultPermissions = () => ({
  users: { create: false, edit: false, delete: false, block: false, resetPassword: false },
  tickets: { view: true, create: true, edit: false, assign: false, transfer: false, close: false, reopen: false, delete: false },
  conversations: { viewHistory: true, viewInternal: false, addNotes: false },
  reports: { view: false, exportPdf: false, exportExcel: false },
  settings: { view: false, edit: false },
  scope: "own",
});

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState<FormState>({ label: "", name: "", permissions: defaultPermissions() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try { setRoles(await API.listRoles()); }
    catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingRole(null);
    setForm({ label: "", name: "", permissions: defaultPermissions() });
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (r: Role) => {
    setEditingRole(r);
    setForm({ label: r.label, name: r.name, permissions: { ...defaultPermissions(), ...r.permissions } });
    setError("");
    setDialogOpen(true);
  };

  const setPermission = (section: string, key: string, value: boolean) => {
    setForm(f => ({
      ...f,
      permissions: {
        ...f.permissions,
        [section]: { ...f.permissions[section], [key]: value },
      },
    }));
  };

  const handleSave = async () => {
    setError("");
    if (!form.label.trim()) { setError("Nome do papel é obrigatório"); return; }
    if (!editingRole && !form.name.trim()) { setError("Identificador do papel é obrigatório"); return; }
    setSaving(true);
    try {
      if (editingRole) {
        await API.updateRole(editingRole.id, { label: form.label, permissions: form.permissions });
      } else {
        await API.createRole({ name: form.name.trim().toLowerCase().replace(/\s+/g, "_"), label: form.label, permissions: form.permissions });
      }
      setDialogOpen(false);
      load();
      toast({ title: editingRole ? "Papel atualizado" : "Papel criado" });
    } catch (err: any) {
      setError(err.message ?? "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const handleDelete = async (r: Role) => {
    if (r.isSystem) { toast({ title: "Papéis do sistema não podem ser excluídos", variant: "destructive" }); return; }
    if (!confirm(`Excluir o papel "${r.label}"?`)) return;
    try {
      await API.deleteRole(r.id);
      load();
      toast({ title: "Papel excluído" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Papéis e Permissões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle o que cada perfil de usuário pode acessar e fazer no sistema.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Papel
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4">
          {roles.map(role => (
            <div key={role.id} className="border rounded-lg bg-card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 mb-3">
                  <Badge className={`${ROLE_BADGE_COLORS[role.name] ?? "bg-slate-500"} text-white`}>
                    {role.label}
                  </Badge>
                  {role.isSystem && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Sistema
                    </span>
                  )}
                  <span className="text-xs font-mono text-muted-foreground">{role.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(role)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {!role.isSystem && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(role)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Scope */}
              <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <span className="font-medium text-foreground">Visibilidade:</span>
                {SCOPE_LABELS[role.permissions?.scope ?? "own"] ?? role.permissions?.scope ?? "—"}
              </div>

              {/* Permissions summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                {PERMISSION_SECTIONS.map(section => {
                  const perms = role.permissions?.[section.key] ?? {};
                  const active = section.items.filter(i => perms[i.key]).length;
                  return (
                    <div key={section.key} className="bg-muted/50 rounded px-2 py-1.5">
                      <div className="font-medium mb-1">{section.label}</div>
                      <div className="text-muted-foreground">{active}/{section.items.length} permissões</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? `Editar: ${editingRole.label}` : "Novo Papel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome do Papel</Label>
                <Input className="mt-1" placeholder="Ex: Supervisor N2" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
              </div>
              {!editingRole && (
                <div>
                  <Label>Identificador <span className="text-muted-foreground text-xs">(único, sem espaços)</span></Label>
                  <Input className="mt-1 font-mono" placeholder="supervisor_n2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm">Visibilidade de Chamados</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {SCOPE_OPTIONS.map(opt => (
                  <button key={opt.value}
                    onClick={() => setForm(f => ({ ...f, permissions: { ...f.permissions, scope: opt.value } }))}
                    className={`text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                      form.permissions.scope === opt.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {PERMISSION_SECTIONS.map(section => (
              <div key={section.key}>
                <Label className="text-sm font-semibold">{section.label}</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                  {section.items.map(item => (
                    <div key={item.key} className="flex items-center gap-2">
                      <Switch
                        checked={!!(form.permissions[section.key]?.[item.key])}
                        onCheckedChange={v => setPermission(section.key, item.key, v)}
                        id={`${section.key}-${item.key}`}
                      />
                      <Label htmlFor={`${section.key}-${item.key}`} className="text-sm font-normal cursor-pointer">
                        {item.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
