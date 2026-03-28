import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  FlaskConical,
  ArrowLeft,
  FlaskRound,
  ImageIcon,
  Trash2,
  ChevronRight,
  Plus,
  LogIn,
  Search,
  Eraser,
  Loader2,
} from "lucide-react";

type Filter = "all" | "lab" | "imaging";

export default function History() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();

  const { data: labSessions, refetch: refetchLab } = trpc.lab.listSessions.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: imagingReports, refetch: refetchImaging } = trpc.imaging.listReports.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const deleteLabMutation = trpc.lab.deleteSession.useMutation({
    onSuccess: () => { refetchLab(); toast.success("Sessão removida."); },
    onError: () => toast.error("Erro ao remover sessão."),
  });
  const deleteImagingMutation = trpc.imaging.deleteReport.useMutation({
    onSuccess: () => { refetchImaging(); toast.success("Laudo removido."); },
    onError: () => toast.error("Erro ao remover laudo."),
  });

  const clearHistoryMutation = trpc.documents.clearHistory.useMutation({
    onSuccess: (data) => {
      refetchLab();
      refetchImaging();
      utils.documents.listDocuments.invalidate();
      const total = (data as any).total ?? (data as any).deletedDocuments ?? 0;
      toast.success(
        `Histórico limpo com sucesso. ${total} registro(s) removido(s).`
      );
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao limpar histórico.");
    },
  });

  if (!loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <FlaskConical className="h-10 w-10 text-blue-700" />
        <p className="text-slate-600 font-medium">Faça login para ver o histórico</p>
        <Button
          className="bg-blue-700 hover:bg-blue-800 text-white gap-1.5"
          onClick={() => (window.location.href = getLoginUrl())}
        >
          <LogIn className="h-4 w-4" />
          Entrar
        </Button>
      </div>
    );
  }

  // Unify and sort
  const labItems = (labSessions ?? []).map((s) => ({
    id: s.id,
    type: "lab" as const,
    patientName: s.patientName ?? "Paciente",
    subtitle: s.laboratory ?? s.collectionDate ?? "",
    date: s.createdAt,
    href: `/analysis/${s.id}`,
    onDelete: () => deleteLabMutation.mutate({ sessionId: s.id }),
  }));

  const imagingItems = (imagingReports ?? []).map((r) => ({
    id: r.id,
    type: "imaging" as const,
    patientName: r.patientName ?? "Paciente",
    subtitle: r.examType ?? r.examDate ?? "",
    date: r.createdAt,
    href: `/imaging/${r.id}`,
    onDelete: () => deleteImagingMutation.mutate({ reportId: r.id }),
  }));

  const allItems = [...labItems, ...imagingItems].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const filtered = allItems
    .filter((i) => filter === "all" || i.type === filter)
    .filter((i) =>
      search === "" ||
      i.patientName.toLowerCase().includes(search.toLowerCase()) ||
      i.subtitle.toLowerCase().includes(search.toLowerCase())
    );

  const isClearingHistory = clearHistoryMutation.isPending;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 text-slate-600">
            <ArrowLeft className="h-4 w-4" />
            Início
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-blue-700" />
            <span className="font-semibold text-slate-800">MedSuite</span>
          </div>
        </div>
        <Button
          onClick={() => navigate("/")}
          className="bg-blue-700 hover:bg-blue-800 text-white gap-1.5"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Novo laudo
        </Button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Histórico de Laudos</h1>
            <p className="text-slate-500 text-sm mt-1">
              {allItems.length} laudo(s) armazenado(s)
            </p>
          </div>

          {/* Botão Limpar Histórico */}
          {allItems.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 flex-shrink-0"
                  disabled={isClearingHistory}
                >
                  {isClearingHistory ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eraser className="h-4 w-4" />
                  )}
                  Limpar histórico
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá remover permanentemente todos os{" "}
                    <strong>{allItems.length} laudo(s)</strong> do seu histórico,
                    incluindo exames laboratoriais e laudos de imagem. Esta operação
                    não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => clearHistoryMutation.mutate()}
                  >
                    Sim, limpar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex gap-2">
            {(["all", "lab", "imaging"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors
                  ${filter === f
                    ? "bg-blue-700 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
              >
                {f === "all" ? "Todos" : f === "lab" ? "Laboratório" : "Imagem"}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por paciente ou tipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Items */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum laudo encontrado</p>
            <p className="text-sm mt-1">Carregue um arquivo para começar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-blue-300 transition-colors group"
              >
                {/* Icon */}
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                    ${item.type === "lab" ? "bg-blue-50" : "bg-teal-50"}`}
                >
                  {item.type === "lab" ? (
                    <FlaskRound className="h-4 w-4 text-blue-600" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-teal-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">
                    {item.patientName}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {item.type === "lab" ? "Laboratório" : "Imagem"}{item.subtitle ? ` · ${item.subtitle}` : ""} ·{" "}
                    {new Date(item.date).toLocaleDateString("pt-BR")}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                    onClick={(e) => { e.stopPropagation(); item.onDelete(); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-slate-500 hover:text-blue-700 flex-shrink-0"
                  onClick={() => navigate(item.href)}
                >
                  Ver
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
