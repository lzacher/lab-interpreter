import type { RawExam, ExamClassification, ProcessedExam, LabJsonPayload } from "../shared/labTypes";

/** Base de conhecimento de interpretações clínicas */
const CLINICAL_KNOWLEDGE: Record<string, Partial<Record<ExamClassification, string>>> = {
  "Uréia": {
    elevado: "Ureia elevada pode indicar insuficiência renal, desidratação ou catabolismo proteico aumentado. Recomenda-se avaliação conjunta com creatinina e eGFR.",
    baixo: "Ureia reduzida pode estar associada a desnutrição, doença hepática avançada ou hiperidratação.",
    normal: "Ureia dentro dos limites normais. Função renal preservada sob este parâmetro.",
  },
  "Creatinina": {
    elevado: "Creatinina elevada sugere redução da filtração glomerular. Avaliar em conjunto com eGFR e ureia para estadiamento da função renal.",
    baixo: "Creatinina reduzida pode refletir baixa massa muscular ou desnutrição.",
    normal: "Creatinina dentro dos limites normais.",
  },
  "eGFR": {
    normal: "Taxa de filtração glomerular estimada normal (≥90 mL/min/1,73m²), indicando função renal preservada.",
    baixo: "eGFR reduzida indica comprometimento da função renal. Classificar estágio da DRC conforme diretrizes KDIGO.",
  },
  "Glicose": {
    elevado: "Glicemia de jejum elevada sugere resistência insulínica, pré-diabetes (100–125 mg/dL) ou diabetes mellitus (≥126 mg/dL). Correlacionar com HbA1c e história clínica.",
    baixo: "Hipoglicemia: investigar causa (jejum prolongado, uso de insulina, insulinoma). Sintomas incluem tremor, sudorese e confusão.",
    normal: "Glicemia de jejum normal.",
  },
  "Hemoglobina Glicada": {
    elevado: "HbA1c elevada reflete hiperglicemia média nos últimos 2–3 meses. Valores ≥6,5% confirmam diabetes mellitus; entre 5,7–6,4% indicam pré-diabetes.",
    normal: "HbA1c normal, indicando controle glicêmico adequado nos últimos 3 meses.",
  },
  "Colesterol Total": {
    elevado: "Colesterol total elevado (>190 mg/dL) associa-se a maior risco cardiovascular. Avaliar perfil lipídico completo e estratificar risco cardiovascular global.",
    normal: "Colesterol total dentro dos limites desejáveis.",
  },
  "LDL": {
    elevado: "LDL elevado ('colesterol ruim') é fator de risco independente para aterosclerose e eventos cardiovasculares. A meta terapêutica depende do risco cardiovascular individual.",
    normal: "LDL dentro do nível aceitável para o perfil de risco.",
  },
  "Colesterol HDL": {
    baixo: "HDL reduzido ('colesterol bom') é fator de risco cardiovascular independente. Atividade física aeróbica regular e ajuste dietético podem elevar o HDL.",
    normal: "HDL adequado, exercendo efeito cardioprotetor.",
  },
  "Triglicerídeos": {
    elevado: "Triglicerídeos elevados associam-se a risco cardiovascular aumentado, especialmente em combinação com HDL baixo. Investigar causas secundárias (dieta, álcool, hipotireoidismo, DM).",
    normal: "Triglicerídeos dentro dos limites normais.",
  },
  "TSH": {
    elevado: "TSH elevado sugere hipotireoidismo primário. Avaliar T4 livre para confirmar e estadiar.",
    baixo: "TSH suprimido pode indicar hipertireoidismo ou hipotireoidismo central. Correlacionar com T4 livre e T3.",
    normal: "TSH dentro dos limites normais, função tireoidiana preservada.",
  },
  "T4 Livre": {
    baixo: "T4 livre reduzido com TSH normal pode indicar hipotireoidismo central (hipofisário ou hipotalâmico) ou síndrome do doente eutireoideu. Avaliar contexto clínico.",
    elevado: "T4 livre elevado sugere hipertireoidismo. Correlacionar com TSH e sintomas clínicos.",
    normal: "T4 livre dentro dos limites normais.",
  },
  "PSA Total": {
    elevado: "PSA total elevado em homem acima de 60 anos requer investigação urológica. Causas incluem hiperplasia prostática benigna, prostatite e neoplasia prostática. Para PSA entre 4–10 ng/mL, a relação PSA Livre/Total auxilia na diferenciação.",
    normal: "PSA total dentro dos limites para a faixa etária.",
  },
  "PSA Livre": {
    elevado: "PSA livre elevado com PSA total entre 4–10 ng/mL: relação PSA Livre/Total >25% sugere maior probabilidade de hiperplasia benigna.",
    baixo: "PSA livre baixo em relação ao PSA total (<15%) aumenta a suspeita de neoplasia prostática. Avaliação urológica recomendada.",
    normal: "PSA livre dentro dos limites normais.",
  },
  "Contagem de Plaquetas": {
    baixo: "Trombocitopenia: investigar causas (PTI, hiperesplenismo, medicamentos, infecções). Risco hemorrágico aumentado abaixo de 50.000/μL.",
    elevado: "Trombocitose: pode ser reativa (infecção, inflamação, deficiência de ferro) ou primária (mieloproliferativa). Investigar conforme contexto.",
    normal: "Contagem de plaquetas normal.",
  },
  "VPM": {
    elevado: "VPM elevado pode indicar plaquetas jovens e grandes, associado a destruição periférica aumentada ou estados pró-trombóticos.",
    baixo: "VPM reduzido pode estar associado a hipoplasia megacariocítica.",
    normal: "Volume plaquetário médio normal.",
  },
  "Potássio": {
    baixo: "Hipocalemia: risco de arritmias cardíacas, fraqueza muscular e íleo paralítico. Investigar perdas renais ou gastrointestinais.",
    elevado: "Hipercalemia: risco de arritmias graves. Avaliar função renal, uso de medicamentos (IECAs, BRAs, poupadores de potássio) e acidose.",
    normal: "Potássio sérico dentro dos limites normais.",
  },
  "Sódio": {
    baixo: "Hiponatremia: sintomas variam de leve (náusea) a grave (convulsões, coma). Classificar em hipovolêmica, euvolêmica ou hipervolêmica.",
    elevado: "Hipernatremia: geralmente indica déficit de água livre. Avaliar estado de hidratação e perdas insensíveis.",
    normal: "Sódio sérico dentro dos limites normais.",
  },
};

