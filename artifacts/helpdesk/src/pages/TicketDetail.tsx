import { useGetTicket, useUpdateTicketStatus, useReplyToTicket, useAddTicketNote, getGetTicketQueryKey, TicketStatusUpdateStatus } from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ArrowLeft, Send, StickyNote, FileText, Image as ImageIcon, Music, Video,
  Bot, UserCheck, Store, UserCircle, Loader2, BookText, Search, X,
  ChevronLeft, ChevronRight, Star, AlertTriangle, Clock, CheckCircle2, CircleEllipsis,
  MessageSquare, Activity, Sparkles, Mic, Square
} from "lucide-react";
import { useTicketNavigation } from "@/contexts/TicketNavigationContext";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateBR, formatTimeBR } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API, type User, type CannedResponse, type ActivityEntry } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useClientLabel } from "@/hooks/useSystemConfig";

const mediaTypeLabels: Record<string, string> = {
  audio: "Áudio", image: "Imagem", video: "Vídeo", document: "Documento",
};

const botModeLabel: Record<string, { label: string; color: string }> = {
  bot: { label: "Bot Ativo", color: "bg-blue-500" },
  human: { label: "Atendimento Humano", color: "bg-amber-500" },
  supplier: { label: "Fornecedor", color: "bg-purple-500" },
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  opened: MessageSquare,
  assigned: UserCircle,
  status_changed: Activity,
  reply: Send,
  note_added: StickyNote,
  resolved: CheckCircle2,
  closed: CheckCircle2,
};

const ACTIVITY_LABELS: Record<string, string> = {
  opened: "Chamado aberto",
  assigned: "Atribuição",
  status_changed: "Status alterado",
  reply: "Resposta enviada",
  note_added: "Nota interna",
  resolved: "Resolvido",
  closed: "Fechado",
};

function getSlaStatus(createdAt: string, status: string): "ok" | "warning" | "overdue" {
  if (status === "resolved" || status === "closed") return "ok";
  const openHours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
  if (openHours >= 48) return "overdue";
  if (openHours >= 24) return "warning";
  return "ok";
}

function SlaIndicator({ createdAt, status }: { createdAt: string; status: string }) {
  const sla = getSlaStatus(createdAt, status);
  const openHours = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000);
  const openDays = Math.floor(openHours / 24);

  if (sla === "ok" && status !== "resolved" && status !== "closed") {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <Clock className="h-4 w-4 text-emerald-600" />
        <div>
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">SLA em dia</div>
          <div className="text-xs text-muted-foreground">{openHours}h aberto</div>
        </div>
      </div>
    );
  }
  if (sla === "warning") {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <Clock className="h-4 w-4 text-amber-600" />
        <div>
          <div className="text-xs font-medium text-amber-700 dark:text-amber-400">SLA Atenção</div>
          <div className="text-xs text-muted-foreground">{openDays}d {openHours % 24}h aberto</div>
        </div>
      </div>
    );
  }
  if (sla === "overdue") {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <div>
          <div className="text-xs font-medium text-red-700 dark:text-red-400">SLA Vencido</div>
          <div className="text-xs text-muted-foreground">{openDays}d {openHours % 24}h aberto</div>
        </div>
      </div>
    );
  }
  return null;
}

function useFavorite(ticketId: number) {
  const [isFav, setIsFav] = useState(() => {
    try {
      const raw = localStorage.getItem("ticket_favorites");
      const ids: number[] = raw ? JSON.parse(raw) : [];
      return ids.includes(ticketId);
    } catch { return false; }
  });

  const toggle = useCallback(() => {
    setIsFav(prev => {
      const next = !prev;
      try {
        const raw = localStorage.getItem("ticket_favorites");
        const ids: number[] = raw ? JSON.parse(raw) : [];
        const newIds = next ? [...ids, ticketId] : ids.filter(id => id !== ticketId);
        localStorage.setItem("ticket_favorites", JSON.stringify(newIds));
      } catch { /* */ }
      return next;
    });
  }, [ticketId]);

  return { isFav, toggle };
}

// ─── Canned Responses Picker ──────────────────────────────────────────────────

