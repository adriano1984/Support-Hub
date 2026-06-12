import { useListAutoMessages, useCreateAutoMessage, useUpdateAutoMessage, useDeleteAutoMessage, getListAutoMessagesQueryKey, AutoMessageTrigger, AutoMessageInputTrigger } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Edit2, Check, X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const triggerLabels: Record<string, string> = {
  welcome: "Boas-vindas",
  ticket_opened: "Chamado aberto",
  status_in_progress: "Em atendimento",
  status_resolved: "Resolvido",
  status_closed: "Fechado",
  ask_branch: "Pedir filial",
  ask_department: "Pedir departamento",
  ask_category: "Pedir categoria",
  ask_description: "Pedir descrição",
  thank_you: "Agradecimento",
};

export default function Messages() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useListAutoMessages();
  
  const createMutation = useCreateAutoMessage();
  const updateMutation = useUpdateAutoMessage();
  const deleteMutation = useDeleteAutoMessage();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTrigger, setEditTrigger] = useState<AutoMessageInputTrigger>("welcome");
  
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newTrigger, setNewTrigger] = useState<AutoMessageInputTrigger>("welcome");

  const triggers = Object.values(AutoMessageTrigger);

  const handleSave = (id: number) => {
    updateMutation.mutate({ id, data: { trigger: editTrigger, content: editContent } }, {
      onSuccess: () => {
        setEditingId(null);
        queryClient.invalidateQueries({ queryKey: getListAutoMessagesQueryKey() });
      }
    });
  };

  const handleCreate = () => {
    if (!newContent.trim()) return;
    createMutation.mutate({ data: { trigger: newTrigger, content: newContent, active: true } }, {
      onSuccess: () => {
        setIsAdding(false);
        setNewContent("");
        setNewTrigger("welcome");
        queryClient.invalidateQueries({ queryKey: getListAutoMessagesQueryKey() });
      }
    });
  };

  const handleToggleActive = (id: number, trigger: AutoMessageInputTrigger, content: string, active: boolean) => {
    updateMutation.mutate({ id, data: { trigger, content, active } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAutoMessagesQueryKey() })
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este modelo de mensagem?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAutoMessagesQueryKey() })
      });
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mensagens Automáticas</h1>
          <p className="text-muted-foreground">Gerencie as respostas automáticas enviadas aos clientes via WhatsApp.</p>
        </div>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus className="h-4 w-4 mr-2" /> Adicionar Mensagem
        </Button>
      </div>

      <div className="border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Gatilho</TableHead>
              <TableHead>Conteúdo da Mensagem</TableHead>
              <TableHead className="w-24 text-center">Ativo</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isAdding && (
              <TableRow className="bg-muted/30 items-start align-top">
                <TableCell className="pt-4">
                  <Select value={newTrigger} onValueChange={(v: any) => setNewTrigger(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {triggers.map(t => (
                        <SelectItem key={t} value={t}>{triggerLabels[t] ?? t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="pt-4">
                  <Textarea 
                    autoFocus
                    value={newContent} 
                    onChange={(e) => setNewContent(e.target.value)} 
                    placeholder="Digite o texto da mensagem..."
                    className="min-h-[100px] resize-y"
                  />
                </TableCell>
                <TableCell className="text-center pt-6">-</TableCell>
                <TableCell className="text-right space-x-2 pt-4">
                  <Button size="icon" variant="ghost" className="text-emerald-600 h-8 w-8" onClick={handleCreate} disabled={!newContent.trim()}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => setIsAdding(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )}
            
            {items?.map((item) => (
              <TableRow key={item.id} className="items-start align-top">
                <TableCell className="pt-4">
                  {editingId === item.id ? (
                    <Select value={editTrigger} onValueChange={(v: any) => setEditTrigger(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {triggers.map(t => (
                          <SelectItem key={t} value={t}>{triggerLabels[t] ?? t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                      {triggerLabels[item.trigger] ?? item.trigger}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="pt-4">
                  {editingId === item.id ? (
                    <Textarea 
                      autoFocus
                      value={editContent} 
                      onChange={(e) => setEditContent(e.target.value)} 
                      className="min-h-[100px] resize-y"
                    />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">{item.content}</div>
                  )}
                </TableCell>
                <TableCell className="text-center pt-4">
                  <Switch 
                    checked={item.active} 
                    onCheckedChange={(v) => handleToggleActive(item.id, item.trigger, item.content, v)}
                    disabled={editingId === item.id}
                  />
                </TableCell>
                <TableCell className="text-right space-x-1 pt-4">
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
                        onClick={() => { setEditingId(item.id); setEditContent(item.content); setEditTrigger(item.trigger); }}
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
                  Nenhuma mensagem automática cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
