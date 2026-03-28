import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
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
} from "lucide-react";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/jpg"];
const ACCEPTED_EXT = [".pdf", ".jpg", ".jpeg"];

/**
 * Verifica heuristicamente se uma imagem parece ser um laudo médico.
 * Analisa: proporção (laudos são geralmente retrato/A4), predominância de pixels brancos
 * (fundo branco de documento), e tamanho do arquivo (laudos tendem a ser maiores).
 * Retorna true se provavelmente é um laudo, false se parece screenshot/foto.
 */
async function checkIfMedicalImage(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      // Laudos médicos têm proporção retrato (altura > largura) ou próxima de A4 (1.41)
      const ratio = height / width;
      const isPortrait = ratio > 1.0;
      // Screenshots de celular têm proporção muito alta (ex: 19:9 = ~2.1)
      const isMobileScreenshot = ratio > 1.8;
      // Verificar predominância de branco (fundo de documento)
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
        // Pixel claro: todos os canais > 200 (branco/cinza claro)
        if (r > 200 && g > 200 && b > 200) lightPixels++;
      }
      const lightRatio = lightPixels / totalPixels;
      // Laudo: fundo predominantemente branco (>50%) E proporção retrato
      // Screenshot de celular: proporção muito alta E fundo escuro
      const looksLikeDocument = lightRatio > 0.45 && isPortrait;
      const looksLikeMobileScreenshot = isMobileScreenshot && lightRatio < 0.6;
      if (looksLikeMobileScreenshot) { resolve(false); return; }
      resolve(looksLikeDocument);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(true); };
    img.src = url;
  });
}

type UploadStep = "idle" | "uploading" | "analyzing" | "done";

const STEP_LABELS: Record<UploadStep, string> = {
  idle: "Arraste o arquivo aqui",
  uploading: "Enviando arquivo…",
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

  const analyzeMutation = trpc.documents.analyze.useMutation();

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: async (data) => {
      // Etapa 2: analyze — classifica páginas via LLM
      setStep("analyzing");
      try {
        await analyzeMutation.mutateAsync({ documentId: data.documentId });
      } catch {
        // analyze falhou — continua para /review com fallback interno
      }
      setStep("done");
      navigate(`/review/${data.documentId}`);
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao enviar arquivo.");
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

  const handleFile = useCallback(
    async (file: File) => {
      if (!isAuthenticated) {
        toast.error("Faça login para continuar.");
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

      // JSON direto → fluxo legado do LabInterpreter
      if (ext === "json") {
        setStep("uploading");
        const text = await file.text();
        labUploadMutation.mutate({ jsonContent: text });
        return;
      }

      // PDF / JPG / JPEG → fluxo MedSuite com OCR
      if (!ACCEPTED.includes(file.type) && !ACCEPTED_EXT.includes(`.${ext}`)) {
        toast.error("Formato não suportado. Use PDF, JPG, JPEG ou JSON.");
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        toast.error("Arquivo muito grande. Tamanho máximo: 20 MB.");
        return;
      }

      // Validação prévia para imagens JPG/JPEG: verificar se parece um laudo médico
      if ((file.type === "image/jpeg" || file.type === "image/jpg" || ext === "jpg" || ext === "jpeg") && file.size < 5 * 1024 * 1024) {
        const isLikelyMedical = await checkIfMedicalImage(file);
        if (!isLikelyMedical) {
          toast.warning(
            "Esta imagem pode não ser um laudo médico (screenshot, foto, etc.). O processamento continuará, mas talvez nenhum exame seja encontrado.",
            { duration: 6000 }
          );
        }
      }

      setStep("uploading");
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        uploadMutation.mutate({
          fileName: file.name,
          fileType: ext,
          fileBase64: base64,
        });
      };
      reader.readAsDataURL(file);
    },
    [isAuthenticated, uploadMutation, labUploadMutation]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const busy = step !== "idle";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-blue-700" />
          <span className="text-lg font-semibold text-slate-800 tracking-tight">MedSuite</span>
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
              onClick={() => (window.location.href = getLoginUrl())}
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

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-2xl w-full text-center space-y-4 mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1.5 rounded-full border border-blue-100">
            <Scan className="h-4 w-4" />
            Interpretação clínica assistida
          </div>
          <h1 className="text-4xl font-bold text-slate-900 leading-tight">
            Análise de Documentos
            <br />
            <span className="text-blue-700">Médicos</span>
          </h1>
          <p className="text-slate-500 text-lg max-w-lg mx-auto">
            Carregue laudos de laboratório ou exames de imagem em PDF, JPG ou JSON.
            O sistema classifica, extrai e organiza os dados automaticamente.
          </p>
        </div>

        {/* Upload Area */}
        <div
          className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 bg-white
            ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"}
            ${busy ? "opacity-80 pointer-events-none cursor-not-allowed" : "cursor-pointer"}
          `}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !busy && document.getElementById("file-input")?.click()}
        >
          <input
            id="file-input"
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.json"
            onChange={onInputChange}
          />
          <div className="flex flex-col items-center gap-4">
            {/* Ícone com estado */}
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
              step === "done" ? "bg-emerald-50" :
              busy ? "bg-blue-50" : "bg-blue-50"
            }`}>
              {step === "idle" && <Upload className="h-8 w-8 text-blue-600" />}
              {(step === "uploading" || step === "analyzing") && (
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              )}
              {step === "done" && <CheckCircle2 className="h-8 w-8 text-emerald-600" />}
            </div>

            {/* Texto principal */}
            <div>
              <p className={`font-semibold text-base transition-colors ${
                step === "done" ? "text-emerald-700" : "text-slate-700"
              }`}>
                {STEP_LABELS[step]}
              </p>
              <p className="text-sm text-slate-400 mt-1">{STEP_SUB[step]}</p>
            </div>

            {/* Indicador de etapas durante o processamento */}
            {busy && (
              <div className="flex items-center gap-2 mt-1">
                {/* Etapa 1: Upload */}
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

                {/* Separador */}
                <div className="w-6 h-px bg-slate-300" />

                {/* Etapa 2: Análise */}
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

                {/* Separador */}
                <div className="w-6 h-px bg-slate-300" />

                {/* Etapa 3: Revisão */}
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

            {/* Formatos aceitos (apenas quando idle) */}
            {!busy && (
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
                <p className="text-xs text-slate-400">Tamanho máximo: 20 MB</p>
              </>
            )}
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 w-full max-w-2xl">
          {[
            {
              icon: <FlaskConical className="h-5 w-5 text-blue-600" />,
              title: "Exames Laboratoriais",
              desc: "Tabela estruturada com valores e referências",
            },
            {
              icon: <Scan className="h-5 w-5 text-teal-600" />,
              title: "Exames de Imagem",
              desc: "Eco, ultrassom, tomografia e ressonância",
            },
            {
              icon: <FileText className="h-5 w-5 text-violet-600" />,
              title: "Exportar PDF",
              desc: "Relatório formatado pronto para revisão",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left"
            >
              <div className="mb-2">{card.icon}</div>
              <p className="font-semibold text-slate-700 text-sm">{card.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{card.desc}</p>
            </div>
          ))}
        </div>

        {isAuthenticated && (
          <Button
            variant="ghost"
            className="mt-8 text-slate-500 gap-1.5 text-sm"
            onClick={() => navigate("/history")}
          >
            Ver histórico de laudos
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </main>
    </div>
  );
}
