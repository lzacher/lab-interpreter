/**
 * MedSuite — Página de Revisão de Documento
 *
 * Fluxo:
 * 1. Ao entrar, dispara análise automática (thumbnails + classificação por LLM)
 * 2. Exibe grade de thumbnails com badge de classificação por página
 * 3. Usuário pode corrigir a classificação e selecionar páginas para OCR
 * 4. Botão "Processar" dispara OCR → extração JSON → roteamento automático
 */

import { useEffect, useState, useCallback } from "react";
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
  CheckCheck,
  X,
  FileText,
  ScanLine,
  Layers,
  AlertCircle,
  ZoomIn,
  ChevronLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Classification = "laudo" | "imagem" | "indefinido";

interface PageMeta {
  id: number;
  pageNumber: number;
  thumbnailUrl: string | null;
  classification: Classification;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASS_CONFIG: Record<
  Classification,
  { label: string; shortLabel: string; badgeClass: string; icon: React.ReactNode; description: string }
> = {
  laudo: {
    label: "Laboratório / Relatório",
    shortLabel: "Laboratório",
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: <FlaskRound className="h-3 w-3" />,
    description: "Página com texto de resultado ou relatório médico",
  },
  imagem: {
    label: "Imagem diagnóstica",
    shortLabel: "Imagem",
    badgeClass: "bg-teal-50 text-teal-700 border border-teal-200",
    icon: <ImageIcon className="h-3 w-3" />,
    description: "Página com imagem diagnóstica (RX, US, TC, RM)",
  },
  indefinido: {
    label: "Indefinido",
    shortLabel: "Indefinido",
    badgeClass: "bg-slate-100 text-slate-500 border border-slate-200",
    icon: <HelpCircle className="h-3 w-3" />,
    description: "Página ambígua ou em branco",
  },
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: "upload" | "review" | "process" | "result" }) {
  const steps = [
    { key: "upload", label: "Upload" },
    { key: "review", label: "Revisão" },
    { key: "process", label: "Processamento" },
    { key: "result", label: "Resultado" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => (
        <div key={step.key} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                ${idx < currentIdx ? "bg-blue-700 text-white" : ""}
                ${idx === currentIdx ? "bg-blue-700 text-white ring-2 ring-blue-200" : ""}
                ${idx > currentIdx ? "bg-slate-200 text-slate-400" : ""}
              `}
            >
              {idx < currentIdx ? <CheckCheck className="h-3 w-3" /> : idx + 1}
            </div>
            <span
              className={`text-xs font-medium hidden sm:block
                ${idx === currentIdx ? "text-blue-700" : idx < currentIdx ? "text-slate-600" : "text-slate-400"}
              `}
            >
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`w-8 h-px mx-1 ${idx < currentIdx ? "bg-blue-700" : "bg-slate-200"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Zoom Modal ───────────────────────────────────────────────────────────────

interface ZoomModalProps {
  pages: PageMeta[];
  initialIndex: number;
  onClose: () => void;
  onChangeClassification: (pageId: number, cls: Classification) => void;
  onToggleSelect: (pageNumber: number) => void;
  selectedPages: Set<number>;
  updatingId: number | null;
}

function ZoomModal({ pages, initialIndex, onClose, onChangeClassification, onToggleSelect, selectedPages, updatingId }: ZoomModalProps) {
  const [idx, setIdx] = useState(initialIndex);
  const page = pages[idx];
  const cls = page?.classification ?? "indefinido";
  const config = CLASS_CONFIG[cls];
  const selected = page ? selectedPages.has(page.pageNumber) : false;

  // Close on Escape, navigate with arrow keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, pages.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pages.length, onClose]);

  if (!page) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm">Página {page.pageNumber}</span>
            <span className="text-slate-400 text-xs">de {pages.length}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${config.badgeClass}`}>
              {config.icon}
              {config.shortLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Select / Deselect button */}
            <button
              onClick={() => onToggleSelect(page.pageNumber)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
                ${selected
                  ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
            >
              {selected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {selected ? "Selecionada" : "Selecionar"}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 overflow-auto bg-slate-50 flex items-start justify-center p-4">
          {page.thumbnailUrl ? (
            <img
              src={page.thumbnailUrl}
              alt={`Página ${page.pageNumber}`}
              className="max-w-full rounded-lg shadow-md border border-slate-200"
              style={{ maxHeight: "60vh", objectFit: "contain" }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-300 py-16">
              <FileText className="h-16 w-16" />
              <span className="text-sm">Sem prévia disponível</span>
            </div>
          )}
        </div>

        {/* Classification + navigation */}
        <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 shrink-0">Classificar como:</span>
            <select
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700
                focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
              value={cls}
              onChange={(e) => onChangeClassification(page.id, e.target.value as Classification)}
              disabled={updatingId === page.id}
            >
              <option value="laudo">Laboratório / Relatório</option>
              <option value="imagem">Imagem diagnóstica</option>
              <option value="indefinido">Indefinido</option>
            </select>
            {updatingId === page.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />}
          </div>

          {/* Prev / Next navigation */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIdx((i) => Math.max(i - 1, 0))}
              disabled={idx === 0}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Página anterior (←)"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <span className="text-xs text-slate-500 min-w-[4rem] text-center">{idx + 1} / {pages.length}</span>
            <button
              onClick={() => setIdx((i) => Math.min(i + 1, pages.length - 1))}
              disabled={idx === pages.length - 1}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Próxima página (→)"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page Card ────────────────────────────────────────────────────────────────

interface PageCardProps {
  page: PageMeta;
  selected: boolean;
  onToggle: () => void;
  onZoom: () => void;
  onChangeClassification: (cls: Classification) => void;
  updatingId: number | null;
}

function PageCard({ page, selected, onToggle, onZoom, onChangeClassification, updatingId }: PageCardProps) {
  const cls = page.classification;
  const config = CLASS_CONFIG[cls];
  const isUpdating = updatingId === page.id;

  return (
    <div
      className={`relative rounded-xl border-2 overflow-hidden bg-white transition-all duration-150 group
        ${selected
          ? "border-blue-500 shadow-md shadow-blue-100"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
        }
      `}
    >
      {/* Thumbnail */}
      <div
        className="aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden cursor-pointer relative"
        onClick={onToggle}
      >
        {page.thumbnailUrl ? (
          <img
            src={page.thumbnailUrl}
            alt={`Página ${page.pageNumber}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-300">
            <FileText className="h-10 w-10" />
            <span className="text-xs">Sem prévia</span>
          </div>
        )}

        {/* Overlay de seleção */}
        <div
          className={`absolute inset-0 transition-colors duration-150
            ${selected ? "bg-blue-500/10" : "bg-transparent group-hover:bg-slate-900/5"}
          `}
        />

        {/* Número da página */}
        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-1.5 py-0.5 rounded">
          Pág. {page.pageNumber}
        </div>

        {/* Checkbox de seleção */}
        <div className="absolute top-2 right-2">
          {selected ? (
            <div className="bg-blue-600 rounded p-0.5">
              <CheckSquare className="h-4 w-4 text-white" />
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded p-0.5">
              <Square className="h-4 w-4 text-slate-400" />
            </div>
          )}
        </div>

        {/* Zoom button — aparece no hover */}
        <button
          className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm rounded-lg p-1.5 shadow-sm
            opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-white"
          onClick={(e) => { e.stopPropagation(); onZoom(); }}
          title="Ampliar página"
        >
          <ZoomIn className="h-3.5 w-3.5 text-slate-600" />
        </button>
      </div>

      {/* Rodapé do card — classificação */}
      <div className="p-2.5 space-y-2" onClick={(e) => e.stopPropagation()}>
        {/* Badge atual */}
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${config.badgeClass}`}>
            {config.icon}
            {config.shortLabel}
          </span>
          {isUpdating && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        </div>

        {/* Dropdown de correção */}
        <select
          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600
            focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 cursor-pointer"
          value={cls}
          onChange={(e) => onChangeClassification(e.target.value as Classification)}
          disabled={isUpdating}
          title="Corrigir classificação desta página"
        >
          <option value="laudo">Laboratório / Relatório</option>
          <option value="imagem">Imagem diagnóstica</option>
          <option value="indefinido">Indefinido</option>
        </select>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Review() {
  const params = useParams<{ documentId: string }>();
  const documentId = parseInt(params.documentId ?? "0");
  const [, navigate] = useLocation();

  const [analyzing, setAnalyzing] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [updatingPageId, setUpdatingPageId] = useState<number | null>(null);
  // Local copy of pages to reflect classification changes immediately
  const [localPages, setLocalPages] = useState<PageMeta[]>([]);
  // Zoom modal: index into localPages (-1 = closed)
  const [zoomIndex, setZoomIndex] = useState<number>(-1);

  const { data, isLoading, refetch } = trpc.documents.getDocument.useQuery(
    { documentId },
    { enabled: !!documentId, refetchInterval: analyzing ? 2000 : false }
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

  const updateClassMutation = trpc.documents.updatePageClassification.useMutation({
    onSuccess: (_, vars) => {
      setUpdatingPageId(null);
      setLocalPages((prev) =>
        prev.map((p) =>
          p.id === vars.pageId ? { ...p, classification: vars.classification } : p
        )
      );
    },
    onError: (err) => {
      setUpdatingPageId(null);
      toast.error(err.message ?? "Erro ao atualizar classificação.");
    },
  });

  const processMutation = trpc.documents.process.useMutation({
    onSuccess: (result) => {
      setProcessing(false);
      toast.success(`Documento processado! ${result.pagesProcessed} página(s) extraída(s).`);
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

  // Sincronizar páginas locais com dados do servidor
  useEffect(() => {
    if (data?.pages && data.pages.length > 0) {
      setLocalPages(
        data.pages.map((p) => ({
          id: p.id,
          pageNumber: p.pageNumber,
          thumbnailUrl: p.thumbnailUrl ?? null,
          classification: (p.classification ?? "indefinido") as Classification,
        }))
      );
    }
  }, [data?.pages]);

  // Selecionar automaticamente as páginas "laudo" após análise
  useEffect(() => {
    if (localPages.length > 0 && selectedPages.size === 0) {
      const laudoPages = localPages
        .filter((p) => p.classification === "laudo")
        .map((p) => p.pageNumber);
      setSelectedPages(new Set(laudoPages.length > 0 ? laudoPages : localPages.map((p) => p.pageNumber)));
    }
  }, [localPages]);

  const togglePage = useCallback((pageNumber: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  }, []);

  const selectAllLaudo = () => {
    const laudoPages = localPages.filter((p) => p.classification === "laudo").map((p) => p.pageNumber);
    setSelectedPages(new Set(laudoPages.length > 0 ? laudoPages : localPages.map((p) => p.pageNumber)));
  };

  const selectAll = () => setSelectedPages(new Set(localPages.map((p) => p.pageNumber)));
  const deselectAll = () => setSelectedPages(new Set());

  const changeClassification = (pageId: number, classification: Classification) => {
    setUpdatingPageId(pageId);
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
      selectedPageNumbers: Array.from(selectedPages).sort((a, b) => a - b),
    });
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const isAnalyzing = analyzing || data?.document?.status === "analyzing";
  const isAnalyzed = data?.document?.status === "analyzed" && localPages.length > 0;
  const hasError = data?.document?.status === "error";

  const laudoCount = localPages.filter((p) => p.classification === "laudo").length;
  const imagemCount = localPages.filter((p) => p.classification === "imagem").length;
  const indefinidoCount = localPages.filter((p) => p.classification === "indefinido").length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-1.5 text-slate-600 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
          <div className="h-5 w-px bg-slate-200 shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            <FlaskConical className="h-5 w-5 text-blue-700" />
            <span className="font-semibold text-slate-800">MedSuite</span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="hidden md:block">
          <StepIndicator current={processing ? "process" : "review"} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isAnalyzed && (
            <span className="text-xs text-slate-500 hidden sm:block">
              {selectedPages.size}/{localPages.length} selecionada(s)
            </span>
          )}
          <Button
            onClick={handleProcess}
            disabled={!isAnalyzed || processing || selectedPages.size === 0}
            size="sm"
            className="bg-blue-700 hover:bg-blue-800 text-white gap-1.5"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Processando...</span>
              </>
            ) : (
              <>
                <ScanLine className="h-4 w-4" />
                <span className="hidden sm:inline">Processar selecionadas</span>
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">

        {/* File info + controls */}
        {data?.document && (
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Revisão do Documento</h1>
              <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {data.document.originalName}
                {data.document.totalPages ? ` · ${data.document.totalPages} página(s)` : ""}
              </p>
            </div>

            {/* Stats + selection buttons */}
            {isAnalyzed && (
              <div className="flex flex-col gap-2 items-start sm:items-end">
                {/* Classification summary */}
                <div className="flex items-center gap-2 flex-wrap">
                  {laudoCount > 0 && (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${CLASS_CONFIG.laudo.badgeClass}`}>
                      {CLASS_CONFIG.laudo.icon}
                      {laudoCount} laudo(s)
                    </span>
                  )}
                  {imagemCount > 0 && (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${CLASS_CONFIG.imagem.badgeClass}`}>
                      {CLASS_CONFIG.imagem.icon}
                      {imagemCount} imagem(ns)
                    </span>
                  )}
                  {indefinidoCount > 0 && (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${CLASS_CONFIG.indefinido.badgeClass}`}>
                      {CLASS_CONFIG.indefinido.icon}
                      {indefinidoCount} indefinido(s)
                    </span>
                  )}
                </div>

                {/* Selection shortcuts */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-400">Selecionar:</span>
                  <button
                    onClick={selectAllLaudo}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                  >
                    Laudos
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    onClick={selectAll}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                  >
                    Todas
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    onClick={deselectAll}
                    className="text-xs text-slate-500 hover:text-slate-700 hover:underline font-medium"
                  >
                    Nenhuma
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Analyzing state ─────────────────────────────────────────────── */}
        {(isLoading || isAnalyzing) && (
          <div className="flex flex-col items-center justify-center py-32 gap-5">
            <div className="relative">
              <div className="w-14 h-14 border-2 border-blue-200 rounded-full" />
              <div className="w-14 h-14 border-2 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0" />
              <Layers className="h-5 w-5 text-blue-600 absolute inset-0 m-auto" />
            </div>
            <div className="text-center">
              <p className="text-slate-700 font-medium">Analisando documento</p>
              <p className="text-slate-400 text-sm mt-1">
                Gerando miniaturas e classificando páginas com IA...
              </p>
            </div>
          </div>
        )}

        {/* ── Error state ─────────────────────────────────────────────────── */}
        {hasError && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-slate-700 font-medium">Erro ao analisar documento</p>
              <p className="text-slate-400 text-sm mt-1">
                Verifique se o arquivo está legível e tente novamente.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAnalyzing(true);
                analyzeMutation.mutate({ documentId });
              }}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* ── Processing overlay ───────────────────────────────────────────── */}
        {processing && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <div className="w-16 h-16 border-2 border-blue-200 rounded-full" />
              <div className="w-16 h-16 border-2 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0" />
              <ScanLine className="h-6 w-6 text-blue-600 absolute inset-0 m-auto" />
            </div>
            <div className="text-center">
              <p className="text-slate-800 font-semibold text-lg">Processando documento</p>
              <p className="text-slate-500 text-sm mt-1">
                Realizando OCR e extraindo dados estruturados...
              </p>
              <p className="text-slate-400 text-xs mt-3">
                Este processo pode levar alguns segundos.
              </p>
            </div>
          </div>
        )}

        {/* ── Instruction banner ───────────────────────────────────────────── */}
        {isAnalyzed && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-blue-700 text-xs font-bold">i</span>
            </div>
            <p className="text-sm text-blue-700 leading-relaxed">
              Clique nas páginas para selecioná-las para OCR. Corrija a classificação pelo menu abaixo de cada miniatura se necessário.
              Páginas classificadas como <strong>Laboratório / Relatório</strong> serão processadas como exames laboratoriais;
              as demais como exames de imagem.
            </p>
          </div>
        )}

        {/* ── Pages grid ──────────────────────────────────────────────────── */}
        {isAnalyzed && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {localPages.map((page, idx) => (
              <PageCard
                key={page.id}
                page={page}
                selected={selectedPages.has(page.pageNumber)}
                onToggle={() => togglePage(page.pageNumber)}
                onZoom={() => setZoomIndex(idx)}
                onChangeClassification={(cls) => changeClassification(page.id, cls)}
                updatingId={updatingPageId}
              />
            ))}
          </div>
        )}

        {/* ── Zoom Modal ───────────────────────────────────────────────────── */}
        {zoomIndex >= 0 && (
          <ZoomModal
            pages={localPages}
            initialIndex={zoomIndex}
            onClose={() => setZoomIndex(-1)}
            onChangeClassification={(pageId, cls) => changeClassification(pageId, cls)}
            onToggleSelect={togglePage}
            selectedPages={selectedPages}
            updatingId={updatingPageId}
          />
        )}

        {/* ── Bottom action bar (mobile-friendly) ─────────────────────────── */}
        {isAnalyzed && (
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200">
            <p className="text-sm text-slate-500">
              <strong className="text-slate-700">{selectedPages.size}</strong> de{" "}
              <strong className="text-slate-700">{localPages.length}</strong> página(s) selecionada(s) para OCR
            </p>
            <Button
              onClick={handleProcess}
              disabled={processing || selectedPages.size === 0}
              className="bg-blue-700 hover:bg-blue-800 text-white gap-2 w-full sm:w-auto"
            >
              <ScanLine className="h-4 w-4" />
              Processar {selectedPages.size} página(s)
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
