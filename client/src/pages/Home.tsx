import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  History,
  FlaskConical,
  Scan,
  ChevronRight,
  LogIn,
  CheckCircle2,
  Loader2,
  X,
  FilePlus,
  FileImage,
  FileJson,
} from "lucide-react";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/jpg"];
const ACCEPTED_EXT = [".pdf", ".jpg", ".jpeg", ".json"];

async function checkIfMedicalImage(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const ratio = height / width;
      const isPortrait = ratio > 1.0;
      const isMobileScreenshot = ratio > 1.8;
      const canvas = document.createElement("canvas");
      const sampleSize = 100;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(true); return; }
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
      const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
      let lightPixels = 0;
      const totalPixels = sampleSize * sampleSize;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 200 && g > 200 && b > 200) lightPixels++;
      }
      const lightRatio = lightPixels / totalPixels;
      const looksLikeDocument = lightRatio > 0.45 && isPortrait;
      const looksLikeMobileScreenshot = isMobileScreenshot && lightRatio < 0.6;
      if (looksLikeMobileScreenshot) { resolve(false); return; }
      resolve(looksLikeDocument);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(true); };
    img.src = url;
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="h-4 w-4 text-red-500" />;
  if (ext === "json") return <FileJson className="h-4 w-4 text-yellow-500" />;
  return <FileImage className="h-4 w-4 text-blue-500" />;
}

type UploadStep = "idle" | "uploading" | "analyzing" | "done";

const STEP_LABELS: Record<UploadStep, string> = {
  idle: "Arraste os arquivos aqui",
  uploading: "Enviando arquivos…",
  analyzing: "Preparando documento…",
  done: "Pronto! Redirecionando…",
};

const STEP_SUB: Record<UploadStep, string> = {
  idle: "ou clique para selecionar",
  uploading: "Fazendo upload para o servidor",
  analyzing: "Classificando páginas com IA",
  done: "Abrindo tela de revisão",
};

