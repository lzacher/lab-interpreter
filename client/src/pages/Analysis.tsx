import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FlaskConical,
  ArrowLeft,
  Search,
  User,
  Calendar,
  Building2,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Loader2,
  FileText,
  Filter,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ProcessedExam } from "../../../shared/labTypes";

type FilterType = "all" | "altered" | "normal";

function classificationColor(c: string) {
  if (c === "normal") return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" };
  if (c === "elevado") return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" };
  if (c === "baixo") return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" };
  return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" };
}

function classificationLabel(c: string) {
  if (c === "normal") return "Normal";
  if (c === "elevado") return "Elevado ↑";
  if (c === "baixo") return "Baixo ↓";
  if (c === "alterado") return "Alterado";
  return "Indeterminado";
}

function ExamChart({ exam }: { exam: ProcessedExam }) {
  if (exam.numericResult === null) return null;
  if (exam.refMin === null && exam.refMax === null) return null;

  const val = exam.numericResult;
  const refMin = exam.refMin;
  const refMax = exam.refMax;

  // Build scale
  let domainMin: number, domainMax: number;
  if (refMin !== null && refMax !== null) {
    const span = refMax - refMin;
    domainMin = Math.max(0, refMin - span * 0.5);
    domainMax = refMax + span * 0.5;
  } else if (refMax !== null) {
    domainMin = 0;
    domainMax = Math.max(val, refMax) * 1.4;
  } else if (refMin !== null) {
    domainMin = Math.max(0, refMin * 0.5);
    domainMax = Math.max(val, refMin) * 1.6;
  } else {
    return null;
  }

  // Ensure result is visible
  if (val < domainMin) domainMin = val * 0.8;
  if (val > domainMax) domainMax = val * 1.2;

  const isAltered = exam.classification !== "normal";
  const barColor = exam.classification === "normal" ? "#16a34a"
    : exam.classification === "elevado" ? "#dc2626"
    : exam.classification === "baixo" ? "#2563eb"
    : "#d97706";

  const chartData = [{ name: exam.name, value: val }];

  return (
    <div className="mt-3 h-20">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
          <XAxis
            type="number"
            domain={[domainMin, domainMax]}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            formatter={(v: number) => [`${v} ${exam.unit}`, exam.name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          {/* Reference range shading via reference lines */}
          {refMin !== null && (
            <ReferenceLine x={refMin} stroke="#16a34a" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: `↓${refMin}`, position: "top", fontSize: 9, fill: "#16a34a" }} />
          )}
          {refMax !== null && (
            <ReferenceLine x={refMax} stroke="#16a34a" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: `↑${refMax}`, position: "top", fontSize: 9, fill: "#16a34a" }} />
          )}
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
            <Cell fill={barColor} fillOpacity={0.85} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExamCard({ exam }: { exam: ProcessedExam }) {
  const [expanded, setExpanded] = useState(false);
  const colors = classificationColor(exam.classification);
  const label = classificationLabel(exam.classification);
  const isAltered = exam.classification !== "normal" && exam.classification !== "indeterminado";

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${colors.border} ${isAltered ? "" : "border-border"}`}>
      <button
        className="w-full text-left p-4 flex items-start gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground">{exam.name}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
              {label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="font-mono font-medium text-foreground">
              {exam.result} {exam.unit}
            </span>
            {exam.referenceRange && exam.referenceRange !== "null" && (
              <span>Ref: {exam.referenceRange}</span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/60 pt-3 space-y-3">
          {/* Chart */}
          <ExamChart exam={exam} />

          {/* Interpretation */}
          {exam.interpretation && (
            <div className={`rounded-lg p-3 ${colors.bg} border ${colors.border}`}>
              <p className={`text-xs font-semibold mb-1 ${colors.text}`}>Interpretação Clínica</p>
              <p className="text-xs text-foreground leading-relaxed">{exam.interpretation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Analysis() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = parseInt(params.sessionId ?? "0", 10);
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [obsExpanded, setObsExpanded] = useState(false);

  const { data: session, isLoading } = trpc.lab.getSession.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );

  const { altered, normal, filtered } = useMemo(() => {
    if (!session) return { altered: [], normal: [], filtered: [] };
    const all = session.exams as ProcessedExam[];
    const alt = all.filter((e) => e.classification !== "normal" && e.classification !== "indeterminado");
    const norm = all.filter((e) => e.classification === "normal");

    let base = filter === "altered" ? alt : filter === "normal" ? norm : all;
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter((e) => e.name.toLowerCase().includes(q));
    }
    return { altered: alt, normal: norm, filtered: base };
  }, [session, filter, search]);

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
        <Button onClick={() => navigate("/dashboard")}>Voltar ao histórico</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground tracking-tight hidden sm:block">LabInterpreter</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
              {session.patientName ?? "Paciente"}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-6 space-y-6">
        {/* Patient Info Card */}
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
              { label: "Atendimento Nº", value: session.attendanceNumber },
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

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{session.exams.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total de exames</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{altered.length}</p>
            <p className="text-xs text-red-600 mt-1">Alterados</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{normal.length}</p>
            <p className="text-xs text-green-600 mt-1">Normais</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {session.exams.length > 0 ? Math.round((normal.length / session.exams.length) * 100) : 0}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">Dentro do normal</p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar exame por nome..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {(["all", "altered", "normal"] as FilterType[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className="flex-1 sm:flex-none"
              >
                {f === "all" ? "Todos" : f === "altered" ? "Alterados" : "Normais"}
              </Button>
            ))}
          </div>
        </div>

        {/* Exam List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum exame encontrado para os filtros aplicados.
            </div>
          ) : (
            <>
              {/* Altered first */}
              {filter !== "normal" && filtered.filter((e) => e.classification !== "normal" && e.classification !== "indeterminado").length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 py-1">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Exames Alterados
                    </span>
                  </div>
                  {filtered
                    .filter((e) => e.classification !== "normal" && e.classification !== "indeterminado")
                    .map((exam) => (
                      <ExamCard key={exam.id} exam={exam} />
                    ))}
                </div>
              )}

              {/* Normal */}
              {filter !== "altered" && filtered.filter((e) => e.classification === "normal").length > 0 && (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center gap-2 py-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Exames Normais
                    </span>
                  </div>
                  {filtered
                    .filter((e) => e.classification === "normal")
                    .map((exam) => (
                      <ExamCard key={exam.id} exam={exam} />
                    ))}
                </div>
              )}

              {/* Indeterminate */}
              {filtered.filter((e) => e.classification === "indeterminado").length > 0 && (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center gap-2 py-1">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Sem Classificação Numérica
                    </span>
                  </div>
                  {filtered
                    .filter((e) => e.classification === "indeterminado")
                    .map((exam) => (
                      <ExamCard key={exam.id} exam={exam} />
                    ))}
                </div>
              )}
            </>
          )}
        </div>

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
              {obsExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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
