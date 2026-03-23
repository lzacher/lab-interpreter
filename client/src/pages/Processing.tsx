import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { FlaskConical, Loader2 } from "lucide-react";

export default function Processing() {
  const params = useParams<{ documentId: string }>();
  const documentId = parseInt(params.documentId ?? "0");
  const [, navigate] = useLocation();

  const { data } = trpc.documents.getDocument.useQuery(
    { documentId },
    { enabled: !!documentId, refetchInterval: 2000 }
  );

  useEffect(() => {
    if (data?.document?.status === "done") {
      // Redirecionar para o resultado correto via histórico
      navigate("/history");
    }
    if (data?.document?.status === "error") {
      navigate(`/review/${documentId}`);
    }
  }, [data?.document?.status]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-2 mb-4">
        <FlaskConical className="h-6 w-6 text-blue-700" />
        <span className="text-lg font-semibold text-slate-800">MedSuite</span>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-10 max-w-sm w-full text-center space-y-4">
        <div className="flex justify-center">
          <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Processando documento</h2>
        <p className="text-slate-500 text-sm">
          Realizando OCR e extraindo dados estruturados. Isso pode levar alguns instantes.
        </p>
        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div className="bg-blue-600 h-1.5 rounded-full animate-pulse w-3/4" />
        </div>
      </div>
    </div>
  );
}
