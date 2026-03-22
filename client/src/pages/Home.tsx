import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FlaskConical,
  Upload,
  History,
  ChevronRight,
  FileJson,
  BarChart3,
  Microscope,
  LogIn,
} from "lucide-react";

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.lab.upload.useMutation({
    onSuccess: (data) => {
      toast.success("Exames carregados com sucesso!");
      navigate(`/analysis/${data.sessionId}`);
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao processar o arquivo.");
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".json")) {
        toast.error("Por favor, selecione um arquivo .json");
        return;
      }
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        uploadMutation.mutate({ jsonContent: content });
      };
      reader.readAsText(file, "utf-8");
    },
    [uploadMutation]
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground tracking-tight">LabInterpreter</span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
                <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
                  <History className="h-4 w-4 mr-1.5" />
                  Histórico
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => (window.location.href = getLoginUrl())}>
                <LogIn className="h-4 w-4 mr-1.5" />
                Entrar
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-2xl w-full text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/8 text-primary text-xs font-medium px-3 py-1.5 rounded-full border border-primary/20 mb-2">
            <Microscope className="h-3.5 w-3.5" />
            Interpretação clínica assistida
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground leading-tight">
            Análise de Exames<br />
            <span className="text-primary">Laboratoriais</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-lg mx-auto">
            Carregue o arquivo JSON do laudo laboratorial para visualizar resultados,
            comparar com intervalos de referência e obter interpretações clínicas detalhadas.
          </p>
        </div>

        {/* Upload Area */}
        {isAuthenticated ? (
          <div className="w-full max-w-lg">
            <div
              className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
                ${dragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/50 hover:bg-accent/30"
                }
                ${uploadMutation.isPending ? "opacity-60 pointer-events-none" : ""}
              `}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <div className="flex flex-col items-center gap-3">
                {uploadMutation.isPending ? (
                  <>
                    <div className="h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <p className="text-sm font-medium text-foreground">Processando exames…</p>
                  </>
                ) : (
                  <>
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <FileJson className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {fileName ?? "Arraste o arquivo JSON aqui"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        ou clique para selecionar
                      </p>
                    </div>
                    <Button size="sm" className="mt-1" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      <Upload className="h-4 w-4 mr-1.5" />
                      Selecionar arquivo
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Quick access */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <History className="h-4 w-4" />
                Ver histórico de análises
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-lg">
            <div className="border-2 border-dashed border-border rounded-xl p-10 text-center bg-muted/30">
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                  <FileJson className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Faça login para continuar</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    É necessário estar autenticado para carregar e analisar exames.
                  </p>
                </div>
                <Button onClick={() => (window.location.href = getLoginUrl())}>
                  <LogIn className="h-4 w-4 mr-1.5" />
                  Entrar com Manus
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 max-w-2xl w-full">
          {[
            {
              icon: BarChart3,
              title: "Gráficos interativos",
              desc: "Visualize cada resultado em relação ao intervalo de referência com gráficos claros.",
            },
            {
              icon: Microscope,
              title: "Interpretação clínica",
              desc: "Textos de interpretação baseados em diretrizes para cada exame alterado.",
            },
            {
              icon: History,
              title: "Histórico completo",
              desc: "Todas as análises ficam salvas para consulta e comparação futura.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border border-border rounded-xl p-5 text-left">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <p className="font-semibold text-sm text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        LabInterpreter — Uso exclusivo para revisão médica profissional
      </footer>
    </div>
  );
}