/** Extrai valor numérico de uma string de resultado */
export function parseNumericResult(resultStr: string): number | null {
  if (!resultStr || resultStr === "null") return null;
  const match = resultStr.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/** Extrai min/max do intervalo de referência */
export function parseReferenceRange(refStr: string): { min: number | null; max: number | null } {
  if (!refStr || refStr === "null") return { min: null, max: null };

  // "X a Y" ou "X,X a Y,Y"
  const rangeMatch = refStr.replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*a\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };

  // "Inferior a X" ou "< X"
  const maxMatch = refStr.replace(/,/g, ".").match(/(?:inferior|<)\s*a?\s*(\d+(?:\.\d+)?)/i);
  if (maxMatch) return { min: null, max: parseFloat(maxMatch[1]) };

  // "Superior a X" ou "> X"
  const minMatch = refStr.replace(/,/g, ".").match(/(?:superior|>)\s*a?\s*(\d+(?:\.\d+)?)/i);
  if (minMatch) return { min: parseFloat(minMatch[1]), max: null };

  return { min: null, max: null };
}

/** Classifica o resultado de um exame */
export function classifyExam(
  status: string,
  numericResult: number | null,
  refMin: number | null,
  refMax: number | null
): ExamClassification {
  if (status === "normal") return "normal";

  if (status === "alterado" || status === "null" || !status) {
    if (numericResult === null) return "indeterminado";
    if (refMax !== null && numericResult > refMax) return "elevado";
    if (refMin !== null && numericResult < refMin) return "baixo";
    return "alterado";
  }

  return "indeterminado";
}

/** Busca interpretação clínica para um exame */
export function getClinicalInterpretation(examName: string, classification: ExamClassification): string {
  const nameLower = examName.toLowerCase();

  for (const [key, interpretations] of Object.entries(CLINICAL_KNOWLEDGE)) {
    if (nameLower.includes(key.toLowerCase()) || key.toLowerCase().includes(nameLower.split(" ")[0])) {
      const text = interpretations[classification];
      if (text) return text;
      // Fallback para "normal" se não houver para a classificação
      if (interpretations.normal) return interpretations.normal;
    }
  }

  if (classification === "elevado") return "Resultado acima do intervalo de referência. Avaliação clínica recomendada para determinar significância e conduta.";
  if (classification === "baixo") return "Resultado abaixo do intervalo de referência. Avaliação clínica recomendada para determinar significância e conduta.";
  if (classification === "normal") return "Resultado dentro dos limites de referência.";
  return "Resultado requer correlação clínica.";
}

/** Processa o JSON bruto e retorna dados estruturados */
export function processLabJson(payload: LabJsonPayload) {
  const campos = payload.campos;

  const sessionData = {
    patientName: campos.paciente_nome ?? null,
    patientDob: campos.paciente_data_nascimento ?? null,
    patientSex: campos.paciente_sexo ?? null,
    collectionDate: campos.data_realizacao ?? null,
    emissionDate: campos.data_emissao ?? null,
    requestingDoctor: campos.medico_solicitante ?? null,
    responsibleDoctor: campos.medico_responsavel ?? null,
    laboratory: campos.laboratorio_clinica ?? null,
    attendanceNumber: campos.numero_atendimento ?? null,
    material: campos.material ?? null,
    method: campos.metodo ?? null,
    observations: campos.observacoes ?? null,
    rawJson: payload as any,
  };

  const processedExams = (campos.exames ?? []).map((raw: RawExam) => {
    const numericResult = parseNumericResult(raw.resultado);
    const { min: refMin, max: refMax } = parseReferenceRange(raw.valor_referencia);
    const classification = classifyExam(raw.status, numericResult, refMin, refMax);
    const interpretation = getClinicalInterpretation(raw.nome_exame, classification);

    return {
      name: raw.nome_exame,
      result: raw.resultado,
      unit: raw.unidade,
      referenceRange: raw.valor_referencia,
      status: raw.status,
      interpretation,
    };
  });

  return { sessionData, processedExams };
}
