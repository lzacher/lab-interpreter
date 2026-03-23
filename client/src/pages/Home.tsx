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
} from "lucide-react";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/jpg"];
const ACCEPTED_EXT = [".pdf", ".jpg", ".jpeg"];

export default function Home() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: (data) => {
      navigate(`/review/${data.documentId}`);
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao enviar arquivo.");
      setUploading(false);
    },
  });

  const labUploadMutation = trpc.lab.upload.useMutation({
    onSuccess: (data) => {
      navigate(`/analysis/${data.sessionId}`);
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao processar JSON.");
      setUploading(false);
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
        setUploading(true);
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

      setUploading(true);
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
          className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 bg-white
            ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"}
            ${uploading ? "opacity-60 pointer-events-none" : ""}
          `}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && document.getElementById("file-input")?.click()}
        >
          <input
            id="file-input"
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.json"
            onChange={onInputChange}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
              {uploading ? (
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-blue-600" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-700 text-base">
                {uploading ? "Enviando arquivo..." : "Arraste o arquivo aqui"}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                ou clique para selecionar
              </p>
            </div>
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
