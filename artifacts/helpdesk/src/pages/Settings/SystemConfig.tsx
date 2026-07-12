import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2, Bot, Clock, MessageSquare, AlertTriangle, Save, RotateCcw, Info,
} from "lucide-react";

type Config = Record<string, string>;

const DAYS_MAP: { value: string; label: string }[] = [
  { value: "0", label: "Dom" },
  { value: "1", label: "Seg" },
  { value: "2", label: "Ter" },
  { value: "3", label: "Qua" },
  { value: "4", label: "Qui" },
  { value: "5", label: "Sex" },
  { value: "6", label: "Sáb" },
];

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
      <Info className="w-3 h-3 shrink-0" />
      {children}
    </p>
  );
}

export default function SystemConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Config>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Config>("/api/settings/system-config");
      setConfig(data);
      setDirty(new Set());
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar as configurações.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const set = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(prev => new Set(prev).add(key));
  };

  const toggleDay = (day: string) => {
    const current = (config.business_days ?? "1,2,3,4,5").split(",").filter(Boolean);
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort();
    set("business_days", next.join(","));
  };

  const saveKey = async (key: string) => {
    setSaving(prev => new Set(prev).add(key));
    try {
      await apiFetch(`/api/settings/system-config/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value: config[key] ?? "" }),
      });
      setDirty(prev => { const n = new Set(prev); n.delete(key); return n; });
      toast({ title: "Salvo", description: "Configuração atualizada com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar a configuração.", variant: "destructive" });
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const saveGroup = async (keys: string[]) => {
    const updates: Record<string, string> = {};
    keys.forEach(k => { updates[k] = config[k] ?? ""; });
    setSaving(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; });
    try {
      await apiFetch("/api/settings/system-config/batch", {
        method: "POST",
        body: JSON.stringify({ updates }),
      });
      setDirty(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });
      toast({ title: "Salvo", description: `${keys.length} configurações atualizadas.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar as configurações.", variant: "destructive" });
    } finally {
      setSaving(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });
    }
  };

  const isSaving = (...keys: string[]) => keys.some(k => saving.has(k));
  const isDirty = (...keys: string[]) => keys.some(k => dirty.has(k));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações do Sistema</h1>
        <p className="text-muted-foreground">
          Personalize o comportamento do bot e do sistema sem precisar alterar o código.
        </p>
      </div>

      <Tabs defaultValue="sistema">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="sistema" className="gap-2"><Building2 className="w-4 h-4" />Sistema</TabsTrigger>
          <TabsTrigger value="bot" className="gap-2"><Bot className="w-4 h-4" />Bot — Comportamento</TabsTrigger>
          <TabsTrigger value="mensagens" className="gap-2"><MessageSquare className="w-4 h-4" />Bot — Mensagens</TabsTrigger>
          <TabsTrigger value="sla" className="gap-2"><AlertTriangle className="w-4 h-4" />SLA & Alertas</TabsTrigger>
          <TabsTrigger value="horario" className="gap-2"><Clock className="w-4 h-4" />Horário Comercial</TabsTrigger>
        </TabsList>

        {/* ── SISTEMA ─────────────────────────────────────────────────────────── */}
        <TabsContent value="sistema" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Identidade da Empresa</CardTitle>
              <CardDescription>Informações exibidas na interface e usadas pelo bot.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ConfigField
                label="Nome da Empresa"
                value={config.company_name ?? ""}
                onChange={v => set("company_name", v)}
                onSave={() => saveKey("company_name")}
                saving={isSaving("company_name")}
                dirty={isDirty("company_name")}
                hint="Usado no cabeçalho e nas comunicações do sistema."
              />
              <ConfigField
                label="Título do Sistema"
                value={config.system_title ?? ""}
                onChange={v => set("system_title", v)}
                onSave={() => saveKey("system_title")}
                saving={isSaving("system_title")}
                dirty={isDirty("system_title")}
                hint="Exibido na barra do navegador e na tela de login."
              />
              <ConfigField
                label="Nome do Bot"
                value={config.bot_name ?? ""}
                onChange={v => set("bot_name", v)}
                onSave={() => saveKey("bot_name")}
                saving={isSaving("bot_name")}
                dirty={isDirty("bot_name")}
                hint="Nome exibido no histórico de chat como remetente do bot."
              />
              <ConfigField
                label='Termo para "Colaborador" (singular)'
                value={config.client_label ?? ""}
                onChange={v => set("client_label", v)}
                onSave={() => saveKey("client_label")}
                saving={isSaving("client_label")}
                dirty={isDirty("client_label")}
                hint='Como o sistema se refere ao usuário final. Ex: "Colaborador", "Cliente", "Usuário". Padrão: Colaborador.'
              />
              <ConfigField
                label='Termo para "Colaboradores" (plural)'
                value={config.clients_label ?? ""}
                onChange={v => set("clients_label", v)}
                onSave={() => saveKey("clients_label")}
                saving={isSaving("clients_label")}
                dirty={isDirty("clients_label")}
                hint='Versão plural do termo acima. Ex: "Colaboradores", "Clientes". Padrão: Colaboradores.'
              />
              <ConfigField
                label="Prefixo do Chamado"
                value={config.ticket_prefix ?? ""}
                onChange={v => set("ticket_prefix", v)}
                onSave={() => saveKey("ticket_prefix")}
                saving={isSaving("ticket_prefix")}
                dirty={isDirty("ticket_prefix")}
                hint='Prefixo antes do número do chamado. Ex: "TKT-" → TKT-001. Deixe vazio para usar somente o número.'
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BOT COMPORTAMENTO ─────────────────────────────────────────────── */}
        <TabsContent value="bot" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Inatividade</CardTitle>
              <CardDescription>Tempos para alertar e fechar conversas inativas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ConfigField
                label="Minutos de Inatividade (Alerta)"
                value={config.inactivity_warn_minutes ?? ""}
                onChange={v => set("inactivity_warn_minutes", v)}
                onSave={() => saveKey("inactivity_warn_minutes")}
                saving={isSaving("inactivity_warn_minutes")}
                dirty={isDirty("inactivity_warn_minutes")}
                type="number"
                hint="Após quantos minutos sem resposta o bot envia aviso de inatividade."
              />
              <ConfigField
                label="Minutos de Inatividade (Fechar)"
                value={config.inactivity_minutes ?? ""}
                onChange={v => set("inactivity_minutes", v)}
                onSave={() => saveKey("inactivity_minutes")}
                saving={isSaving("inactivity_minutes")}
                dirty={isDirty("inactivity_minutes")}
                type="number"
                hint="Após quantos minutos sem resposta a conversa é encerrada automaticamente."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saudação do Analista</CardTitle>
              <CardDescription>
                Mensagem enviada ao cliente quando um analista assume o chamado (status → Em Atendimento).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigTextarea
                label="Template de Saudação do Analista"
                value={config.analyst_greeting_template ?? ""}
                onChange={v => set("analyst_greeting_template", v)}
                onSave={() => saveKey("analyst_greeting_template")}
                saving={isSaving("analyst_greeting_template")}
                dirty={isDirty("analyst_greeting_template")}
                rows={5}
                hint="Variáveis: {saudacao} = Bom dia/tarde/noite, {nome} = nome do analista."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cliente Recorrente</CardTitle>
              <CardDescription>
                Mensagem enviada ao cliente que já possui um chamado anterior, pulando as etapas de filial e departamento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigTextarea
                label="Mensagem para Cliente Recorrente"
                value={config.returning_client_msg ?? ""}
                onChange={v => set("returning_client_msg", v)}
                onSave={() => saveKey("returning_client_msg")}
                saving={isSaving("returning_client_msg")}
                dirty={isDirty("returning_client_msg")}
                rows={6}
                hint="Variáveis: {nome}, {filial}, {departamento}, {lista_categorias}"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BOT MENSAGENS ─────────────────────────────────────────────────── */}
        <TabsContent value="mensagens" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Mensagens de Validação</CardTitle>
              <CardDescription>
                Textos exibidos quando o cliente não fornece informações válidas durante o fluxo do bot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ConfigTextarea
                label="Solicitar Nome (fallback)"
                value={config.ask_name_msg ?? ""}
                onChange={v => set("ask_name_msg", v)}
                onSave={() => saveKey("ask_name_msg")}
                saving={isSaving("ask_name_msg")}
                dirty={isDirty("ask_name_msg")}
                hint="Enviado quando o cliente não tem nome identificado pelo WhatsApp. O campo 'Mensagens Automáticas → ask_name' tem prioridade sobre este."
              />
              <ConfigTextarea
                label="Opção Inválida no Menu"
                value={config.invalid_option_msg ?? ""}
                onChange={v => set("invalid_option_msg", v)}
                onSave={() => saveKey("invalid_option_msg")}
                saving={isSaving("invalid_option_msg")}
                dirty={isDirty("invalid_option_msg")}
                hint="Enviado quando o cliente digita uma opção que não existe no menu."
              />
              <ConfigTextarea
                label="Descrição Obrigatória (retry)"
                value={config.ask_description_retry_msg ?? ""}
                onChange={v => set("ask_description_retry_msg", v)}
                onSave={() => saveKey("ask_description_retry_msg")}
                saving={isSaving("ask_description_retry_msg")}
                dirty={isDirty("ask_description_retry_msg")}
                hint="Enviado quando o cliente envia uma mensagem em branco na etapa de descrição do problema."
              />
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">Mensagens Automáticas Completas</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Para editar as mensagens principais do fluxo do bot (boas-vindas, abertura de chamado,
                    perguntas de filial/departamento/categoria, etc.), acesse
                    <strong> Configurações → Mensagens Automáticas</strong>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SLA & ALERTAS ──────────────────────────────────────────────────── */}
        <TabsContent value="sla" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuração de SLA</CardTitle>
              <CardDescription>
                Define o tempo máximo de atendimento antes que um chamado seja considerado fora do SLA.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigField
                label="Horas de SLA"
                value={config.sla_hours ?? ""}
                onChange={v => set("sla_hours", v)}
                onSave={() => saveKey("sla_hours")}
                saving={isSaving("sla_hours")}
                dirty={isDirty("sla_hours")}
                type="number"
                hint={`Chamados abertos/em atendimento há mais de ${config.sla_hours ?? "48"}h serão marcados como SLA estourado no Dashboard e em Alertas Operacionais.`}
              />
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-100">Impacto imediato</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    O novo valor de SLA é aplicado imediatamente ao Dashboard, KPIs e Alertas Operacionais
                    — sem reinicialização do servidor.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HORÁRIO COMERCIAL ──────────────────────────────────────────────── */}
        <TabsContent value="horario" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Horário de Atendimento</CardTitle>
              <CardDescription>
                Quando ativado, o bot responde fora do horário com a mensagem configurada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Ativar controle de horário</Label>
                  <p className="text-sm text-muted-foreground">
                    {config.business_hours_enabled === "true"
                      ? "Ativo — bot responde fora do horário com mensagem de indisponibilidade."
                      : "Inativo — bot responde normalmente a qualquer hora."}
                  </p>
                </div>
                <Switch
                  checked={config.business_hours_enabled === "true"}
                  onCheckedChange={v => {
                    set("business_hours_enabled", String(v));
                    setTimeout(() => saveKey("business_hours_enabled"), 100);
                  }}
                />
              </div>

              {config.business_hours_enabled === "true" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Horário de Início</Label>
                      <Input
                        type="time"
                        value={config.business_hours_start ?? "08:00"}
                        onChange={e => set("business_hours_start", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Horário de Fim</Label>
                      <Input
                        type="time"
                        value={config.business_hours_end ?? "18:00"}
                        onChange={e => set("business_hours_end", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Dias de Atendimento</Label>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS_MAP.map(d => {
                        const active = (config.business_days ?? "1,2,3,4,5").split(",").includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => toggleDay(d.value)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:border-primary"
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <ConfigTextarea
                    label="Mensagem Fora do Horário"
                    value={config.outside_hours_msg ?? ""}
                    onChange={v => set("outside_hours_msg", v)}
                    onSave={undefined}
                    saving={false}
                    dirty={isDirty("outside_hours_msg")}
                    hint="Variáveis: {inicio} e {fim} = horário de início/fim configurado acima."
                  />

                  <div className="flex justify-end">
                    <Button
                      onClick={() => saveGroup(["business_hours_start","business_hours_end","business_days","outside_hours_msg"])}
                      disabled={isSaving("business_hours_start","business_hours_end","business_days","outside_hours_msg")}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Horário Comercial
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  hint?: string;
  type?: string;
}

function ConfigField({ label, value, onChange, onSave, saving, dirty, hint, type = "text" }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label} {dirty && <Badge variant="outline" className="ml-2 text-xs text-amber-600 border-amber-400">não salvo</Badge>}</Label>
        <Button size="sm" variant="outline" onClick={onSave} disabled={saving || !dirty}>
          {saving ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
          Salvar
        </Button>
      </div>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        min={type === "number" ? "1" : undefined}
      />
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  );
}

interface TextareaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: (() => void) | undefined;
  saving: boolean;
  dirty: boolean;
  hint?: string;
  rows?: number;
}

function ConfigTextarea({ label, value, onChange, onSave, saving, dirty, hint, rows = 3 }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label} {dirty && <Badge variant="outline" className="ml-2 text-xs text-amber-600 border-amber-400">não salvo</Badge>}</Label>
        {onSave && (
          <Button size="sm" variant="outline" onClick={onSave} disabled={saving || !dirty}>
            {saving ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Salvar
          </Button>
        )}
      </div>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="font-mono text-sm resize-none"
      />
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  );
}