export default function Home() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<UploadStep>("idle");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const analyzeMultipleMutation = trpc.documents.analyzeMultiple.useMutation();
  const uploadMultipleMutation = trpc.documents.uploadMultiple.useMutation({
    onSuccess: async (data) => {
      setStep("analyzing");
      try {
        await analyzeMultipleMutation.mutateAsync({
          documentId: data.documentId,
          uploadedFiles: data.uploadedFiles,
        });
      } catch {
        // analyze falhou — continua para /review com fallback interno
      }
      setStep("done");
      navigate(`/review/${data.documentId}`);
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao enviar arquivos.");
      setStep("idle");
    },
  });

  const labUploadMutation = trpc.lab.upload.useMutation({
    onSuccess: (data) => {
      navigate(`/analysis/${data.sessionId}`);
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao processar JSON.");
      setStep("idle");
    },
  });

  const validateAndAddFiles = useCallback(
    async (files: File[]) => {
      if (!isAuthenticated) {
        toast.error("Faça login para continuar.");
        return;
      }

      // JSON: processar imediatamente (não suporta múltiplos)
      const jsonFile = files.find((f) => f.name.split(".").pop()?.toLowerCase() === "json");
      if (jsonFile) {
        if (files.length > 1) {
          toast.warning("Arquivos JSON são processados individualmente. Apenas o JSON será enviado.");
        }
        setStep("uploading");
        const text = await jsonFile.text();
        labUploadMutation.mutate({ jsonContent: text });
        return;
      }

      const valid: File[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ACCEPTED.includes(file.type) && !ACCEPTED_EXT.includes(`.${ext}`)) {
          toast.error(`Formato não suportado: ${file.name}. Use PDF, JPG ou JPEG.`);
          continue;
        }
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`Arquivo muito grande: ${file.name}. Máximo 20 MB.`);
          continue;
        }
        if ((ext === "jpg" || ext === "jpeg") && file.size < 5 * 1024 * 1024) {
          const isLikelyMedical = await checkIfMedicalImage(file);
          if (!isLikelyMedical) {
            toast.warning(
              `"${file.name}" pode não ser um laudo médico (screenshot, foto, etc.). O processamento continuará, mas talvez nenhum exame seja encontrado.`,
              { duration: 6000 }
            );
          }
        }
        valid.push(file);
      }

      if (valid.length === 0) return;

      // Verificar limite de 10 arquivos
      const total = selectedFiles.length + valid.length;
      if (total > 10) {
        toast.error("Máximo de 10 arquivos por sessão.");
        const allowed = valid.slice(0, 10 - selectedFiles.length);
        setSelectedFiles((prev) => [...prev, ...allowed]);
        return;
      }

      setSelectedFiles((prev) => [...prev, ...valid]);
    },
    [isAuthenticated, labUploadMutation, selectedFiles]
  );

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProcess = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    if (!isAuthenticated) {
      toast.error("Faça login para continuar.");
      return;
    }

    setStep("uploading");

    try {
      const filesData = await Promise.all(
        selectedFiles.map(async (file) => {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
            reader.readAsDataURL(file);
          });
          return { fileName: file.name, fileType: ext, fileBase64: base64 };
        })
      );

      uploadMultipleMutation.mutate({ files: filesData });
    } catch {
      toast.error("Erro ao preparar arquivos.");
      setStep("idle");
    }
  }, [selectedFiles, isAuthenticated, uploadMultipleMutation]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (step !== "idle") return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) validateAndAddFiles(files);
    },
    [step, validateAndAddFiles]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) validateAndAddFiles(files);
    // Reset input so same file can be re-added
    e.target.value = "";
  };

  const busy = step !== "idle";

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-blue-700" />
          <span className="text-base font-semibold text-slate-800 tracking-tight">MedSuite</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-600 gap-1.5"
              onClick={() => navigate("/history")}
            >
              <History className="h-4 w-4" />
              Histórico
            </Button>
          )}
          {!loading && !isAuthenticated && (
            <Button
              size="sm"
              className="bg-blue-700 hover:bg-blue-800 text-white gap-1.5"
              onClick={() => (window.location.href = "/login")}
            >
              <LogIn className="h-4 w-4" />
              Entrar
            </Button>
          )}
          {isAuthenticated && (
            <span className="text-sm text-slate-500">{user?.name}</span>
          )}
        </div>
      </header>

      {/* Main — layout split: esquerda info, direita upload */}
      <main className="flex-1 flex items-center justify-center px-6 py-4 overflow-hidden">
        <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center gap-8 lg:gap-12">

          {/* Coluna esquerda: título + cards de recursos */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-100 self-start">
              <Scan className="h-3.5 w-3.5" />
              Interpretação clínica assistida
            </div>

            {/* Título */}
            <div>
              <h1 className="text-3xl font-bold text-slate-900 leading-tight">
                Análise de Documentos
              </h1>
              <h1 className="text-3xl font-bold text-blue-700 leading-tight">
                Médicos
              </h1>
              <p className="text-slate-500 text-sm mt-3 max-w-sm leading-relaxed">
                Carregue um ou mais laudos do mesmo paciente em PDF ou JPG.
                Selecione o tipo de cada página e processe para extrair e organizar os dados.
              </p>
            </div>

            {/* Cards de recursos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-3">
              {[
                {
                  icon: <FlaskConical className="h-4 w-4 text-blue-600" />,
                  title: "Exames Laboratoriais",
                  desc: "Tabela estruturada com valores e referências",
                  color: "bg-blue-50",
                },
                {
                  icon: <Scan className="h-4 w-4 text-teal-600" />,
                  title: "Exames de Imagem",
                  desc: "Eco, ultrassom, tomografia e ressonância",
                  color: "bg-teal-50",
                },
                {
                  icon: <FileText className="h-4 w-4 text-violet-600" />,
                  title: "Exportar PDF",
                  desc: "Relatório formatado pronto para revisão",
                  color: "bg-violet-50",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="bg-white border border-slate-200 rounded-xl p-3 text-left"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${card.color}`}>
                    {card.icon}
                  </div>
                  <p className="font-semibold text-slate-700 text-xs">{card.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>

            {/* Link histórico */}
            {isAuthenticated && (
              <Button
                variant="ghost"
                className="text-slate-400 gap-1 text-xs self-start px-0 hover:text-slate-600"
                onClick={() => navigate("/history")}
              >
                Ver histórico de laudos
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Coluna direita: área de upload */}
          <div className="w-full lg:w-[420px] lg:flex-shrink-0 flex flex-col gap-3">

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200 bg-white
                ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"}
                ${busy ? "opacity-80 pointer-events-none cursor-not-allowed" : "cursor-pointer"}
              `}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !busy && document.getElementById("file-input")?.click()}
            >
              <input
                id="file-input"
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.json"
                multiple
                onChange={onInputChange}
              />
              <div className="flex flex-col items-center gap-3">
                {/* Ícone com estado */}
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                  step === "done" ? "bg-emerald-50" : "bg-blue-50"
                }`}>
                  {step === "idle" && <Upload className="h-6 w-6 text-blue-600" />}
                  {(step === "uploading" || step === "analyzing") && (
                    <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                  )}
                  {step === "done" && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
                </div>

                {/* Texto principal */}
                <div>
                  <p className={`font-semibold text-sm transition-colors ${
                    step === "done" ? "text-emerald-700" : "text-slate-700"
                  }`}>
                    {STEP_LABELS[step]}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{STEP_SUB[step]}</p>
                </div>

                {/* Indicador de etapas durante o processamento */}
                {busy && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all ${
                      step === "uploading"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {step === "uploading" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Upload
                    </div>
                    <div className="w-5 h-px bg-slate-300" />
                    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all ${
                      step === "analyzing"
                        ? "bg-blue-100 text-blue-700"
                        : step === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-400"
                    }`}>
                      {step === "analyzing" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : step === "done" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <div className="h-3 w-3 rounded-full border border-slate-300" />
                      )}
                      Classificação IA
                    </div>
                    <div className="w-5 h-px bg-slate-300" />
                    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all ${
                      step === "done"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-400"
                    }`}>
                      {step === "done" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <div className="h-3 w-3 rounded-full border border-slate-300" />
                      )}
                      Revisão
                    </div>
                  </div>
                )}

                {/* Formatos aceitos (apenas quando idle e sem arquivos) */}
                {!busy && selectedFiles.length === 0 && (
                  <>
                    <div className="flex gap-2 flex-wrap justify-center">
                      {["PDF", "JPG", "JPEG", "JSON"].map((fmt) => (
                        <span
                          key={fmt}
                          className="text-xs font-medium bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full"
                        >
                          {fmt}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400">Até 10 arquivos · 20 MB cada</p>
                  </>
                )}

                {/* Indicação de adicionar mais quando já há arquivos */}
                {!busy && selectedFiles.length > 0 && (
                  <p className="text-xs text-blue-500 font-medium">
                    + Clique ou arraste para adicionar mais arquivos
                  </p>
                )}
              </div>
            </div>

            {/* Lista de arquivos selecionados */}
            {selectedFiles.length > 0 && !busy && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    {selectedFiles.length} arquivo{selectedFiles.length > 1 ? "s" : ""} selecionado{selectedFiles.length > 1 ? "s" : ""}
                  </span>
                  <button
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                    onClick={() => setSelectedFiles([])}
                  >
                    Remover todos
                  </button>
                </div>
                <ul className="divide-y divide-slate-100 max-h-36 overflow-y-auto">
                  {selectedFiles.map((file, i) => (
                    <li key={i} className="flex items-center gap-2 px-3 py-2">
                      {fileIcon(file.name)}
                      <span className="flex-1 text-xs text-slate-700 truncate">{file.name}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{formatBytes(file.size)}</span>
                      <button
                        className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Botão Processar */}
            {selectedFiles.length > 0 && !busy && (
              <Button
                className="w-full bg-blue-700 hover:bg-blue-800 text-white gap-2"
                onClick={handleProcess}
              >
                <FilePlus className="h-4 w-4" />
                Processar {selectedFiles.length} arquivo{selectedFiles.length > 1 ? "s" : ""}
              </Button>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
