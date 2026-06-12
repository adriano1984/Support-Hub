import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Package, Plus, Loader2, Edit, Trash2, ArrowDownCircle, ArrowUpCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StockProduct {
  id: number;
  name: string;
  quantity: number;
  updated_at: string;
}

interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  type: "entrada" | "saida";
  quantity: number;
  notes: string | null;
  created_at: string;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

export default function Inventory() {
  const { toast } = useToast();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [entries, setEntries] = useState<StockMovement[]>([]);
  const [exits, setExits] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Product dialog
  const [productDialog, setProductDialog] = useState(false);
  const [editProduct, setEditProduct] = useState<StockProduct | null>(null);
  const [prodName, setProdName] = useState("");
  const [prodQty, setProdQty] = useState("0");
  const [prodSaving, setProdSaving] = useState(false);

  // Movement dialog
  const [moveDialog, setMoveDialog] = useState(false);
  const [moveTarget, setMoveTarget] = useState<StockProduct | null>(null);
  const [moveType, setMoveType] = useState<"entrada" | "saida">("entrada");
  const [moveQty, setMoveQty] = useState("1");
  const [moveNotes, setMoveNotes] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, ents, exts] = await Promise.all([
        apiFetch<StockProduct[]>("/api/stock"),
        apiFetch<StockMovement[]>("/api/stock/movements?type=entrada"),
        apiFetch<StockMovement[]>("/api/stock/movements?type=saida"),
      ]);
      setProducts(prods);
      setEntries(ents);
      setExits(exts);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openNew = () => {
    setEditProduct(null); setProdName(""); setProdQty("0");
    setProductDialog(true);
  };
  const openEdit = (p: StockProduct) => {
    setEditProduct(p); setProdName(p.name); setProdQty(String(p.quantity));
    setProductDialog(true);
  };

  const saveProduct = async () => {
    if (!prodName.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    setProdSaving(true);
    try {
      if (editProduct) {
        await apiFetch(`/api/stock/${editProduct.id}`, {
          method: "PUT", body: JSON.stringify({ name: prodName.trim() }),
        });
        toast({ title: "Produto atualizado" });
      } else {
        await apiFetch("/api/stock", {
          method: "POST", body: JSON.stringify({ name: prodName.trim(), quantity: parseInt(prodQty) || 0 }),
        });
        toast({ title: "Produto cadastrado" });
      }
      setProductDialog(false); loadAll();
    } catch (e: any) {
      toast({ title: e?.message ?? "Erro ao salvar", variant: "destructive" });
    } finally { setProdSaving(false); }
  };

  const deleteProduct = async (p: StockProduct) => {
    if (!confirm(`Excluir "${p.name}" e todo seu histórico?`)) return;
    try {
      await apiFetch(`/api/stock/${p.id}`, { method: "DELETE" });
      toast({ title: "Produto excluído" }); loadAll();
    } catch { toast({ title: "Erro ao excluir", variant: "destructive" }); }
  };

  const openMove = (p: StockProduct, type: "entrada" | "saida") => {
    setMoveTarget(p); setMoveType(type); setMoveQty("1"); setMoveNotes("");
    setMoveDialog(true);
  };

  const saveMove = async () => {
    if (!moveTarget) return;
    const qty = parseInt(moveQty) || 1;
    setMoveSaving(true);
    try {
      await apiFetch(`/api/stock/${moveTarget.id}/${moveType}`, {
        method: "POST", body: JSON.stringify({ quantity: qty, notes: moveNotes || null }),
      });
      toast({ title: moveType === "entrada" ? `+${qty} unidades adicionadas` : `-${qty} unidades retiradas` });
      setMoveDialog(false); loadAll();
    } catch (e: any) {
      toast({ title: e?.message ?? "Erro ao registrar", variant: "destructive" });
    } finally { setMoveSaving(false); }
  };

  const totalQty = products.reduce((s, p) => s + p.quantity, 0);

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> Estoque
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {products.length} produto{products.length !== 1 ? "s" : ""} · {totalQty} unidades no total
          </p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Novo Produto</Button>
      </div>

      <Tabs defaultValue="estoque">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="estoque" className="font-semibold tracking-wide">ESTOQUE</TabsTrigger>
          <TabsTrigger value="entrada" className="font-semibold tracking-wide text-green-700 dark:text-green-400">ENTRADA</TabsTrigger>
          <TabsTrigger value="saida" className="font-semibold tracking-wide text-blue-700 dark:text-blue-400">SAÍDA</TabsTrigger>
        </TabsList>

        {/* ── ESTOQUE ────────────────────────────────────────────────── */}
        <TabsContent value="estoque">
          <div className="border rounded-lg bg-card overflow-hidden">
            {loading ? (
              <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : products.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                Nenhum produto cadastrado.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-primary text-primary-foreground">
                    <th className="text-left px-5 py-3 font-semibold tracking-wide">EQUIPAMENTO</th>
                    <th className="text-center px-5 py-3 font-semibold tracking-wide">QUANTIDADE</th>
                    <th className="text-center px-5 py-3 font-semibold tracking-wide">DATA</th>
                    <th className="text-right px-5 py-3 font-semibold tracking-wide">AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block min-w-[2.5rem] text-center font-bold text-base ${p.quantity <= 0 ? "text-red-600" : "text-foreground"}`}>
                          {p.quantity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-muted-foreground text-xs">{fmtDate(p.updated_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/40"
                            onClick={() => openMove(p, "entrada")}>
                            <ArrowDownCircle className="h-3.5 w-3.5" /> Entrada
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                            onClick={() => openMove(p, "saida")} disabled={p.quantity <= 0}>
                            <ArrowUpCircle className="h-3.5 w-3.5" /> Saída
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteProduct(p)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ── ENTRADA ────────────────────────────────────────────────── */}
        <TabsContent value="entrada">
          <div className="border rounded-lg bg-card overflow-hidden">
            {entries.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm">Nenhuma entrada registrada.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-green-600 text-white">
                    <th className="text-left px-5 py-3 font-semibold tracking-wide">EQUIPAMENTO</th>
                    <th className="text-center px-5 py-3 font-semibold tracking-wide">QUANTIDADE</th>
                    <th className="text-center px-5 py-3 font-semibold tracking-wide">DATA</th>
                    <th className="text-left px-5 py-3 font-semibold tracking-wide">OBS</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((m, i) => (
                    <tr key={m.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-5 py-3 font-medium">{m.product_name}</td>
                      <td className="px-5 py-3 text-center font-bold text-green-700">{m.quantity}</td>
                      <td className="px-5 py-3 text-center text-muted-foreground text-xs">{fmtDate(m.created_at)}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{m.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ── SAÍDA ──────────────────────────────────────────────────── */}
        <TabsContent value="saida">
          <div className="border rounded-lg bg-card overflow-hidden">
            {exits.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm">Nenhuma saída registrada.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-blue-600 text-white">
                    <th className="text-left px-5 py-3 font-semibold tracking-wide">EQUIPAMENTO</th>
                    <th className="text-center px-5 py-3 font-semibold tracking-wide">QUANTIDADE</th>
                    <th className="text-center px-5 py-3 font-semibold tracking-wide">DATA</th>
                    <th className="text-left px-5 py-3 font-semibold tracking-wide">OBS</th>
                  </tr>
                </thead>
                <tbody>
                  {exits.map((m, i) => (
                    <tr key={m.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-5 py-3 font-medium">{m.product_name}</td>
                      <td className="px-5 py-3 text-center font-bold text-blue-700">{m.quantity}</td>
                      <td className="px-5 py-3 text-center text-muted-foreground text-xs">{fmtDate(m.created_at)}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{m.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Product Dialog ─────────────────────────────────────────────── */}
      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editProduct ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do Equipamento *</Label>
              <Input placeholder="Ex: COMPUTADOR DELL" value={prodName}
                onChange={e => setProdName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveProduct()} />
            </div>
            {!editProduct && (
              <div className="space-y-1.5">
                <Label>Quantidade inicial</Label>
                <Input type="number" min="0" value={prodQty}
                  onChange={e => setProdQty(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialog(false)} disabled={prodSaving}>Cancelar</Button>
            <Button onClick={saveProduct} disabled={prodSaving}>
              {prodSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editProduct ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Movement Dialog ─────────────────────────────────────────────── */}
      <Dialog open={moveDialog} onOpenChange={setMoveDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {moveType === "entrada"
                ? <><ArrowDownCircle className="h-5 w-5 text-green-600" /> Registrar Entrada</>
                : <><ArrowUpCircle className="h-5 w-5 text-blue-600" /> Registrar Saída</>}
            </DialogTitle>
          </DialogHeader>
          {moveTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-muted px-4 py-2.5 text-sm font-medium">{moveTarget.name}</div>
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input type="number" min="1" max={moveType === "saida" ? moveTarget.quantity : undefined}
                  value={moveQty} onChange={e => setMoveQty(e.target.value)} />
                {moveType === "saida" && (
                  <p className="text-xs text-muted-foreground">Disponível em estoque: {moveTarget.quantity}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Input placeholder="Ex: Entrega João Silva" value={moveNotes}
                  onChange={e => setMoveNotes(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveMove()} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog(false)} disabled={moveSaving}>Cancelar</Button>
            <Button onClick={saveMove} disabled={moveSaving}
              className={moveType === "entrada" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}>
              {moveSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {moveType === "entrada" ? "Confirmar Entrada" : "Confirmar Saída"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
