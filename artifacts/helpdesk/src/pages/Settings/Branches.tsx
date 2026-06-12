import { useListBranches, useCreateBranch, useUpdateBranch, useDeleteBranch, getListBranchesQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Edit2, Check, X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function Branches() {
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useListBranches();
  
  const createMutation = useCreateBranch();
  const updateMutation = useUpdateBranch();
  const deleteMutation = useDeleteBranch();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSave = (id: number) => {
    updateMutation.mutate({ id, data: { name: editName } }, {
      onSuccess: () => {
        setEditingId(null);
        queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
      }
    });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({ data: { name: newName, active: true } }, {
      onSuccess: () => {
        setIsAdding(false);
        setNewName("");
        queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
      }
    });
  };

  const handleToggleActive = (id: number, currentName: string, active: boolean) => {
    updateMutation.mutate({ id, data: { name: currentName, active } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() })
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta filial?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() })
      });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Filiais</h1>
          <p className="text-muted-foreground">Gerencie as unidades físicas para o suporte de TI.</p>
        </div>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus className="h-4 w-4 mr-2" /> Adicionar Filial
        </Button>
      </div>

      <div className="border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-32 text-center">Ativo</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isAdding && (
              <TableRow className="bg-muted/30">
                <TableCell className="text-center text-muted-foreground">-</TableCell>
                <TableCell>
                  <Input 
                    autoFocus
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)} 
                    placeholder="Nome da filial..."
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setIsAdding(false); }}
                  />
                </TableCell>
                <TableCell className="text-center">-</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="icon" variant="ghost" className="text-emerald-600 h-8 w-8" onClick={handleCreate} disabled={!newName.trim()}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => setIsAdding(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )}
            
            {branches?.map((branch) => (
              <TableRow key={branch.id}>
                <TableCell className="text-center text-muted-foreground">{branch.id}</TableCell>
                <TableCell>
                  {editingId === branch.id ? (
                    <Input 
                      autoFocus
                      value={editName} 
                      onChange={(e) => setEditName(e.target.value)} 
                      onKeyDown={(e) => { if (e.key === "Enter") handleSave(branch.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                  ) : (
                    <span className="font-medium">{branch.name}</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Switch 
                    checked={branch.active} 
                    onCheckedChange={(v) => handleToggleActive(branch.id, branch.name, v)}
                    disabled={editingId === branch.id}
                  />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {editingId === branch.id ? (
                    <>
                      <Button size="icon" variant="ghost" className="text-emerald-600 h-8 w-8" onClick={() => handleSave(branch.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8" 
                        onClick={() => { setEditingId(branch.id); setEditName(branch.name); }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" 
                        onClick={() => handleDelete(branch.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            
            {!isLoading && branches?.length === 0 && !isAdding && (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                  Nenhuma filial cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
