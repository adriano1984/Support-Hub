import { useGetWhatsappStatus, useReconnectWhatsapp, useDisconnectWhatsapp, getGetWhatsappStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCcw, PowerOff, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Whatsapp() {
  const { data: status, isLoading } = useGetWhatsappStatus({
    query: { refetchInterval: 3000, queryKey: getGetWhatsappStatusQueryKey() }
  });

  const reconnect = useReconnectWhatsapp();
  const disconnect = useDisconnectWhatsapp();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integração WhatsApp</h1>
        <p className="text-muted-foreground">Gerencie a conexão com o número de WhatsApp do suporte.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Status da Conexão</CardTitle>
              <CardDescription>Estado atual da sessão do WhatsApp</CardDescription>
            </div>
            {status?.status === "connected" && (
              <Badge className="bg-emerald-500">Conectado</Badge>
            )}
            {status?.status === "qr_ready" && (
              <Badge variant="outline" className="text-amber-500 border-amber-500">Aguardando Leitura</Badge>
            )}
            {status?.status === "connecting" && (
              <Badge variant="secondary">Conectando...</Badge>
            )}
            {status?.status === "disconnected" && (
              <Badge variant="destructive">Desconectado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 min-h-[300px]">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Verificando status...</p>
            </div>
          ) : status?.status === "connected" ? (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="h-24 w-24 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <ShieldCheck className="h-12 w-12 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-500">Conectado com Sucesso</h3>
                <p className="text-muted-foreground text-lg">
                  {status.profileName} <br />
                  <span className="font-mono text-sm">{status.phoneNumber}</span>
                </p>
              </div>
            </div>
          ) : status?.status === "qr_ready" && status.qrCode ? (
            <div className="flex flex-col items-center gap-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border">
                <img src={status.qrCode} alt="QR Code WhatsApp" className="w-64 h-64 object-contain" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="font-semibold text-lg">Escaneie para conectar</h3>
                <p className="text-sm text-muted-foreground">Abra o WhatsApp no seu celular, vá em Dispositivos Conectados e escaneie este QR Code.</p>
              </div>
            </div>
          ) : status?.status === "disconnected" ? (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="h-24 w-24 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20">
                <AlertTriangle className="h-12 w-12 text-destructive" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-destructive">Não Conectado</h3>
                <p className="text-muted-foreground">Clique em reconectar para gerar um novo QR Code.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Iniciando sessão...</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="bg-muted/50 justify-end gap-2 border-t">
          {status?.status === "connected" ? (
            <Button 
              variant="destructive" 
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              <PowerOff className="h-4 w-4 mr-2" /> Desconectar
            </Button>
          ) : (
            <Button 
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending || status?.status === "connecting"}
            >
              <RefreshCcw className={`h-4 w-4 mr-2 ${reconnect.isPending ? 'animate-spin' : ''}`} /> 
              {status?.status === "qr_ready" ? "Gerar Novo QR" : "Reconectar"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
