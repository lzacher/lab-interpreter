import { useState, useMemo } from "react";
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
} from "lucide-react";

export default function Analysis() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = parseInt(params.sessionId ?? "0", 10);
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [obsExpanded, setObsExpanded] = useState(false);

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
          <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
            {session.patientName ?? "Paciente"}
          </span>
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
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">
            Resultados dos Exames
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({session.exams.length} exame{session.exams.length !== 1 ? "s" : ""})
            </span>
          </h3>
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
                <TableHead className="w-[25%] font-semibold text-foreground">Valor de Referência</TableHead>
                <TableHead className="w-[25%] font-semibold text-foreground">Interpretação Clínica</TableHead>
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
                  const hasLongInterp = (exam.interpretation ?? "").length > 80;
                  const needsExpand = hasLongRef || hasLongInterp;

                  return (
                    <TableRow
                      key={exam.id}
                      className={needsExpand ? "cursor-pointer hover:bg-muted/30 align-top" : "align-top"}
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
                      <TableCell className="text-right font-mono font-semibold text-sm text-foreground py-3">
                        {exam.result ?? "—"}
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

                      {/* Interpretação Clínica */}
                      <TableCell className="text-xs text-foreground py-3 leading-relaxed">
                        {exam.interpretation ? (
                          isExpanded || !hasLongInterp ? (
                            <span>{exam.interpretation}</span>
                          ) : (
                            <span className="line-clamp-3">{exam.interpretation}</span>
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
