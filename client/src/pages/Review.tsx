import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FlaskConical,
  ArrowLeft,
  CheckSquare,
  Square,
  FlaskRound,
  ImageIcon,
  HelpCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";

type Classification = "laudo" | "imagem" | "indefinido";

const classLabels: Record<Classification, { label: string; color: string; icon: React.ReactNode }> = {
  laudo: {
    label: "Laboratório / Relatório",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: <FlaskRound className="h-3.5 w-3.5" />,
  },
  imagem: {
    label: "Imagem diagnóstica",
    color: "bg-teal-100 text-teal-700 border-teal-200",
    icon: <ImageIcon className="h-3.5 w-3.5" />,
  },
  indefinido: {
    label: "Indefinido",
    color: "bg-slate-100 text-slate-500 border-slate-200",
    icon: <HelpCircle className="h-3.5 w-3.5" />,
  },
};

export default function Review() {
  const params = useParams<{ documentId: string }>();
  const documentId = parseInt(params.documentId ?? "0");
  const [, navigate] = useLocation();

  const [analyzing, setAnalyzing] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);

  const { data, isLoading, refetch } = trpc.documents.getDocument.useQuery(
    { documentId },
    { enabled: !!documentId }
  );

  const analyzeMutation = trpc.documents.analyze.useMutation({
    onSuccess: () => {
      setAnalyzing(false);
      refetch();
    },
    onError: (err) => {
      setAnalyzing(false);
      toast.error(err.message ?? "Erro ao analisar documento.");
    },
  });

  const updateClassMutation = trpc.documents.updatePageClassification.useMutation();

  const processMutation = trpc.documents.process.useMutation({
    onSuccess: (result) => {
      setProcessing(false);
      toast.success("Documento processado com sucesso!");
      if (result.resultType === "lab") {
        navigate(`/analysis/${result.resultId}`);
      } else {
        navigate(`/imaging/${result.resultId}`);
      }
    },
    onError: (err) => {
      setProcessing(false);
      toast.error(err.message ?? "Erro ao processar documento.");
    },
  });

  // Auto-analisar ao entrar na página se ainda não foi analisado
  useEffect(() => {
    if (data?.document && data.document.status === "uploaded" && !analyzing) {
      setAnalyzing(true);
      analyzeMutation.mutate({ documentId });
    }
  }, [data?.document?.status]);

  // Selecionar todas as páginas "laudo" por padrão após análise
  useEffect(() => {
    if (data?.pages && data.pages.length > 0 && selectedPages.size === 0) {
      const laudoPages = data.pages
        .filter((p) => p.classification === "laudo")
        .map((p) => p.pageNumber);
      if (laudoPages.length > 0) {
        setSelectedPages(new Set(laudoPages));
      } else {
        // Se nenhuma for laudo, selecionar todas
        setSelectedPages(new Set(data.pages.map((p) => p.pageNumber)));
      }
    }
  }, [data?.pages]);

  const togglePage = (pageNumber: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  };

  const changeClassification = (pageId: number, classification: Classification) => {
    updateClassMutation.mutate({ pageId, classification });
  };

  const handleProcess = () => {
    if (selectedPages.size === 0) {
      toast.error("Selecione ao menos uma página para processar.");
      return;
    }
    setProcessing(true);
    processMutation.mutate({
      documentId,
      selectedPageNumbers: Array.from(selectedPages),
    });
  };

  const isLoaded = data?.document?.status === "analyzed" && data.pages.length > 0;
  const isAnalyzing = analyzing || data?.document?.status === "analyzing";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 text-slate-600">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-blue-700" />
            <span className="font-semibold text-slate-800">MedSuite</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isLoaded && (
            <span className="text-sm text-slate-500">
              {selectedPages.size} de {data.pages.length} página(s) selecionada(s)
            </span>
          )}
          <Button
            onClick={handleProcess}
            disabled={!isLoaded || processing || selectedPages.size === 0}
            className="bg-blue-700 hover:bg-blue-800 text-white gap-1.5"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                Processar selecionadas
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {/* File info */}
        {data?.document && (
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-slate-800">
              Revisão do Documento
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {data.document.originalName} · {data.document.totalPages} página(s)
            </p>
          </div>
        )}

        {/* Analyzing state */}
        {(isLoading || isAnalyzing) && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-600 font-medium">Analisando documento...</p>
            <p className="text-slate-400 text-sm">
              Gerando miniaturas e classificando páginas
            </p>
          </div>
        )}

        {/* Error state */}
        {data?.document?.status === "error" && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="text-red-600 font-medium">Erro ao analisar documento.</p>
            <Button
              variant="outline"
              onClick={() => { setAnalyzing(true); analyzeMutation.mutate({ documentId }); }}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Pages grid */}
        {isLoaded && (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Selecione as páginas que deseja processar e ajuste a classificação se necessário.
              Páginas classificadas como <strong>Laboratório / Relatório</strong> serão processadas como exames laboratoriais;
              as demais como exames de imagem.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {data.pages.map((page) => {
                const selected = selectedPages.has(page.pageNumber);
                const cls = (page.classification ?? "indefinido") as Classification;
                const clsMeta = classLabels[cls];

                return (
                  <div
                    key={page.id}
                    className={`relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all duration-150 bg-white
                      ${selected ? "border-blue-500 shadow-md" : "border-slate-200 hover:border-slate-300"}
                    `}
                    onClick={() => togglePage(page.pageNumber)}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden">
                      {page.thumbnailUrl ? (
                        <img
                          src={page.thumbnailUrl}
                          alt={`Página ${page.pageNumber}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileIcon />
                      )}
                    </div>

                    {/* Selection indicator */}
                    <div className="absolute top-2 right-2">
                      {selected ? (
                        <CheckSquare className="h-5 w-5 text-blue-600 drop-shadow-sm" />
                      ) : (
                        <Square className="h-5 w-5 text-slate-400 drop-shadow-sm" />
                      )}
                    </div>

                    {/* Page number */}
                    <div className="absolute top-2 left-2 bg-black/50 text-white text-xs font-medium px-1.5 py-0.5 rounded">
                      Pág. {page.pageNumber}
                    </div>

                    {/* Classification badge + selector */}
                    <div className="p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${clsMeta.color}`}
                      >
                        {clsMeta.icon}
                        {clsMeta.label}
                      </span>
                      <select
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={cls}
                        onChange={(e) =>
                          changeClassification(page.id, e.target.value as Classification)
                        }
                      >
                        <option value="laudo">Laboratório / Relatório</option>
                        <option value="imagem">Imagem diagnóstica</option>
                        <option value="indefinido">Indefinido</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-500">
              {Object.entries(classLabels).map(([key, val]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${val.color}`}>
                    {val.icon}
                    {val.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FileIcon() {
  return (
    <div className="flex flex-col items-center gap-2 text-slate-300">
      <FlaskConical className="h-10 w-10" />
      <span className="text-xs">Sem prévia</span>
    </div>
  );
}