function CannedResponsePicker({
  onSelect, clientName, attendantName, ticketNumber,
}: {
  onSelect: (text: string) => void;
  clientName?: string | null;
  attendantName?: string | null;
  ticketNumber?: string;
}) {
  const [open, setOpen] = useState(false);
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([API.listCannedResponses(), API.listCannedCategories()])
      .then(([res, cats]) => { setResponses(res.filter(r => r.active)); setCategories(cats); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const applyVariables = (content: string) => {
    const now = new Date();
    return content
      .replace(/\{nome_cliente\}/g, clientName || "Cliente")
      .replace(/\{nome_atendente\}/g, attendantName || "Atendente")
      .replace(/\{numero_chamado\}/g, ticketNumber || "")
      .replace(/\{data\}/g, now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }))
      .replace(/\{hora\}/g, now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }))
      .replace(/\{departamento\}/g, "");
  };

  const filtered = responses.filter(r => {
    const matchCat = category === "all" || r.category === category;
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
    <div className="relative" ref={containerRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant={open ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0"
            onClick={() => setOpen(v => !v)}>
            <BookText className="h-4 w-4 text-primary" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Respostas Prontas</TooltipContent>
      </Tooltip>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-96 max-h-[420px] flex flex-col border rounded-lg shadow-xl bg-popover z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b shrink-0">
            <span className="text-sm font-semibold">Respostas Prontas</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex gap-2 px-3 py-2 border-b shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input autoFocus placeholder="Pesquisar..." className="h-7 pl-7 text-sm" value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
            {categories.length > 0 && (
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">Nenhuma resposta encontrada.</div>
            ) : (
              <div className="p-2 space-y-2">
                {Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground px-2 py-1">{cat}</div>
                    {items.map(r => (
                      <button key={r.id} type="button"
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors group"
                        onClick={() => { onSelect(applyVariables(r.content)); setOpen(false); setSearch(""); }}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{r.title}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.content}</p>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function Timeline({ ticketId }: { ticketId: number }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.getActivityLog(ticketId)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-4">Sem atividades registradas.</div>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => {
        const Icon = ACTIVITY_ICONS[entry.action] ?? CircleEllipsis;
        const isLast = i === entries.length - 1;
        return (
          <div key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Icon className="h-3 w-3 text-muted-foreground" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border mt-1 min-h-[12px]" />}
            </div>
            <div className="pb-3 flex-1 min-w-0">
              <div className="text-xs font-medium">{ACTIVITY_LABELS[entry.action] ?? entry.action}</div>
              {entry.detail && (
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{entry.detail}</div>
              )}
              <div className="text-[10px] text-muted-foreground/60 mt-1">
                {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true, locale: ptBR })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { isFav, toggle: toggleFav } = useFavorite(ticketId);
  const [, navigate] = useLocation();
  const { prevId, nextId, indexOf, ticketIds } = useTicketNavigation();
  const prev = prevId(ticketId);
  const next = nextId(ticketId);
  const pos = indexOf(ticketId);

  const { toast } = useToast();
  const [replyText, setReplyText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [cmdFeedback, setCmdFeedback] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<{ source?: string; urgency?: string; similarCount?: number; keywords?: string[] } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioSending, setAudioSending] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; type: "image" | "video" | "pdf" | "audio"; mime?: string } | null>(null);
  const clientLabel = useClientLabel();

  const { data: detail, isLoading } = useGetTicket(ticketId, {
    query: { enabled: !!ticketId, refetchInterval: 5000, queryKey: getGetTicketQueryKey(ticketId) }
  });

  const replyMutation = useReplyToTicket();
  const noteMutation = useAddTicketNote();
  const statusMutation = useUpdateTicketStatus();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  useEffect(() => {
    API.listUsers().then(u => setUsers(u.filter(x => x.active))).catch(() => {});
  }, []);

  // Atualização em tempo real via SSE
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, unknown> | undefined;
      if (!detail?.ticketId || detail.ticketId === ticketId) {
        queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
      }
    };
    window.addEventListener("sse:message:new", handler);
    window.addEventListener("sse:ticket:updated", handler);
    return () => {
      window.removeEventListener("sse:message:new", handler);
      window.removeEventListener("sse:ticket:updated", handler);
    };
  }, [ticketId, queryClient]);

  if (isLoading) return <div className="p-6">Carregando chamado...</div>;
  if (!detail) return <div className="p-6">Chamado não encontrado.</div>;

  const { ticket, messages } = detail;
  const currentBotMode = (detail as any).ticket?.botMode ?? (detail as any).botMode ?? "bot";
  const assignedTo = (ticket as any).assignedTo ?? null;
  const assigneeName = (ticket as any).assigneeName ?? null;

  const attendant = assignedTo ? users.find(u => u.id === assignedTo) : null;
  const myName = user?.name ?? "";
  const isAnalyst = ["technician", "attendant"].includes(user?.role ?? "");
  // Analysts are always in reply mode — can never switch to note mode
  const effectiveMode = isAnalyst ? "reply" : mode;

  const handleAiSuggest = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiMeta(null);
    try {
      const result = await API.getAiSuggestion(ticketId);
      const suggestion = result.suggestion.trim();
      setReplyText(suggestion);
      setMode("reply");
      setAiMeta({
        source: result.source,
        urgency: result.urgency,
        similarCount: result.similarCount,
        keywords: result.keywords,
      });
    } catch (err: any) {
      setAiError(err?.message ?? "Erro ao gerar sugestão");
      setTimeout(() => setAiError(null), 5000);
    } finally {
      setAiLoading(false);
    }
  };

  const handleModeChange = (newMode: "reply" | "note") => {
    setMode(newMode);
  };

  const handleSend = () => {
    if (effectiveMode === "reply" && replyText.trim()) {
      replyMutation.mutate({ id: ticketId, data: { message: replyText } }, {
        onSuccess: () => {
          setReplyText("");
          queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
        }
      });
    } else if (effectiveMode === "note" && noteText.trim()) {
      noteMutation.mutate({ id: ticketId, data: { content: noteText } }, {
        onSuccess: () => {
          setNoteText(""); setMode("reply");
          queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
        }
      });
    }
  };

  const sendCommand = (cmd: string, label: string) => {
    replyMutation.mutate({ id: ticketId, data: { message: cmd } }, {
      onSuccess: () => {
        setCmdFeedback(label);
        setTimeout(() => setCmdFeedback(null), 3000);
        queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
      }
    });
  };

  const handleStatusChange = (newStatus: string) => {
    statusMutation.mutate({ id: ticketId, data: { status: newStatus as TicketStatusUpdateStatus } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) })
    });
  };

  const getBestAudioMime = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ];
    try {
      return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? "";
    } catch {
      return "";
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getBestAudioMime();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || mimeType });
        await sendAudioBlob(blob);
      };
      mr.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      toast({ title: "Erro", description: "Não foi possível acessar o microfone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const sendAudioBlob = async (blob: Blob) => {
    setAudioSending(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      await API.sendAudioMessage(ticketId, base64);
      toast({ title: "Áudio enviado ✓", description: "Mensagem de voz enviada com sucesso." });
      queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message ?? "Falha ao enviar áudio.", variant: "destructive" });
    } finally {
      setAudioSending(false);
    }
  };

  const handleAssign = async (userId: string) => {
    setAssigning(true);
    try {
      const uid = userId === "unassigned" ? null : parseInt(userId);
      await API.assignTicket(ticketId, uid);
      queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
    } catch { /**/ } finally { setAssigning(false); }
  };

  const renderMessageContent = (msg: typeof messages[0]) => {
    if (msg.type === "text" || msg.type === "note") {
      return <p className="whitespace-pre-wrap">{msg.content}</p>;
    }

    const captionMatch = msg.content.match(/:\s+(.+)$/s);
    const caption = captionMatch?.[1]?.trim() ?? "";

    if (msg.mediaUrl) {
      if (msg.type === "image") {
        return (
          <div className="flex flex-col gap-1.5">
            <img
              src={msg.mediaUrl}
              alt="Imagem"
              className="max-w-[260px] max-h-60 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity border"
              onClick={() => setLightbox({ src: msg.mediaUrl!, type: "image" })}
            />
            {caption && <p className="text-sm whitespace-pre-wrap">{caption}</p>}
          </div>
        );
      }
      if (msg.type === "audio") {
        const mime = (msg as any).mediaMime as string | null;
        return (
          <div className="flex flex-col gap-1">
            <audio
              key={msg.mediaUrl}
              controls
              preload="metadata"
              className="max-w-[260px]"
              style={{ height: 40 }}
            >
              <source src={msg.mediaUrl!} type={mime ?? "audio/webm; codecs=opus"} />
              <source src={msg.mediaUrl!} type="audio/ogg; codecs=opus" />
              <source src={msg.mediaUrl!} type="audio/webm" />
            </audio>
            <button
              onClick={() => setLightbox({ src: msg.mediaUrl!, type: "audio", mime: mime ?? undefined })}
              className="text-xs underline opacity-60 hover:opacity-100 text-left"
            >
              Abrir player expandido
            </button>
          </div>
        );
      }
      if (msg.type === "video") {
        return (
          <div className="flex flex-col gap-1.5">
            <video
              controls
              src={msg.mediaUrl}
              className="max-w-[260px] max-h-48 rounded-lg border cursor-pointer"
              onClick={() => setLightbox({ src: msg.mediaUrl!, type: "video" })}
            />
            {caption && <p className="text-sm whitespace-pre-wrap">{caption}</p>}
          </div>
        );
      }
      if (msg.type === "document") {
        const isPdf = msg.mediaUrl.toLowerCase().endsWith(".pdf") || caption.toLowerCase().includes(".pdf");
        return (
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 opacity-70" />
            <button
              onClick={() => setLightbox({ src: msg.mediaUrl!, type: isPdf ? "pdf" : "pdf" })}
              className="underline hover:opacity-80 truncate text-left"
            >
              {caption || "Documento"}
            </button>
          </div>
        );
      }
    }

    let Icon = FileText;
    if (msg.type === "image") Icon = ImageIcon;
    if (msg.type === "audio") Icon = Music;
    if (msg.type === "video") Icon = Video;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium opacity-80">
          <Icon className="h-4 w-4" />
          <span>{mediaTypeLabels[msg.type] ?? msg.type}</span>
        </div>
        <p className="whitespace-pre-wrap">{msg.content}</p>
      </div>
    );
  };

  const modeInfo = botModeLabel[currentBotMode] ?? botModeLabel["bot"];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3rem)]">
      {/* Header */}
      <header className="flex h-14 items-center gap-4 border-b bg-card px-4 shrink-0">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/tickets"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>

        {/* Prev/Next navigation */}
        {ticketIds.length > 1 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={!prev}
              onClick={() => prev && navigate(`/tickets/${prev}`)}
              title="Chamado anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums min-w-[3rem] text-center">
              {pos >= 0 ? `${pos + 1}/${ticketIds.length}` : ""}
            </span>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={!next}
              onClick={() => next && navigate(`/tickets/${next}`)}
              title="Próximo chamado"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-3 font-semibold flex-1 overflow-hidden min-w-0">
          <span className="truncate">{ticket.ticketNumber} — {ticket.clientName || ticket.whatsappPhone}</span>
          <StatusBadge status={ticket.status as any} />
          {!isAnalyst && (
            <Badge className={`${modeInfo.color} text-white text-xs shrink-0`}>{modeInfo.label}</Badge>
          )}
        </div>

        {/* Favorite button — hidden from analysts */}
        {!isAnalyst && (
          <Button variant="ghost" size="icon" className={`h-8 w-8 ${isFav ? "text-yellow-500" : "text-muted-foreground"}`}
            onClick={toggleFav} title={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
            <Star className="h-4 w-4" fill={isFav ? "currentColor" : "none"} />
          </Button>
        )}

        {/* Bot controls — hidden from analysts */}
        {!isAnalyst && (
          <div className="hidden md:flex items-center gap-1 border rounded-md p-1 bg-muted/40">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant={currentBotMode === "human" ? "secondary" : "ghost"} className="h-7 px-2 text-xs"
                  onClick={() => sendCommand("/assumir", "Modo humano ativado")} disabled={replyMutation.isPending}>
                  <UserCheck className="h-3.5 w-3.5 mr-1 text-amber-500" />/assumir
                </Button>
              </TooltipTrigger>
              <TooltipContent>Atendente assume — bot para</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant={currentBotMode === "bot" ? "secondary" : "ghost"} className="h-7 px-2 text-xs"
                  onClick={() => sendCommand("/bot", "Bot reativado")} disabled={replyMutation.isPending}>
                  <Bot className="h-3.5 w-3.5 mr-1 text-blue-500" />/bot
                </Button>
              </TooltipTrigger>
              <TooltipContent>Devolver para automação</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant={currentBotMode === "supplier" ? "secondary" : "ghost"} className="h-7 px-2 text-xs"
                  onClick={() => sendCommand("/fornecedor", "Modo fornecedor ativado")} disabled={replyMutation.isPending}>
                  <Store className="h-3.5 w-3.5 mr-1 text-purple-500" />/fornecedor
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ativar modo fornecedor</TooltipContent>
            </Tooltip>
          </div>
        )}

        {(() => {
          const isAdminUser = ["admin", "manager"].includes(user?.role ?? "");
          const ALL_STATUSES = ["open", "in_progress", "closed"] as const;
          const STATUS_FLOW: Record<string, string[]> = {
            open:        ["open", "in_progress"],
            in_progress: ["in_progress", "closed"],
            closed:      ["closed"],
          };
          const STATUS_NAMES: Record<string, string> = {
            open: "Aberto", in_progress: "Em Atendimento", closed: "Fechado",
          };
          const allowedStatuses = isAdminUser
            ? [...ALL_STATUSES]
            : (STATUS_FLOW[ticket.status] ?? [...ALL_STATUSES]);
          return (
            <Select
              value={ticket.status}
              onValueChange={handleStatusChange}
              disabled={statusMutation.isPending || (!isAdminUser && ticket.status === "closed")}
            >
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map(s =>
                  allowedStatuses.includes(s) ? (
                    <SelectItem key={s} value={s}>{STATUS_NAMES[s]}</SelectItem>
                  ) : null
                )}
              </SelectContent>
            </Select>
          );
        })()}
      </header>

      {cmdFeedback && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm px-4 py-2 text-center">
          ✓ {cmdFeedback}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex flex-col flex-1 border-r bg-muted/20 relative">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4 max-w-3xl mx-auto pb-4">
              {messages.map((msg) => {
                const isInbound = msg.direction === "inbound";
                const isInternal = msg.direction === "internal";
                return (
                  <div key={msg.id} className={`flex flex-col ${isInbound ? "items-start" : isInternal ? "items-center" : "items-end"}`}>
                    <div className="flex items-baseline gap-2 mb-1 px-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        {isInbound ? ticket.clientName || clientLabel.singular : msg.senderName || "Sistema"}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {formatTimeBR(msg.createdAt)}
                      </span>
                    </div>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      isInbound ? "bg-card border text-card-foreground rounded-tl-sm shadow-sm"
                      : isInternal ? "bg-yellow-500/10 border-yellow-500/30 border border-dashed text-yellow-800 dark:text-yellow-200"
                      : "bg-primary text-primary-foreground rounded-tr-sm shadow-sm"
                    }`}>
                      {renderMessageContent(msg)}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 bg-card border-t shrink-0">
            <div className="max-w-3xl mx-auto">
              {/* Block send banner when ticket is not in_progress */}
              {ticket.status !== "in_progress" && effectiveMode === "reply" && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {ticket.status === "closed"
                    ? "Chamado encerrado — não é possível enviar mensagens."
                    : `Mude o status para "Em Atendimento" para responder ao ${clientLabel.singular.toLowerCase()}.`}
                </div>
              )}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Button variant={effectiveMode === "reply" ? "secondary" : "ghost"} size="sm"
                  onClick={() => handleModeChange("reply")} className="h-8 rounded-full">
                  <Send className="h-3 w-3 mr-2" /> Responder ao {clientLabel.singular}
                </Button>
                {!isAnalyst && (
                  <Button variant={effectiveMode === "note" ? "secondary" : "ghost"} size="sm"
                    onClick={() => handleModeChange("note")} className="h-8 rounded-full">
                    <StickyNote className="h-3 w-3 mr-2 text-yellow-600 dark:text-yellow-500" /> Nota Interna
                  </Button>
                )}
                {!isAnalyst && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost" size="sm"
                        onClick={handleAiSuggest}
                        disabled={aiLoading}
                        className="h-8 rounded-full text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/40"
                      >
                        {aiLoading
                          ? <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          : <Sparkles className="h-3 w-3 mr-2" />}
                        Sugestão IA
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Gerar sugestão com IA (aprende com histórico de chamados)</TooltipContent>
                  </Tooltip>
                )}
                {aiError && (
                  <span className="text-xs text-destructive ml-1">{aiError}</span>
                )}
                {aiMeta && !aiError && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    {aiMeta.source === "groq" && <span className="text-violet-500 font-medium">Groq</span>}
                    {aiMeta.source === "history" && <span className="text-emerald-600 font-medium">📚 {aiMeta.similarCount} chamado(s) similar(es)</span>}
                    {aiMeta.source === "rules" && <span className="text-amber-600 font-medium">🔧 Sugestão por regras</span>}
                    {aiMeta.urgency === "high" && <span className="text-red-500 font-semibold">• 🔴 Urgente</span>}
                    {aiMeta.urgency === "medium" && <span className="text-amber-500">• 🟡 Moderado</span>}
                  </span>
                )}
                {!isAnalyst && (
                  <div className="flex md:hidden items-center gap-1 ml-auto">
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => sendCommand("/assumir", "Modo humano ativado")}><UserCheck className="h-3.5 w-3.5 text-amber-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => sendCommand("/bot", "Bot reativado")}><Bot className="h-3.5 w-3.5 text-blue-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => sendCommand("/fornecedor", "Modo fornecedor ativado")}><Store className="h-3.5 w-3.5 text-purple-500" /></Button>
                  </div>
                )}
              </div>
              <form className="flex items-start gap-2" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
                {effectiveMode === "reply" && (
                  <CannedResponsePicker
                    onSelect={text => setReplyText(text)}
                    clientName={ticket.clientName}
                    attendantName={attendant?.name ?? assigneeName}
                    ticketNumber={ticket.ticketNumber}
                  />
                )}
                <textarea
                  rows={effectiveMode === "reply" ? 3 : 2}
                  placeholder={
                    effectiveMode === "reply"
                      ? ticket.status !== "in_progress"
                        ? "Mude o status para Em Atendimento para digitar..."
                        : `Digite uma mensagem para o ${clientLabel.singular.toLowerCase()}... (Enter para enviar, Shift+Enter para quebrar linha)`
                      : "Digite uma nota interna..."
                  }
                  value={effectiveMode === "reply" ? replyText : noteText}
                  onChange={(e) => effectiveMode === "reply" ? setReplyText(e.target.value) : setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className={`flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring transition bg-background ${
                    effectiveMode === "note" ? "border-yellow-500/50 focus:ring-yellow-500 bg-yellow-500/5" : ""
                  }`}
                  disabled={replyMutation.isPending || noteMutation.isPending || (effectiveMode === "reply" && ticket.status !== "in_progress")}
                />
                {/* Mic button — only in reply mode when ticket is in_progress */}
                {effectiveMode === "reply" && ticket.status === "in_progress" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant={isRecording ? "destructive" : "outline"}
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={audioSending}
                        className="self-end h-10 w-10 p-0 shrink-0"
                      >
                        {audioSending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : isRecording
                            ? <Square className="h-4 w-4" />
                            : <Mic className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isRecording ? `Parar gravação (${recordingSeconds}s)` : "Gravar áudio"}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Button type="submit"
                  disabled={replyMutation.isPending || noteMutation.isPending || (effectiveMode === "reply" && (!replyText.trim() || ticket.status !== "in_progress")) || (effectiveMode === "note" && !noteText.trim())}
                  className={effectiveMode === "note" ? "bg-yellow-600 hover:bg-yellow-700 text-white self-end" : "self-end"}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              {isRecording && (
                <div className="mt-2 flex items-center gap-2 text-xs text-destructive animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-destructive" />
                  Gravando... {recordingSeconds}s — clique em ■ para parar e enviar
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — hidden for analysts */}
        <aside className={`w-80 bg-card ${isAnalyst ? "hidden" : "hidden xl:block"}`}>
          <ScrollArea className="h-full">
            <div className="p-5 space-y-5">
              <div>
                <h3 className="text-base font-semibold mb-0.5">Detalhes do Chamado</h3>
                <p className="text-sm text-muted-foreground">{ticket.ticketNumber}</p>
              </div>

              {/* SLA Indicator */}
              <SlaIndicator createdAt={ticket.createdAt} status={ticket.status} />

              <Separator />

              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">{clientLabel.singular}</div>
                  <div className="font-medium">{ticket.clientName || "-"}</div>
                  <div className="text-sm font-mono text-muted-foreground">{ticket.whatsappPhone}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Filial</div>
                  <div className="text-sm">{(ticket as any).branchName || "-"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Departamento</div>
                  <div className="text-sm">{(ticket as any).departmentName || "-"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Categoria</div>
                  <div className="text-sm">{(ticket as any).categoryName || "-"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Aberto em</div>
                  <div className="text-sm">{formatDateBR(ticket.createdAt)}</div>
                </div>
                {(ticket as any).firstResponseAt && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">1ª Resposta</div>
                    <div className="text-sm">{formatDateBR((ticket as any).firstResponseAt)}</div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Timeline & Details tabs */}
              <Tabs defaultValue="timeline">
                <TabsList className="w-full h-8">
                  <TabsTrigger value="timeline" className="flex-1 text-xs">Linha do Tempo</TabsTrigger>
                  <TabsTrigger value="description" className="flex-1 text-xs">Descrição</TabsTrigger>
                </TabsList>
                <TabsContent value="timeline" className="mt-3">
                  <Timeline ticketId={ticketId} />
                </TabsContent>
                <TabsContent value="description" className="mt-3">
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {ticket.description || <span className="italic">Sem descrição.</span>}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </aside>
      </div>

      {/* ── Lightbox Modal ──────────────────────────────────────────────────── */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl w-full p-2 bg-black/95 border-0">
          <DialogTitle className="sr-only">Visualizar mídia</DialogTitle>
          {lightbox?.type === "image" && (
            <div className="flex items-center justify-center min-h-[60vh] max-h-[90vh]">
              <img
                src={lightbox.src}
                alt="Imagem"
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
            </div>
          )}
          {lightbox?.type === "video" && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <video
                controls
                autoPlay
                src={lightbox.src}
                className="max-w-full max-h-[85vh] rounded-lg"
              />
            </div>
          )}
          {lightbox?.type === "audio" && (
            <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[200px]">
              <Music className="h-16 w-16 text-white/60" />
              <audio
                key={lightbox.src}
                controls
                autoPlay
                preload="auto"
                className="w-full max-w-md"
              >
                <source src={lightbox.src} type={lightbox.mime ?? "audio/webm; codecs=opus"} />
                <source src={lightbox.src} type="audio/ogg; codecs=opus" />
                <source src={lightbox.src} type="audio/webm" />
              </audio>
              <a href={lightbox.src} download className="text-xs text-white/50 hover:text-white underline">
                Baixar áudio
              </a>
            </div>
          )}
          {lightbox?.type === "pdf" && (
            <div className="flex flex-col min-h-[80vh]">
              <div className="flex justify-between items-center px-2 py-1 mb-1">
                <span className="text-white/60 text-sm">Documento</span>
                <a
                  href={lightbox.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/50 hover:text-white underline"
                >
                  Abrir em nova aba
                </a>
              </div>
              <iframe
                src={lightbox.src}
                className="flex-1 w-full rounded-lg min-h-[75vh]"
                title="Documento"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
