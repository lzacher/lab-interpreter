import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FlaskConical,
  Plus,
  Trash2,
  ChevronRight,
  Calendar,
  User,
  Building2,
  LogIn,
  Loader2,
  ClipboardList,
} from "lucide-react";

export default function Dashboard() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: sessions, isLoading } = trpc.lab.listSessions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const deleteMutation = trpc.lab.deleteSession.useMutation({
    onSuccess: () => {
      toast.success("Análise removida.");
      utils.lab.listSessions.invalidate();
    },
    onError: () => toast.error("Erro ao remover análise."),
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <FlaskConical className="h-10 w-10 text-primary" />
        <p className="text-muted-foreground">Faça login para ver seu histórico.</p>
        <Button onClick={() => (window.location.href = "/login")}>
          <LogIn className="h-4 w-4 mr-1.5" />
          Entrar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <FlaskConical className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground tracking-tight">LabInterpreter</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
            <Button size="sm" onClick={() => navigate("/")}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nova análise
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Histórico de Análises</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Todas as análises laboratoriais carregadas na plataforma.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : sessions && sessions.length > 0 ? (
          <div className="grid gap-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/40 hover:shadow-sm transition-all group cursor-pointer"
                onClick={() => navigate(`/analysis/${s.id}`)}
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="h-5 w-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground truncate">
                      {s.patientName ?? "Paciente sem nome"}
                    </span>
                    {s.patientSex && (
                      <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                        {s.patientSex}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                    {s.collectionDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Coleta: {s.collectionDate}
                      </span>
                    )}
                    {s.laboratory && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {s.laboratory}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Importado: {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Remover esta análise?")) {
                        deleteMutation.mutate({ sessionId: s.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Nenhuma análise encontrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Carregue um arquivo JSON para começar.
              </p>
            </div>
            <Button onClick={() => navigate("/")}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nova análise
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
