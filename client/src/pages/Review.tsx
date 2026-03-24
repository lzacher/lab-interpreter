/**
 * MedSuite — Página de Revisão de Documento (v5)
 *
 * Fluxo correto:
 * 1. Recebe documentId da URL (/:documentId)
 * 2. Busca metadados do documento via trpc.documents.getDocument
 * 3. Baixa o arquivo do S3 para renderização client-side via PDF.js
 * 4. Usuário classifica cada página (lab / imagem / indefinido) e seleciona para OCR
 * 5. Ao clicar "Processar": chama trpc.documents.process com páginas selecionadas
 * 6. Redireciona para /analysis/:id ou /imaging/:id conforme o tipo detectado
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { PdfPageCanvas } from "@/components/PdfPageCanvas";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FlaskConical,
  ImageIcon,
  HelpCircle,
  CheckSquare,
  Square,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  ArrowLeft,
  CheckCheck,
  AlertCircle,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageType = "laudo" | "imagem" | "indefinido";

interface PageInfo {
  pageNumber: number;
  type: PageType;
  selected: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PageType, string> = {
  laudo: "Laboratório / Relatório",
  imagem: "Imagem diagnóstica",
  indefinido: "Indefinido",
};

const TYPE_COLORS: Record<PageType, string> = {
  laudo: "bg-blue-50 text-blue-700 border-blue-200",
  imagem: "bg-emerald-50 text-emerald-700 border-emerald-200",
  indefinido: "bg-amber-50 text-amber-600 border-amber-200",
};

const TYPE_ICONS: Record<PageType, React.ReactNode> = {
  laudo: <FlaskConical className="w-3 h-3" />,
  imagem: <ImageIcon className="w-3 h-3" />,
  indefinido: <HelpCircle className="w-3 h-3" />,
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator() {
  const steps = ["Upload", "Revisão", "Processamento", "Resultado"];
  return (
    <div className="hidden md:flex items-center gap-0">
      {steps.map((label, idx) => (
        <div key={label} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                ${idx === 0 ? "bg-blue-700 text-white" : ""}
                ${idx === 1 ? "bg-blue-700 text-white ring-2 ring-blue-200" : ""}
                ${idx > 1 ? "bg-slate-200 text-slate-400" : ""}
              `}
            >
              {idx === 0 ? <CheckCheck className="h-3 w-3" /> : idx + 1}
            </div>
            <span
              className={`text-xs font-medium ${
                idx === 1 ? "text-blue-700" : idx === 0 ? "text-slate-600" : "text-slate-400"
              }`}
            >
              {label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-8 h-px mx-1 ${idx === 0 ? "bg-blue-700" : "bg-slate-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ documentId: string }>();
  const documentId = parseInt(params.documentId ?? "0", 10);

  // Document metadata from backend
  const { data: docData, isLoading: docLoading, error: docError } = trpc.documents.getDocument.useQuery(
    { documentId },
    { enabled: !!documentId && !isNaN(documentId) }
  );

  // File data for rendering
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [imgObjectUrl, setImgObjectUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileLoadError, setFileLoadError] = useState<string | null>(null);

  // Page state
  const [totalPages, setTotalPages] = useState(0);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [zoomPage, setZoomPage] = useState<number | null>(null);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");

  const processMutation = trpc.documents.process.useMutation();

  // ─── Load file from S3 URL ────────────────────────────────────────────────
  useEffect(() => {
    if (!docData?.document?.fileUrl) return;

    const doc = docData.document;
    const fileUrl = doc.fileUrl;
    const fileType = doc.fileType?.toLowerCase() ?? "";
    const isPdf = fileType === "pdf";

    setLoadingFile(true);
    setFileLoadError(null);

    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(async (buffer) => {
        if (isPdf) {
          setPdfData(buffer);
          // Count pages
          const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
          const pdf = await loadingTask.promise;
          const n = pdf.numPages;
          setTotalPages(n);
          setPages(
            Array.from({ length: n }, (_, i) => ({
              pageNumber: i + 1,
              type: "indefinido" as PageType,
              selected: true,
            }))
          );
        } else {
          // Image file
          const blob = new Blob([buffer], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          setImgObjectUrl(url);
          setTotalPages(1);
          setPages([{ pageNumber: 1, type: "indefinido", selected: true }]);
        }
      })
      .catch((err) => {
        console.error("[Review] file load error:", err);
        setFileLoadError("Não foi possível carregar o arquivo. Tente novamente.");
      })
      .finally(() => setLoadingFile(false));
  }, [docData]);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (imgObjectUrl) URL.revokeObjectURL(imgObjectUrl);
    };
  }, [imgObjectUrl]);

  // ─── Page controls ────────────────────────────────────────────────────────
  const toggleSelect = useCallback((pageNumber: number) => {
    setPages((prev) =>
      prev.map((p) => (p.pageNumber === pageNumber ? { ...p, selected: !p.selected } : p))
    );
  }, []);

  const setPageType = useCallback((pageNumber: number, type: PageType) => {
    setPages((prev) =>
      prev.map((p) => (p.pageNumber === pageNumber ? { ...p, type } : p))
    );
  }, []);

  const selectAll = () => setPages((prev) => prev.map((p) => ({ ...p, selected: true })));
  const selectNone = () => setPages((prev) => prev.map((p) => ({ ...p, selected: false })));
  const selectLaudos = () =>
    setPages((prev) => prev.map((p) => ({ ...p, selected: p.type === "laudo" })));

  // ─── Process ──────────────────────────────────────────────────────────────
  async function handleProcess() {
    const selected = pages.filter((p) => p.selected);
    if (selected.length === 0) {
      toast.error("Selecione pelo menos uma página para processar.");
      return;
    }
    setProcessing(true);
    setProcessingStep("Extraindo texto e estruturando dados…");

    try {
      const result = await processMutation.mutateAsync({
        documentId,
        selectedPageNumbers: selected.map((p) => p.pageNumber),
      });

      if (result.resultType === "lab") {
        navigate(`/analysis/${result.resultId}`);
      } else {
        navigate(`/imaging/${result.resultId}`);
      }
    } catch (err: any) {
      console.error("[Review] process error:", err);
      toast.error(err?.message || "Erro ao processar o documento.");
      setProcessing(false);
      setProcessingStep("");
    }
  }

  // ─── Zoom modal keyboard navigation ──────────────────────────────────────
  useEffect(() => {
    if (zoomPage === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setZoomPage((p) => (p && p > 1 ? p - 1 : p));
      if (e.key === "ArrowRight") setZoomPage((p) => (p && p < totalPages ? p + 1 : p));
      if (e.key === "Escape") setZoomPage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomPage, totalPages]);

  // ─── Render states ────────────────────────────────────────────────────────
  const selectedCount = pages.filter((p) => p.selected).length;
  const isPdf = docData?.document?.fileType?.toLowerCase() === "pdf";
  const fileName = docData?.document?.originalName ?? "Documento";

  if (!documentId || isNaN(documentId)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm">ID de documento inválido.</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  if (docLoading || loadingFile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm">
            {docLoading ? "Carregando informações do documento…" : "Carregando arquivo…"}
          </p>
        </div>
      </div>
    );
  }

  if (docError || fileLoadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500 max-w-sm text-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm font-medium text-slate-700">Erro ao carregar documento</p>
          <p className="text-xs text-slate-400">{fileLoadError ?? docError?.message}</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/")}
              className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-slate-800 truncate">
                Revisão do Documento
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {fileName} · {totalPages} página{totalPages !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <StepIndicator />

          <div className="flex items-center gap-2 flex-shrink-0 text-xs">
            <span className="text-slate-400 hidden sm:inline">Selecionar:</span>
            <button onClick={selectAll} className="text-blue-600 hover:text-blue-800 font-medium">
              Todas
            </button>
            <span className="text-slate-300">|</span>
            <button onClick={selectLaudos} className="text-blue-600 hover:text-blue-800 font-medium">
              Laudos
            </button>
            <span className="text-slate-300">|</span>
            <button onClick={selectNone} className="text-blue-600 hover:text-blue-800 font-medium">
              Nenhuma
            </button>
          </div>
        </div>
      </header>

      {/* Instruction banner */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700 flex gap-2 items-start">
          <span className="font-bold mt-0.5">i</span>
          <span>
            Clique em cada página para selecioná-la (borda azul = selecionada). Use o menu abaixo
            para classificar como <strong>Laboratório / Relatório</strong> ou{" "}
            <strong>Imagem diagnóstica</strong>. Clique na lupa para ampliar a página. Quando
            estiver pronto, clique em <strong>Processar selecionadas</strong>.
          </span>
        </div>
      </div>

      {/* Page grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {pages.length === 0 ? (
          <div className="text-center text-slate-400 py-16">Nenhuma página encontrada.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {pages.map((page) => (
              <PageCard
                key={page.pageNumber}
                page={page}
                pdfData={isPdf ? pdfData : null}
                imgUrl={!isPdf ? imgObjectUrl : null}
                onToggleSelect={() => toggleSelect(page.pageNumber)}
                onSetType={(t) => setPageType(page.pageNumber, t)}
                onZoom={() => setZoomPage(page.pageNumber)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-4 z-20 shadow-lg">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{selectedCount}</span> de {totalPages}{" "}
          página{totalPages !== 1 ? "s" : ""} selecionada{selectedCount !== 1 ? "s" : ""}
        </p>
        <Button
          onClick={handleProcess}
          disabled={processing || selectedCount === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white min-w-[200px]"
        >
          {processing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processando…
            </>
          ) : (
            `Processar ${selectedCount} página${selectedCount !== 1 ? "s" : ""}`
          )}
        </Button>
      </div>

      {/* Zoom Modal */}
      {zoomPage !== null && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={() => setZoomPage(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  Página {zoomPage} de {totalPages}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
                    TYPE_COLORS[pages[zoomPage - 1]?.type ?? "indefinido"]
                  }`}
                >
                  {TYPE_ICONS[pages[zoomPage - 1]?.type ?? "indefinido"]}
                  {TYPE_LABELS[pages[zoomPage - 1]?.type ?? "indefinido"]}
                </span>
              </div>
              <button
                onClick={() => setZoomPage(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Page preview */}
            <div className="flex-1 overflow-auto bg-slate-50 flex items-start justify-center p-4">
              {isPdf && pdfData ? (
                <PdfPageCanvas pdfData={pdfData} pageNumber={zoomPage} width={560} />
              ) : imgObjectUrl ? (
                <img
                  src={imgObjectUrl}
                  alt={`Página ${zoomPage}`}
                  className="max-w-full rounded-lg shadow"
                />
              ) : null}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Classificar:</span>
                {(["laudo", "imagem", "indefinido"] as PageType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPageType(zoomPage, t)}
                    className={`text-xs px-2 py-1 rounded border flex items-center gap-1 transition-colors ${
                      pages[zoomPage - 1]?.type === t
                        ? TYPE_COLORS[t] + " font-semibold"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {TYPE_ICONS[t]}
                    {t === "laudo" ? "Lab" : t === "imagem" ? "Imagem" : "Indefinido"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoomPage((p) => (p && p > 1 ? p - 1 : p))}
                  disabled={zoomPage <= 1}
                  className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                <span className="text-xs text-slate-500 min-w-[3rem] text-center">
                  {zoomPage} / {totalPages}
                </span>
                <button
                  onClick={() => setZoomPage((p) => (p && p < totalPages ? p + 1 : p))}
                  disabled={zoomPage >= totalPages}
                  className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {processing && (
        <div className="fixed inset-0 bg-white/85 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
          <p className="text-slate-700 font-semibold">Processando documento…</p>
          <p className="text-slate-500 text-sm">{processingStep}</p>
        </div>
      )}
    </div>
  );
}

// ─── PageCard ─────────────────────────────────────────────────────────────────

interface PageCardProps {
  page: PageInfo;
  pdfData: ArrayBuffer | null;
  imgUrl: string | null;
  onToggleSelect: () => void;
  onSetType: (t: PageType) => void;
  onZoom: () => void;
}

function PageCard({ page, pdfData, imgUrl, onToggleSelect, onSetType, onZoom }: PageCardProps) {
  return (
    <div
      className={`relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all group bg-white ${
        page.selected
          ? "border-blue-500 shadow-md shadow-blue-100"
          : "border-slate-200 hover:border-slate-300"
      }`}
      onClick={onToggleSelect}
    >
      {/* Page number */}
      <div className="absolute top-2 left-2 z-10 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-medium pointer-events-none">
        Pág. {page.pageNumber}
      </div>

      {/* Selection checkbox */}
      <div className="absolute top-2 right-2 z-10 pointer-events-none">
        {page.selected ? (
          <CheckSquare className="w-5 h-5 text-blue-500 drop-shadow" />
        ) : (
          <Square className="w-5 h-5 text-white/80 drop-shadow" />
        )}
      </div>

      {/* Zoom button */}
      <button
        className="absolute bottom-14 right-2 z-10 bg-white/90 hover:bg-white text-slate-600 rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onZoom();
        }}
        title="Ampliar"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      {/* Preview */}
      <div
        className="bg-slate-100 min-h-[180px] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {pdfData ? (
          <PdfPageCanvas pdfData={pdfData} pageNumber={page.pageNumber} width={180} />
        ) : imgUrl ? (
          <img
            src={imgUrl}
            alt={`Página ${page.pageNumber}`}
            className="w-full object-cover"
          />
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        )}
      </div>

      {/* Type selector */}
      <div className="p-2 bg-white" onClick={(e) => e.stopPropagation()}>
        <div
          className={`text-xs w-full flex items-center justify-center gap-1 mb-1.5 px-2 py-1 rounded-full border font-medium ${TYPE_COLORS[page.type]}`}
        >
          {TYPE_ICONS[page.type]}
          {page.type === "laudo" ? "Lab" : page.type === "imagem" ? "Imagem" : "Indefinido"}
        </div>
        <select
          value={page.type}
          onChange={(e) => onSetType(e.target.value as PageType)}
          className="w-full text-xs border border-slate-200 rounded px-1 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="laudo">Laboratório / Relatório</option>
          <option value="imagem">Imagem diagnóstica</option>
          <option value="indefinido">Indefinido</option>
        </select>
      </div>
    </div>
  );
}
