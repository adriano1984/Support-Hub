import { useState, useEffect } from "react";
import { API, type CannedResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, Copy, MessageCircleCode, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_COLORS: Record<string, string> = {
  "Saudação": "bg-green-500",
  "Atendimento": "bg-blue-500",
  "Suporte Técnico": "bg-purple-500",
  "Financeiro": "bg-amber-500",
  "Encerramento": "bg-rose-500",
};

const DEFAULT_CATEGORIES = ["Saudação", "Atendimento", "Suporte Técnico", "Financeiro", "Encerramento", "Personalizado"];

const VARIABLES = ["{nome_cliente}", "{nome_atendente}", "{numero_chamado}", "{departamento}", "{data}", "{hora}"];

interface FormData {
  category: string;
  title: string;
  content: string;
  active: boolean;
}

export default function CannedResponses() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ category: "Atendimento", title: "", content: "", active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [res, cats] = await Promise.all([API.listCannedResponses(), API.listCannedCategories()]);
      setResponses(res);
      setCategories(cats);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ category: "Atendimento", title: "", content: "", active: true });
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (r: CannedResponse) => {
    setEditingId(r.id);
    setForm({ category: r.category, title: r.title, content: r.content, active: r.active });
    setError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setError("");
    if (!form.title.trim()) { setError("Título é obrigatório"); return; }
    if (!form.content.trim()) { setError("Conteúdo é obrigatório"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await API.updateCannedResponse(editingId, form);
      } else {
        await API.createCannedResponse(form);
      }
      setDialogOpen(false);
      load();
      toast({ title: editingId ? "Resposta atualizada" : "Resposta criada" });
    } catch (err: any) {
      setError(err.message ?? "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const handleDelete = async (r: CannedResponse) => {
    if (!confirm(`Excluir "${r.title}"?`)) return;
    try {
      await API.deleteCannedResponse(r.id);
      load();
      toast({ title: "Resposta excluída" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  const handleDuplicate = async (r: CannedResponse) => {
    try {
      await API.duplicateCannedResponse(r);
      load();
      toast({ title: "Resposta duplicada", description: `"Cópia de ${r.title}" criada.` });
    } catch (err: any) {
      toast({ title: "Erro ao duplicar", description: err.message, variant: "destructive" });
    }
  };

  const insertVariable = (v: string) => {
    setForm(f => ({ ...f, content: f.content + v }));
  };

  const filtered = responses.filter(r => {
    const matchCat = filterCategory === "all" || r.category === filterCategory;
    const q = search.toLowerCase();
    const matchSearch = !q || r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const grouped = filtered.reduce<Record<string, CannedResponse[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircleCode className="h-6 w-6 text-primary" />
            Respostas Prontas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Respostas rápidas para atendentes. Use variáveis como {"{nome_cliente}"} para personalizar.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nova Resposta
        </Button>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar respostas..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircleCode className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Nenhuma resposta encontrada.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={`${CATEGORY_COLORS[cat] ?? "bg-slate-500"} text-white text-xs`}>{cat}</Badge>
                <span className="text-xs text-muted-foreground">{items.length} resposta{items.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid gap-3">
                {items.map(r => (
                  <div key={r.id} className={`border rounded-lg p-4 bg-card transition-opacity ${!r.active ? "opacity-50" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm mb-1">{r.title}</div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{r.content}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Duplicar" onClick={() => handleDuplicate(r)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir" onClick={() => handleDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Resposta" : "Nova Resposta Pronta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  {categories.filter(c => !DEFAULT_CATEGORIES.includes(c)).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Título</Label>
              <Input className="mt-1" placeholder="Ex: Boas-vindas ao atendimento" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Conteúdo</Label>
                <div className="flex gap-1 flex-wrap justify-end">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => insertVariable(v)}
                      className="text-[10px] font-mono bg-muted hover:bg-muted/80 px-1.5 py-0.5 rounded border text-muted-foreground hover:text-foreground transition-colors">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                className="mt-1 min-h-[120px]"
                placeholder="Texto da resposta pronta..."
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">Clique nas variáveis acima para inserir automaticamente.</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} id="active-sw" />
              <Label htmlFor="active-sw">Ativa</Label>
            </div>
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
