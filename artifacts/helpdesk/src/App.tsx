import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { useSSE } from "@/hooks/useSSE";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Shell } from "@/components/layout/Shell";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const ANALYST_ROLES = ["technician", "attendant"];

import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Tickets from "@/pages/Tickets";
import TicketDetail from "@/pages/TicketDetail";
import Alerts from "@/pages/Alerts";
import Inventory from "@/pages/Inventory";
import Whatsapp from "@/pages/Settings/Whatsapp";
import Branches from "@/pages/Settings/Branches";
import Departments from "@/pages/Settings/Departments";
import Categories from "@/pages/Settings/Categories";
import Messages from "@/pages/Settings/Messages";
import Usuarios from "@/pages/Settings/Usuarios";
import CannedResponses from "@/pages/Settings/CannedResponses";
import Roles from "@/pages/Settings/Roles";
import Audit from "@/pages/Settings/Audit";
import SupplierConversations from "@/pages/SupplierConversations";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,        // 1 min — SSE invalida quando há mudanças reais
      gcTime: 5 * 60_000,      // mantém em cache 5 min
    },
  },
});

function ForcePasswordChange() {
  const { clearMustChange } = useAuth();
  const { toast } = useToast();
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (newPass.trim().length < 4) {
      toast({ title: "A senha deve ter pelo menos 4 caracteres", variant: "destructive" }); return;
    }
    if (newPass !== confirmPass) {
      toast({ title: "As senhas não coincidem", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "", newPassword: newPass }),
      });
      toast({ title: "Senha definida com sucesso! Bem-vindo(a)." });
      clearMustChange();
    } catch (e: any) {
      toast({ title: e?.message ?? "Erro ao salvar senha", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Defina sua senha</h1>
          <p className="text-sm text-muted-foreground">
            Por segurança, você precisa criar uma senha pessoal no seu primeiro acesso.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                placeholder="Mínimo 4 caracteres"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                className="pr-10"
              />
              <button type="button" className="absolute right-3 top-2.5 text-muted-foreground"
                onClick={() => setShowNew(v => !v)}>
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Confirmar senha</Label>
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                placeholder="Repita a nova senha"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                className="pr-10"
              />
              <button type="button" className="absolute right-3 top-2.5 text-muted-foreground"
                onClick={() => setShowConfirm(v => !v)}>
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving || !newPass || !confirmPass}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar e entrar
          </Button>
        </div>
      </div>
    </div>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useSSE();

  // Always redirect to /home on first load / page refresh for all users
  useEffect(() => {
    if (!user) return;
    navigate("/home", { replace: true });
  }, [user?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Login />;

  // Force password change on first access
  if (user.mustChangePassword) return <ForcePasswordChange />;

  const isAnalyst = ANALYST_ROLES.includes(user.role);

  return (
    <Shell>
      <Switch>
        <Route path="/home" component={Home} />
        <Route path="/tickets" component={Tickets} />
        <Route path="/tickets/:id" component={TicketDetail} />
        {isAnalyst ? (
          <Route component={() => <Redirect to="/home" />} />
        ) : (
          <>
            <Route path="/" component={Dashboard} />
            <Route path="/alerts" component={Alerts} />
            <Route path="/inventory" component={Inventory} />
            <Route path="/settings/whatsapp" component={Whatsapp} />
            <Route path="/settings/branches" component={Branches} />
            <Route path="/settings/departments" component={Departments} />
            <Route path="/settings/categories" component={Categories} />
            <Route path="/settings/messages" component={Messages} />
            <Route path="/settings/usuarios" component={Usuarios} />
            <Route path="/settings/canned-responses" component={CannedResponses} />
            <Route path="/settings/roles" component={Roles} />
            <Route path="/settings/audit" component={Audit} />
            {(user.role === "admin" || user.role === "manager") && (
              <Route path="/supplier-conversations" component={SupplierConversations} />
            )}
            <Route component={NotFound} />
          </>
        )}
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
