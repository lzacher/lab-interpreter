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
} from "lucide-react";

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
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [obsExpanded, setObsExpanded] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data: session, isLoading } = trpc.lab.getSession.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );

  const filtered = useMemo(() => {
    if (!session) return [];
    const all = session.exams as any[];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [session, search]);

  const exportPdf = useCallback(async () => {
    if (!session) return;
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
        ["Nº Atendimento", session.attendanceNumber],
      ].filter(([, v]) => v) as [string, string][];

      doc.setFontSize(8.5);
      const colW = (pageW - margin * 2) / 2;
      patientFields.forEach(([label, value], i) => {
        const col = i % 2 === 0 ? margin : margin + colW;
        if (i % 2 === 0 && i > 0) y += 6;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 80, 80);
        doc.text(`${label}:`, col, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        doc.text(value, col + 30, y);
      });
      if (patientFields.length % 2 !== 0) y += 6;
      y += 8;

      // ── Tabela de resultados ───────────────────────────────────────────────
      doc.setTextColor(30, 64, 103);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Resultados dos Exames", margin, y);
      y += 5;
      doc.setDrawColor(30, 64, 103);
      doc.line(margin, y, pageW - margin, y);
      y += 2;

      const allExams = session.exams as any[];
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Exame", "Resultado", "Unidade", "Valor de Referência"]],
        body: allExams.map((e) => [
          e.name ?? "",
          e.result ?? "",
          e.unit ?? "",
          e.referenceRange ?? "",
        ]),
        styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak", valign: "top" },
        headStyles: { fillColor: [30, 64, 103], textColor: 255, fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 20, halign: "right" },
          2: { cellWidth: 18 },
          3: { cellWidth: "auto" },
        },
        // Destaque de linhas alteradas no PDF
        didParseCell: (data: any) => {
          if (data.section === "body") {
            const exam = allExams[data.row.index];
            const sc = classifyStatus(exam?.status ?? "");
            if (sc === "elevado") {
              data.cell.styles.fillColor = [255, 251, 235]; // amber-50
              data.cell.styles.textColor = [120, 80, 0];
            } else if (sc === "baixo") {
              data.cell.styles.fillColor = [239, 246, 255]; // blue-50
              data.cell.styles.textColor = [30, 64, 175];
            } else if (sc === "alterado") {
              data.cell.styles.fillColor = [255, 241, 242]; // red-50
              data.cell.styles.textColor = [185, 28, 28];
            }
          }
        },
      });

      // ── Observações ────────────────────────────────────────────────────────
      if (session.observations) {
        const finalY = (doc as any).lastAutoTable?.finalY ?? y;
        const obsY = finalY + 8;
        if (obsY < doc.internal.pageSize.getHeight() - 20) {
          doc.setTextColor(30, 64, 103);
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text("Observações", margin, obsY);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(60, 60, 60);
          const lines = doc.splitTextToSize(session.observations, pageW - margin * 2);
          doc.text(lines, margin, obsY + 5);
        }
      }

      // ── Rodapé ─────────────────────────────────────────────────────────────
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Página ${i} de ${pageCount} — LabInterpreter — Uso exclusivo para revisão médica profissional`,
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
              onClick={exportPdf}
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

      <main className="flex-1 container py-6 space-y-6">
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

        {/* Summary */}
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
                      {/* Nome */}
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

                      {/* Resultado */}
                      <TableCell className="text-right py-3">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono font-semibold text-sm text-foreground">{exam.result ?? "—"}</span>
                          <StatusBadge status={exam.status ?? ""} />
                        </div>
                      </TableCell>

                      {/* Unidade */}
                      <TableCell className="text-xs text-muted-foreground py-3">
                        {exam.unit || "—"}
                      </TableCell>

                      {/* Valor de Referência */}
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
      </main>
    </div>
  );
}
