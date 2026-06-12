import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Package, Send, CheckCircle2, MessageSquare, Phone, Loader2, RefreshCw, RotateCcw, ChevronRight } from "lucide-react";
import { formatDateBR, formatTimeBR } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface SupplierConv {
  id: number;
  phone: string;
  client_name: string | null;
  status: "open" | "closed";
  last_message: string | null;
  last_message_at: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface SupplierMsg {
  id: number;
  conversation_id: number;
  direction: "inbound" | "outbound";
  type: string;
  content: string;
  sender_name: string | null;
  media_url: string | null;
  created_at: string;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return phone;
}

export default function SupplierConversations() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<SupplierConv[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<SupplierMsg[]>([]);
  const [selectedConv, setSelectedConv] = useState<SupplierConv | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("open");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const data = await apiFetch<SupplierConv[]>(`/api/supplier-conversations${params}`);
      setConversations(data);
    } catch (e: any) {
      toast({ title: "Erro ao carregar conversas", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadMessages = useCallback(async (id: number) => {
    setLoadingMsgs(true);
    try {
      const data = await apiFetch<{ conversation: SupplierConv; messages: SupplierMsg[] }>(
        `/api/supplier-conversations/${id}`
      );
      setMessages(data.messages);
      setSelectedConv(data.conversation);
    } catch (e: any) {
      toast({ title: "Erro ao carregar mensagens", description: e?.message, variant: "destructive" });
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/api/supplier-conversations/${selectedId}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: reply.trim() }),
      });
      setReply("");
      await loadMessages(selectedId);
    } catch (e: any) {
      toast({ title: "Erro ao enviar mensagem", description: e?.message ?? "Verifique se o WhatsApp está conectado.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    setClosing(true);
    try {
      await apiFetch(`/api/supplier-conversations/${selectedId}/close`, { method: "PATCH" });
      toast({ title: "Conversa encerrada com sucesso" });
      setSelectedConv(prev => prev ? { ...prev, status: "closed" } : null);
      loadConversations();
    } catch (e: any) {
      toast({ title: "Erro ao encerrar conversa", description: e?.message, variant: "destructive" });
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    if (!selectedId) return;
    try {
      await apiFetch(`/api/supplier-conversations/${selectedId}/reopen`, { method: "PATCH" });
      toast({ title: "Conversa reaberta" });
      setSelectedConv(prev => prev ? { ...prev, status: "open" } : null);
      loadConversations();
    } catch (e: any) {
      toast({ title: "Erro ao reabrir conversa", description: e?.message, variant: "destructive" });
    }
  };

  const displayName = (conv: SupplierConv) => conv.client_name ?? formatPhone(conv.phone);
  const initials = (conv: SupplierConv) => displayName(conv).slice(0, 2).toUpperCase();

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      {/* ── Painel esquerdo: lista de conversas ── */}
      <div className="w-80 shrink-0 border-r flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h1 className="font-semibold">Fornecedores</h1>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadConversations} title="Atualizar">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex gap-1">
            {(["open", "closed", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex-1 text-xs py-1 rounded-md font-medium transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {f === "open" ? "Abertos" : f === "closed" ? "Encerrados" : "Todos"}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-12 text-center px-4">
              <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Conversas aparecem quando um fornecedor envia mensagem pelo WhatsApp.
              </p>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors",
                  selectedId === conv.id && "bg-muted"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {initials(conv)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-sm truncate">{displayName(conv)}</span>
                      <Badge
                        variant={conv.status === "open" ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                      >
                        {conv.status === "open" ? "Aberto" : "Enc."}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground/70">{formatPhone(conv.phone)}</div>
                    {conv.last_message && (
                      <div className="text-xs text-muted-foreground truncate mt-1">{conv.last_message}</div>
                    )}
                    {conv.updated_at && (
                      <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {formatDateBR(conv.updated_at)} {formatTimeBR(conv.updated_at)}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* ── Painel direito: mensagens ── */}
      {!selectedId ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-4 text-muted-foreground">
          <Package className="h-16 w-16 opacity-20" />
          <div className="text-center">
            <p className="font-medium">Selecione uma conversa</p>
            <p className="text-sm mt-1 opacity-70">Clique em uma conversa à esquerda para visualizar as mensagens</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          {selectedConv && (
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-sm shrink-0">
                  {initials(selectedConv)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{displayName(selectedConv)}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" />
                    {formatPhone(selectedConv.phone)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={selectedConv.status === "open" ? "default" : "secondary"}>
                  {selectedConv.status === "open" ? "Aberto" : "Encerrado"}
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => loadMessages(selectedId)} title="Atualizar mensagens">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                {selectedConv.status === "open" ? (
                  <Button variant="outline" size="sm" onClick={handleClose} disabled={closing} className="h-7 text-xs">
                    {closing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Encerrar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleReopen} className="h-7 text-xs">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reabrir
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3 max-w-3xl mx-auto">
              {loadingMsgs ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn("flex", msg.direction === "outbound" ? "justify-end" : "justify-start")}
                  >
                    <div className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                      msg.direction === "outbound"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-card border rounded-tl-sm"
                    )}>
                      {msg.sender_name && (
                        <div className={cn(
                          "text-[10px] font-semibold mb-1",
                          msg.direction === "outbound" ? "text-primary-foreground/70" : "text-purple-600 dark:text-purple-400"
                        )}>
                          {msg.sender_name}
                        </div>
                      )}

                      {msg.media_url ? (
                        <div className="space-y-1">
                          {msg.type === "image" && (
                            <img
                              src={msg.media_url}
                              alt="Imagem"
                              className="max-w-full rounded-lg max-h-48 object-contain cursor-pointer"
                              onClick={() => window.open(msg.media_url!, "_blank")}
                            />
                          )}
                          {msg.type === "audio" && (
                            <audio controls src={msg.media_url} className="max-w-full h-8" />
                          )}
                          {msg.type === "video" && (
                            <video controls src={msg.media_url} className="max-w-full rounded-lg max-h-48" />
                          )}
                          {!["image", "audio", "video"].includes(msg.type) && (
                            <a
                              href={msg.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn("underline text-xs", msg.direction === "outbound" ? "text-primary-foreground/80" : "text-primary")}
                            >
                              📎 Ver arquivo
                            </a>
                          )}
                          {msg.content && !["[Imagem]", "[Áudio]", "[Vídeo]", "[Documento]", "[Sticker]"].includes(msg.content) && (
                            <div className="mt-1 whitespace-pre-wrap">{msg.content}</div>
                          )}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      )}

                      <div className={cn(
                        "text-[10px] mt-1.5",
                        msg.direction === "outbound" ? "text-primary-foreground/50 text-right" : "text-muted-foreground/60"
                      )}>
                        {formatDateBR(msg.created_at)} {formatTimeBR(msg.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Reply */}
          {selectedConv?.status === "open" && (
            <div className="border-t p-3">
              <div className="flex items-center gap-2 max-w-3xl mx-auto">
                <Input
                  placeholder="Responder ao fornecedor via WhatsApp..."
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="flex-1"
                  disabled={sending}
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !reply.trim()}
                  size="icon"
                  className="h-9 w-9 shrink-0"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1.5 ml-1 max-w-3xl mx-auto">
                Enter para enviar · A mensagem será entregue via WhatsApp
              </p>
            </div>
          )}

          {selectedConv?.status === "closed" && (
            <div className="border-t p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground text-center">
                Conversa encerrada · Reabra para responder ao fornecedor
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
