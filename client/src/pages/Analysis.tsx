import { useState, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FlaskConical,
  ArrowLeft,
  Search,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  Download,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Plus,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Classifica o status do exame para destaque visual
function classifyStatus(status: string): "alterado" | "elevado" | "baixo" | "normal" {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "elevado" || s === "alto" || s === "aumentado" || s === "acima") return "elevado";
  if (s === "baixo" || s === "reduzido" || s === "diminuido" || s === "abaixo") return "baixo";
  if (s === "alterado" || s === "anormal" || s === "critico" || s === "crítico") return "alterado";
  return "normal";
}

function StatusBadge({ status }: { status: string }) {
  const cls = classifyStatus(status);
  if (cls === "normal") return null;
  const config = {
    elevado: { label: "Elevado", icon: TrendingUp, className: "bg-amber-50 text-amber-700 border border-amber-200" },
    baixo:   { label: "Baixo",   icon: TrendingDown, className: "bg-blue-50 text-blue-700 border border-blue-200" },
    alterado:{ label: "Alterado",icon: AlertTriangle, className: "bg-red-50 text-red-700 border border-red-200" },
  }[cls];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${config.className}`}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}

export default function Analysis() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = parseInt(params.sessionId ?? "0", 10);
  const [location, navigate] = useLocation();

  // Ler imagingId da query string (?imagingId=X)
  const imagingId = useMemo(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const p = new URLSearchParams(qs);
    const v = parseInt(p.get("imagingId") ?? "0", 10);
    return v > 0 ? v : null;
  }, [location]);

  const [activeTab, setActiveTab] = useState<"lab" | "imaging">("lab");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [obsExpanded, setObsExpanded] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [pdfSections, setPdfSections] = useState({
    patientInfo: true,
    results: true,
  });

  const { data: session, isLoading } = trpc.lab.getSession.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );

  // Buscar dados do exame de imagem (quando imagingId estiver presente)
  const { data: imagingReport, isLoading: imagingLoading } = trpc.imaging.getReport.useQuery(
    { reportId: imagingId ?? 0 },
    { enabled: !!imagingId }
  );

  const filtered = useMemo(() => {
    if (!session) return [];
    const all = session.exams as any[];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [session, search]);

  const exportPdf = useCallback(async (sections: typeof pdfSections = pdfSections) => {
    if (!session) return;
    setShowExportModal(false);
    setExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;

      // ── Cabeçalho ──────────────────────────────────────────────────────────
      doc.setFillColor(30, 64, 103);
      doc.rect(0, 0, pageW, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Laudo de Exames Laboratoriais", margin, 14);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Gerado em ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
        pageW - margin,
        14,
        { align: "right" }
      );

      let y = 30;

      // ── Dados do paciente ──────────────────────────────────────────────────
      if (sections.patientInfo) {
        doc.setTextColor(30, 64, 103);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Dados do Paciente", margin, y);
        y += 5;
        doc.setDrawColor(30, 64, 103);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageW - margin, y);
        y += 4;

        const patientFields = [
          ["Nome", session.patientName],
          ["Data de Nascimento", session.patientDob],
          ["Sexo", session.patientSex],
          ["Data da Coleta", session.collectionDate],
          ["Data de Emissão", session.emissionDate],
          ["Laboratório", session.laboratory],
          ["Médico Solicitante", session.requestingDoctor],
          ["Médico Responsável", session.responsibleDoctor],
          ["Atendimento Nº", session.attendanceNumber],
          ["Material", session.material],
        ].filter(([, v]) => v) as [string, string][];

        autoTable(doc, {
          startY: y,
          head: [],
          body: patientFields,
          theme: "plain",
          styles: { fontSize: 8, cellPadding: 1.5, textColor: [40, 40, 40] },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
          margin: { left: margin, right: margin },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      // ── Resultados ─────────────────────────────────────────────────────────
      if (sections.results) {
        doc.setTextColor(30, 64, 103);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Resultados dos Exames", margin, y);
        y += 5;
        doc.setDrawColor(30, 64, 103);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageW - margin, y);
        y += 2;

        autoTable(doc, {
          startY: y,
          head: [["Exame", "Resultado", "Unidade", "Valor de Referência", "Status"]],
          body: (session.exams as any[]).map((e) => [
            e.name ?? "",
            e.result ?? "",
            e.unit ?? "",
            e.referenceRange ?? "",
            e.status ?? "",
          ]),
          theme: "striped",
          headStyles: { fillColor: [30, 64, 103], fontSize: 8, fontStyle: "bold" },
          styles: { fontSize: 7.5, cellPadding: 2 },
          columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 22 }, 2: { cellWidth: 18 }, 3: { cellWidth: 60 }, 4: { cellWidth: 22 } },
          margin: { left: margin, right: margin },
          didParseCell: (data) => {
            if (data.column.index === 4 && data.section === "body") {
              const status = (data.cell.raw as string ?? "").toLowerCase();
              if (status === "elevado" || status === "alto") data.cell.styles.textColor = [180, 90, 0];
              else if (status === "baixo" || status === "reduzido") data.cell.styles.textColor = [30, 80, 180];
              else if (status === "alterado" || status === "anormal") data.cell.styles.textColor = [180, 30, 30];
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      // ── Rodapé ─────────────────────────────────────────────────────────────────────────────────────────
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Página ${i} de ${pageCount} — MedSuite — Uso exclusivo para revisão médica profissional`,
          pageW / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: "center" }
        );
      }

      const patientSlug = (session.patientName ?? "laudo").replace(/\s+/g, "_").toLowerCase();
      const dateSlug = (session.collectionDate ?? new Date().toLocaleDateString("pt-BR")).replace(/\//g, "-");
      doc.save(`${patientSlug}_${dateSlug}.pdf`);
    } finally {
      setExportingPdf(false);
    }
  }, [session]);

  // ── Exportação de PDF para exame de imagem ────────────────────────────────
  const exportPdfImaging = useCallback(async () => {
    if (!imagingReport) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 14;

      // ── Cabeçalho azul ──────────────────────────────────────────────────────
      doc.setFillColor(29, 78, 216);
      doc.rect(0, 0, pageW, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("MedSuite — Laudo de Exame de Imagem", margin, 12);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        margin,
        20
      );
      doc.setTextColor(0, 0, 0);

      let y = 36;

      // ── Dados do paciente ───────────────────────────────────────────────────
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(29, 78, 216);
      doc.text("Dados do Paciente", margin, y);
      y += 5;
      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 3;
      doc.setTextColor(0, 0, 0);

      const infoRows = [
        ["Paciente", imagingReport.patientName ?? "—"],
        ["Data de Nascimento", imagingReport.patientDob ?? "—"],
        ["Tipo de Exame", imagingReport.examType ?? "—"],
        ["Data do Exame", imagingReport.examDate ?? "—"],
        ["Médico Solicitante", imagingReport.requestingDoctor ?? "—"],
        ["Médico Responsável", imagingReport.responsibleDoctor ?? "—"],
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
      if (imagingReport.technique) {
        if (y > pageH - 30) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(29, 78, 216);
        doc.text("Técnica", margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 40);
        const techLines = doc.splitTextToSize(imagingReport.technique, pageW - margin * 2);
        doc.text(techLines, margin, y);
        y += techLines.length * 5 + 6;
      }

      // ── Descrição ───────────────────────────────────────────────────────────
      if (imagingReport.description) {
        if (y > pageH - 30) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(29, 78, 216);
        doc.text("Descrição", margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 40);
        const descLines = doc.splitTextToSize(imagingReport.description, pageW - margin * 2);
        // Quebra de página linha a linha para descrições longas
        for (const line of descLines) {
          if (y > pageH - 14) { doc.addPage(); y = 20; }
          doc.text(line, margin, y);
          y += 5;
        }
        y += 4;
      }

      // ── Conclusão (destaque azul) ────────────────────────────────────────────
      if (imagingReport.conclusion) {
        if (y > pageH - 30) { doc.addPage(); y = 20; }
        const concLines = doc.splitTextToSize(imagingReport.conclusion, pageW - margin * 2 - 8);
        const blockH = concLines.length * 5 + 16;
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(29, 78, 216);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin - 2, y - 4, pageW - margin * 2 + 4, blockH, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(29, 78, 216);
        doc.text("Conclusão", margin + 2, y + 3);
        y += 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(30, 50, 90);
        for (const line of concLines) {
          if (y > pageH - 14) { doc.addPage(); y = 20; }
          doc.text(line, margin + 2, y);
          y += 5;
        }
        y += 8;
      }

      // ── Observações ─────────────────────────────────────────────────────────
      if (imagingReport.observations) {
        if (y > pageH - 30) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(29, 78, 216);
        doc.text("Observações", margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 40);
        const obsLines = doc.splitTextToSize(imagingReport.observations, pageW - margin * 2);
        for (const line of obsLines) {
          if (y > pageH - 14) { doc.addPage(); y = 20; }
          doc.text(line, margin, y);
          y += 5;
        }
      }

      // ── Rodapé ──────────────────────────────────────────────────────────────
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Página ${i} de ${pageCount} — MedSuite — Documento gerado automaticamente. Sujeito à revisão médica.`,
          pageW / 2,
          pageH - 6,
          { align: "center" }
        );
      }

      const firstName = (imagingReport.patientName ?? "paciente").split(" ")[0].toLowerCase();
      const examSlug = (imagingReport.examType ?? "imagem").replace(/\s+/g, "_").toLowerCase();
      doc.save(`${firstName}_${examSlug}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } finally {
      setExportingPdf(false);
    }
  }, [imagingReport]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Análise não encontrada.</p>
        <Button onClick={() => navigate("/history")}>Voltar ao histórico</Button>
      </div>
    );
  }

  // ── Conteúdo de exames laboratoriais (reutilizado em ambos os modos) ──────
  const labContent = (
    <div className="space-y-6">
      {/* Patient Info */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm text-foreground">Informações do Paciente</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          {[
            { label: "Nome", value: session.patientName },
            { label: "Data de Nascimento", value: session.patientDob },
            { label: "Sexo", value: session.patientSex },
            { label: "Data da Coleta", value: session.collectionDate },
            { label: "Data de Emissão", value: session.emissionDate },
            { label: "Laboratório", value: session.laboratory },
            { label: "Médico Solicitante", value: session.requestingDoctor },
            { label: "Médico Responsável", value: session.responsibleDoctor },
            { label: "Atendimento Nº", value: session.attendanceNumber },
            { label: "Material", value: session.material },
          ]
            .filter((f) => f.value)
            .map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
              </div>
            ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold text-foreground">
            Resultados dos Exames
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({session.exams.length} exame{session.exams.length !== 1 ? "s" : ""})
            </span>
          </h3>
          {/* Legenda */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium"><TrendingUp className="h-2.5 w-2.5" /> Elevado</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium"><TrendingDown className="h-2.5 w-2.5" /> Baixo</span>
            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full font-medium"><AlertTriangle className="h-2.5 w-2.5" /> Alterado</span>
          </div>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar exame..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Exams Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[30%] font-semibold text-foreground">Exame</TableHead>
              <TableHead className="w-[12%] font-semibold text-foreground text-right">Resultado</TableHead>
              <TableHead className="w-[8%] font-semibold text-foreground">Unidade</TableHead>
              <TableHead className="w-[35%] font-semibold text-foreground">Valor de Referência</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                  Nenhum exame encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((exam: any) => {
                const isExpanded = expandedId === exam.id;
                const hasLongRef = (exam.referenceRange ?? "").length > 60;
                const needsExpand = hasLongRef;
                const statusCls = classifyStatus(exam.status ?? "");
                const rowBg =
                  statusCls === "elevado" ? "bg-amber-50/60 hover:bg-amber-50" :
                  statusCls === "baixo"   ? "bg-blue-50/60 hover:bg-blue-50" :
                  statusCls === "alterado"? "bg-red-50/60 hover:bg-red-50" :
                  needsExpand ? "cursor-pointer hover:bg-muted/30" : "";

                return (
                  <TableRow
                    key={exam.id}
                    className={`align-top transition-colors ${rowBg} ${needsExpand ? "cursor-pointer" : ""}`}
                    onClick={needsExpand ? () => setExpandedId(isExpanded ? null : exam.id) : undefined}
                  >
                    <TableCell className="font-medium text-sm text-foreground py-3">
                      <div className="flex items-start gap-2">
                        {needsExpand && (
                          <span className="mt-0.5 text-muted-foreground flex-shrink-0">
                            {isExpanded
                              ? <ChevronUp className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />}
                          </span>
                        )}
                        <span>{exam.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-3">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono font-semibold text-sm text-foreground">{exam.result ?? "—"}</span>
                        <StatusBadge status={exam.status ?? ""} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground py-3">
                      {exam.unit || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground py-3 leading-relaxed">
                      {exam.referenceRange && exam.referenceRange !== "null" ? (
                        isExpanded || !hasLongRef ? (
                          <span className="whitespace-pre-wrap">{exam.referenceRange}</span>
                        ) : (
                          <span className="line-clamp-2">{exam.referenceRange}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Método */}
      {session.method && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Método</p>
          <p className="text-xs text-foreground leading-relaxed">{session.method}</p>
        </div>
      )}

      {/* Observations */}
      {session.observations && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 text-left"
            onClick={() => setObsExpanded(!obsExpanded)}
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Observações do Laudo</span>
            </div>
            {obsExpanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {obsExpanded && (
            <div className="px-4 pb-4 border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {session.observations}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Conteúdo de exame de imagem ───────────────────────────────────────────
  const imagingContent = (
    <div className="space-y-6">
      {imagingLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !imagingReport ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Laudo de imagem não encontrado.</p>
        </div>
      ) : (
        <>
          {/* Dados do paciente (imagem) */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm text-foreground">Dados do Paciente</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
              {[
                { label: "Paciente", value: imagingReport.patientName },
                { label: "Data de Nascimento", value: imagingReport.patientDob },
                { label: "Tipo de Exame", value: imagingReport.examType },
                { label: "Data do Exame", value: imagingReport.examDate },
                { label: "Médico Solicitante", value: imagingReport.requestingDoctor },
                { label: "Médico Responsável", value: imagingReport.responsibleDoctor },
              ]
                .filter((f) => f.value)
                .map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* Técnica */}
          {imagingReport.technique && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Técnica</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{imagingReport.technique}</p>
            </div>
          )}

          {/* Descrição */}
          {imagingReport.description && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Descrição</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{imagingReport.description}</p>
            </div>
          )}

          {/* Conclusão */}
          {imagingReport.conclusion && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Conclusão</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{imagingReport.conclusion}</p>
            </div>
          )}

          {/* Observações */}
          {imagingReport.observations && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Observações</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{imagingReport.observations}</p>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/history")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground tracking-tight hidden sm:block">MedSuite</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate max-w-[160px] hidden sm:block">
              {session.patientName ?? "Paciente"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Exame</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (activeTab === "imaging" && imagingId) {
                  exportPdfImaging();
                } else {
                  setShowExportModal(true);
                }
              }}
              disabled={exportingPdf}
              className="flex items-center gap-1.5"
            >
              {exportingPdf
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">{exportingPdf ? "Gerando…" : "Exportar PDF"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-6">
        {/* Modo dual-tab: Lab + Imagem */}
        {imagingId ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "lab" | "imaging")}>
            <TabsList className="mb-6">
              <TabsTrigger value="lab" className="flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" />
                Exames Laboratoriais
              </TabsTrigger>
              <TabsTrigger value="imaging" className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" />
                Exame de Imagem
              </TabsTrigger>
            </TabsList>
            <TabsContent value="lab">{labContent}</TabsContent>
            <TabsContent value="imaging">{imagingContent}</TabsContent>
          </Tabs>
        ) : (
          /* Modo simples: apenas Lab */
          labContent
        )}
      </main>

      {/* Modal de seleção de seções para exportar PDF */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Exportar PDF
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-1">
            <p className="text-sm text-muted-foreground mb-4">
              Selecione as seções que deseja incluir no laudo:
            </p>

            {[
              { key: "patientInfo" as const, label: "Dados do Paciente", desc: "Nome, data de nascimento, laboratório, etc." },
              { key: "results" as const, label: "Resultados dos Exames", desc: "Tabela completa com valores e referências" },
            ].map(({ key, label, desc }) => (
              <label
                key={key}
                htmlFor={`section-${key}`}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  pdfSections[key]
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  id={`section-${key}`}
                  checked={pdfSections[key]}
                  onCheckedChange={(checked) => {
                    setPdfSections((prev) => ({ ...prev, [key]: !!checked }));
                  }}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={`section-${key}`}
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowExportModal(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => exportPdf(pdfSections)}
              disabled={!pdfSections.patientInfo && !pdfSections.results}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
