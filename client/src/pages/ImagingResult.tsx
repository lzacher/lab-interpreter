import { useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FlaskConical,
  ArrowLeft,
  Download,
  User,
  Calendar,
  Stethoscope,
  FileText,
  History,
  Plus,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ImagingResult() {
  const params = useParams<{ reportId: string }>();
  const reportId = parseInt(params.reportId ?? "0");
  const [, navigate] = useLocation();

  const { data: report, isLoading } = trpc.imaging.getReport.useQuery(
    { reportId },
    { enabled: !!reportId }
  );

  const exportPdf = useCallback(() => {
    if (!report) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;

    // ── Cabeçalho azul ──────────────────────────────────────────────────────
    doc.setFillColor(29, 78, 216);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("MedSuite — Laudo de Exame de Imagem", margin, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, 20);
    doc.setTextColor(0, 0, 0);

    let y = 36;

    // ── Dados do paciente ───────────────────────────────────────────────────
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Dados do Paciente", margin, y);
    y += 5;

    const infoRows = [
      ["Paciente", report.patientName ?? "—"],
      ["Data de Nascimento", report.patientDob ?? "—"],
      ["Tipo de Exame", report.examType ?? "—"],
      ["Data do Exame", report.examDate ?? "—"],
      ["Médico Solicitante", report.requestingDoctor ?? "—"],
      ["Médico Responsável", report.responsibleDoctor ?? "—"],
    ].filter(([, v]) => v !== "—");

    autoTable(doc, {
      startY: y,
      head: [],
      body: infoRows,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
      margin: { left: margin, right: margin },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // ── Técnica ─────────────────────────────────────────────────────────────
    if (report.technique) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Técnica", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const techLines = doc.splitTextToSize(report.technique, pageW - margin * 2);
      doc.text(techLines, margin, y);
      y += techLines.length * 5 + 6;
    }

    // ── Descrição ───────────────────────────────────────────────────────────
    if (report.description) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Descrição", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const descLines = doc.splitTextToSize(report.description, pageW - margin * 2);
      doc.text(descLines, margin, y);
      y += descLines.length * 5 + 6;
    }

    // ── Conclusão ───────────────────────────────────────────────────────────
    if (report.conclusion) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(margin - 2, y - 3, pageW - margin * 2 + 4, 8, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Conclusão", margin, y + 2);
      y += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const concLines = doc.splitTextToSize(report.conclusion, pageW - margin * 2);
      doc.text(concLines, margin, y);
      y += concLines.length * 5 + 6;
    }

    // ── Observações ─────────────────────────────────────────────────────────
    if (report.observations) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Observações", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const obsLines = doc.splitTextToSize(report.observations, pageW - margin * 2);
      doc.text(obsLines, margin, y);
    }

    // ── Rodapé ──────────────────────────────────────────────────────────────
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 290, { align: "right" });
      doc.text("MedSuite — Documento gerado automaticamente. Sujeito à revisão médica.", margin, 290);
    }

    const firstName = (report.patientName ?? "paciente").split(" ")[0].toLowerCase();
    doc.save(`${firstName}_imagem.pdf`);
    toast.success("PDF exportado com sucesso!");
  }, [report]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Laudo não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/history")} className="gap-1.5 text-slate-600">
            <ArrowLeft className="h-4 w-4" />
            Histórico
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-blue-700" />
            <span className="font-semibold text-slate-800">MedSuite</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/history")} className="gap-1.5 text-slate-600">
            <History className="h-4 w-4" />
            Histórico
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
          >
            <Plus className="h-4 w-4" />
            Novo Exame
          </Button>
          <Button onClick={exportPdf} className="bg-blue-700 hover:bg-blue-800 text-white gap-1.5">
            <Download className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
        {/* Patient Info */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Dados do Paciente
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: <User className="h-4 w-4 text-slate-400" />, label: "Paciente", value: report.patientName },
              { icon: <Calendar className="h-4 w-4 text-slate-400" />, label: "Data de Nascimento", value: report.patientDob },
              { icon: <FileText className="h-4 w-4 text-slate-400" />, label: "Tipo de Exame", value: report.examType },
              { icon: <Calendar className="h-4 w-4 text-slate-400" />, label: "Data do Exame", value: report.examDate },
              { icon: <Stethoscope className="h-4 w-4 text-slate-400" />, label: "Médico Solicitante", value: report.requestingDoctor },
              { icon: <Stethoscope className="h-4 w-4 text-slate-400" />, label: "Médico Responsável", value: report.responsibleDoctor },
            ]
              .filter((f) => f.value)
              .map((field) => (
                <div key={field.label} className="flex items-start gap-2">
                  <div className="mt-0.5">{field.icon}</div>
                  <div>
                    <p className="text-xs text-slate-400">{field.label}</p>
                    <p className="text-sm font-medium text-slate-700">{field.value}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Técnica */}
        {report.technique && (
          <Section title="Técnica" content={report.technique} />
        )}

        {/* Descrição */}
        {report.description && (
          <Section title="Descrição" content={report.description} />
        )}

        {/* Conclusão — destaque */}
        {report.conclusion && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-3">
              Conclusão
            </h3>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
              {report.conclusion}
            </p>
          </div>
        )}

        {/* Observações */}
        {report.observations && (
          <Section title="Observações" content={report.observations} />
        )}
      </main>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}
