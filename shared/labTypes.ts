/** Estrutura de um exame individual vinda do JSON */
export interface RawExam {
  nome_exame: string;
  resultado: string;
  unidade: string;
  valor_referencia: string;
  status: string;
}

/** Estrutura do JSON de exames laboratoriais */
export interface LabJsonPayload {
  tipo_laudo?: string;
  campos: {
    paciente_nome?: string;
    paciente_data_nascimento?: string;
    paciente_sexo?: string;
    data_realizacao?: string;
    data_emissao?: string;
    medico_solicitante?: string;
    medico_responsavel?: string;
    crm_responsavel?: string;
    laboratorio_clinica?: string;
    numero_atendimento?: string;
    material?: string;
    metodo?: string;
    observacoes?: string;
    exames: RawExam[];
  };
}

/** Classificação de um resultado */
export type ExamClassification = "normal" | "elevado" | "baixo" | "alterado" | "indeterminado";

/** Exame processado com classificação e valores numéricos */
export interface ProcessedExam {
  id: number;
  sessionId: number;
  name: string;
  result: string;
  unit: string;
  referenceRange: string;
  status: string;
  classification: ExamClassification;
  numericResult: number | null;
  refMin: number | null;
  refMax: number | null;
  interpretation: string | null;
}

/** Sessão completa com exames processados */
export interface SessionDetail {
  id: number;
  patientName: string | null;
  patientDob: string | null;
  patientSex: string | null;
  collectionDate: string | null;
  emissionDate: string | null;
  requestingDoctor: string | null;
  responsibleDoctor: string | null;
  laboratory: string | null;
  attendanceNumber: string | null;
  material: string | null;
  method: string | null;
  observations: string | null;
  createdAt: Date;
  exams: ProcessedExam[];
}
