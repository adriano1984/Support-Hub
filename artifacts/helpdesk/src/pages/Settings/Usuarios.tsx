import { useState, useEffect } from "react";
import { API, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, UserCheck, KeyRound, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "manager", label: "Gestor" },
  { value: "supervisor", label: "Supervisor" },
  { value: "attendant", label: "Analista" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-500",
  manager: "bg-purple-500",
  supervisor: "bg-blue-500",
  technician: "bg-blue-500",
  attendant: "bg-blue-500",
};

const ROLE_DISPLAY: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  supervisor: "Supervisor",
  technician: "Analista",
  attendant: "Analista",
};

interface FormData {
  name: string;
  role: string;
  password: string;
}

export default function Usuarios() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormData>({ name: "", role: "attendant", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [pwdDialogOpen, setPwdDialogOpen] = useState(false);
  const [pwdUser, setPwdUser] = useState<User | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = me?.role === "admin" || me?.role === "manager";

  const load = () => {
    setLoading(true);
    API.listUsers().then(setUsers).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ name: "", role: "attendant", password: "" });
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({ name: user.name, role: user.role, password: "" });
    setError("");
    setDialogOpen(true);
  };

  const openPassword = (user: User) => {
    setPwdUser(user);
    setNewPwd("");
    setPwdError("");
    setPwdDialogOpen(true);
  };

  const openDelete = (user: User) => {
    setDeletingUser(user);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) { setError("Nome é obrigatório"); return; }
    if (!editingUser && !form.password.trim()) { setError("Senha é obrigatória para novos usuários"); return; }
    setSaving(true);
    try {
      if (editingUser) {
        const data: any = { name: form.name, role: form.role };
        if (form.password.trim()) data.password = form.password;
        await API.updateUser(editingUser.id, data);
      } else {
        await API.createUser({ name: form.name, role: form.role, password: form.password });
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      setError(err.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPwdError("");
    if (!newPwd.trim() || newPwd.trim().length < 4) {
      setPwdError("Senha deve ter pelo menos 4 caracteres"); return;
    }
    setPwdSaving(true);
    try {
      await API.updateUser(pwdUser!.id, { password: newPwd.trim() });
      setPwdDialogOpen(false);
    } catch (err: any) {
      setPwdError(err.message ?? "Erro ao alterar senha");
    } finally {
      setPwdSaving(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await API.updateUser(user.id, { active: !user.active });
      load();
    } catch {}
  };

  const handleDelete = async (hard: boolean) => {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      await API.deleteUser(deletingUser.id, hard);
      setDeleteDialogOpen(false);
      load();
    } catch (err: any) {
      alert(err.message ?? "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie técnicos, atendentes, supervisores e gestores.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar Usuário
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <table className="w-full">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Perfil</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Ativo</th>
                {canManage && <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`${ROLE_COLORS[user.role] ?? "bg-gray-500"} text-white text-xs`}>
                      {ROLE_DISPLAY[user.role] ?? user.roleLabel}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={user.active}
                      onCheckedChange={() => canManage && handleToggleActive(user)}
                      disabled={!canManage || user.id === me?.userId}
                    />
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Alterar senha" onClick={() => openPassword(user)}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        {user.id !== me?.userId && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir" onClick={() => openDelete(user)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    Nenhum usuário cadastrado. Crie o primeiro acima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Create / Edit dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="Nome completo"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil *</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!editingUser && (
              <div className="space-y-1.5">
                <Label>Senha *</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Change password dialog ─── */}
      <Dialog open={pwdDialogOpen} onOpenChange={setPwdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Alterar Senha — {pwdUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nova Senha *</Label>
              <Input
                type="password"
                placeholder="Mínimo 4 caracteres"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handlePasswordChange()}
              />
            </div>
            {pwdError && <p className="text-sm text-destructive">{pwdError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handlePasswordChange} disabled={pwdSaving}>
              {pwdSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Alterar Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation dialog ─── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir Usuário — {deletingUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Escolha como deseja remover este usuário:
            </p>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-sm font-medium">Desativar (recomendado)</p>
              <p className="text-xs text-muted-foreground">O usuário não conseguirá mais fazer login, mas o histórico de chamados é mantido.</p>
            </div>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
              <p className="text-sm font-medium text-destructive">Excluir permanentemente</p>
              <p className="text-xs text-muted-foreground">Remove o usuário do banco de dados. Chamados atribuídos a ele ficam sem responsável. Esta ação não pode ser desfeita.</p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="outline" onClick={() => handleDelete(false)} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desativar"}
            </Button>
            <Button variant="destructive" onClick={() => handleDelete(true)} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir Permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
