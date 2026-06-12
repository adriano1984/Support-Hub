import { useListDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, getListDepartmentsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Edit2, Check, X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function Departments() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useListDepartments();
  
  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteDepartment();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSave = (id: number) => {
    updateMutation.mutate({ id, data: { name: editName } }, {
      onSuccess: () => {
        setEditingId(null);
        queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
      }
    });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({ data: { name: newName, active: true } }, {
      onSuccess: () => {
        setIsAdding(false);
        setNewName("");
        queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
      }
    });
  };

  const handleToggleActive = (id: number, currentName: string, active: boolean) => {
    updateMutation.mutate({ id, data: { name: currentName, active } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() })
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este departamento?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() })
      });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Departamentos</h1>
          <p className="text-muted-foreground">Gerencie os departamentos da organização.</p>
        </div>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus className="h-4 w-4 mr-2" /> Adicionar Departamento
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
                    placeholder="Nome do departamento..."
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
            
            {items?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-center text-muted-foreground">{item.id}</TableCell>
                <TableCell>
                  {editingId === item.id ? (
                    <Input 
                      autoFocus
                      value={editName} 
                      onChange={(e) => setEditName(e.target.value)} 
                      onKeyDown={(e) => { if (e.key === "Enter") handleSave(item.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                  ) : (
                    <span className="font-medium">{item.name}</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Switch 
                    checked={item.active} 
                    onCheckedChange={(v) => handleToggleActive(item.id, item.name, v)}
                    disabled={editingId === item.id}
                  />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {editingId === item.id ? (
                    <>
                      <Button size="icon" variant="ghost" className="text-emerald-600 h-8 w-8" onClick={() => handleSave(item.id)}>
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
                        onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" 
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            
            {!isLoading && items?.length === 0 && !isAdding && (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                  Nenhum departamento cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
