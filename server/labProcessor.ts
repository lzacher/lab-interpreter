import type { RawExam, ExamClassification, ProcessedExam, LabJsonPayload } from "../shared/labTypes";

// ─── Base de conhecimento clínico ─────────────────────────────────────────────

const CLINICAL_KNOWLEDGE: Record<string, Partial<Record<ExamClassification, string>>> = {
  // Função renal
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
  // Glicemia
  "Glicose": {
    elevado: "Glicemia de jejum elevada sugere resistência insulínica, pré-diabetes (100–125 mg/dL) ou diabetes mellitus (≥126 mg/dL). Correlacionar com HbA1c e história clínica.",
    baixo: "Hipoglicemia: investigar causa (jejum prolongado, uso de insulina, insulinoma). Sintomas incluem tremor, sudorese e confusão.",
    normal: "Glicemia de jejum normal.",
  },
  "Hemoglobina Glicada": {
    elevado: "HbA1c elevada reflete hiperglicemia média nos últimos 2–3 meses. Valores ≥6,5% confirmam diabetes mellitus; entre 5,7–6,4% indicam pré-diabetes.",
    normal: "HbA1c normal, indicando controle glicêmico adequado nos últimos 3 meses.",
  },
  // Perfil lipídico
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
  // Tireoide
  "TSH": {
    elevado: "TSH elevado sugere hipotireoidismo primário. Avaliar T4 livre para confirmar e estadiar.",
    baixo: "TSH suprimido pode indicar hipertireoidismo ou hipotireoidismo central. Correlacionar com T4 livre e T3.",
    normal: "TSH dentro dos limites normais, função tireoidiana preservada.",
  },
  "T4 Livre": {
    baixo: "T4 livre reduzido pode indicar hipotireoidismo central ou síndrome do doente eutireoideu. Avaliar contexto clínico.",
    elevado: "T4 livre elevado sugere hipertireoidismo. Correlacionar com TSH e sintomas clínicos.",
    normal: "T4 livre dentro dos limites normais.",
  },
  // PSA
  "PSA Total": {
    elevado: "PSA total elevado requer investigação urológica. Causas incluem hiperplasia prostática benigna, prostatite e neoplasia prostática. Para PSA entre 4–10 ng/mL, a relação PSA Livre/Total auxilia na diferenciação.",
    normal: "PSA total dentro dos limites para a faixa etária.",
  },
  "PSA Livre": {
    elevado: "PSA livre elevado com PSA total entre 4–10 ng/mL: relação PSA Livre/Total >25% sugere maior probabilidade de hiperplasia benigna.",
    baixo: "PSA livre baixo em relação ao PSA total (<15%) aumenta a suspeita de neoplasia prostática. Avaliação urológica recomendada.",
    normal: "PSA livre dentro dos limites normais.",
  },
  // Hemograma
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
  // Eletrólitos
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
  // Inflamação / PCR
  "PROTEÍNA C REATIVA": {
    elevado: "PCR ultra-sensível elevada indica processo inflamatório ou infeccioso ativo. Valores entre 1,0–3,0 mg/L indicam risco cardiovascular intermediário; acima de 3,0 mg/L, risco alto ou processo agudo. Correlacionar com quadro clínico.",
    normal: "PCR ultra-sensível dentro da faixa de baixo risco cardiovascular (<1,0 mg/L), sem evidência de inflamação sistêmica significativa.",
  },
  "PCR": {
    elevado: "PCR elevada indica processo inflamatório ou infeccioso ativo. Correlacionar com quadro clínico e outros marcadores inflamatórios.",
    normal: "PCR dentro dos limites normais, sem evidência de inflamação sistêmica significativa.",
  },
  // Hormônios sexuais
  "ESTRADIOL": {
    elevado: "Estradiol elevado em homens pode estar associado a obesidade, uso de medicamentos estrogênicos, tumores produtores de estrogênio ou insuficiência hepática. Avaliar clinicamente.",
    baixo: "Estradiol reduzido em homens pode indicar hipogonadismo. Em mulheres, associa-se a menopausa, insuficiência ovariana ou hipopituitarismo.",
    normal: "Estradiol dentro dos limites de referência para o sexo e fase hormonal.",
  },
  "17- BETA ESTRADIOL": {
    elevado: "Estradiol (E2) elevado em homens pode estar associado a obesidade, uso de medicamentos estrogênicos, tumores produtores de estrogênio ou insuficiência hepática.",
    baixo: "Estradiol (E2) reduzido em homens pode indicar hipogonadismo. Em mulheres, associa-se a menopausa ou insuficiência ovariana.",
    normal: "Estradiol (E2) dentro dos limites de referência para o sexo e fase hormonal.",
  },
  "TESTOSTERONA TOTAL": {
    elevado: "Testosterona total elevada em homens adultos pode indicar uso de andrógenos exógenos ou tumor produtor de androgênio. Em mulheres, associa-se a síndrome dos ovários policísticos (SOP) ou hiperplasia adrenal.",
    baixo: "Testosterona total baixa em homens (hipogonadismo) associa-se a fadiga, disfunção erétil, redução da libido, perda de massa muscular e óssea. Investigar causa primária ou secundária.",
    normal: "Testosterona total dentro dos limites de referência para o sexo e faixa etária.",
  },
  "Testosterona Livre": {
    elevado: "Testosterona livre elevada indica excesso androgênico biologicamente ativo. Em homens, pode estar associada a uso de andrógenos exógenos; em mulheres, à SOP.",
    baixo: "Testosterona livre baixa, mesmo com testosterona total normal, pode indicar hipogonadismo funcional, especialmente em contexto de SHBG elevada.",
    normal: "Testosterona livre dentro dos limites de referência para o sexo e faixa etária.",
  },
  "Testosterona Biodisponível": {
    elevado: "Testosterona biodisponível elevada indica excesso androgênico ativo. Avaliar clinicamente.",
    baixo: "Testosterona biodisponível baixa pode indicar hipogonadismo funcional, mesmo com testosterona total normal. Considerar avaliação de SHBG.",
    normal: "Testosterona biodisponível dentro dos limites de referência para o sexo e faixa etária.",
  },
  "SHBG": {
    elevado: "SHBG elevada reduz a fração livre e biodisponível da testosterona, podendo causar sintomas de hipogonadismo mesmo com testosterona total normal. Causas incluem hipertireoidismo, uso de estrogênios e hepatopatia.",
    baixo: "SHBG reduzida aumenta a fração livre de testosterona. Em homens, associa-se a obesidade, resistência insulínica e síndrome metabólica.",
    normal: "SHBG dentro dos limites de referência para o sexo e faixa etária.",
  },
  "GLOBULINA DE LIGAÇÃO": {
    elevado: "SHBG elevada reduz a fração livre e biodisponível da testosterona, podendo causar sintomas de hipogonadismo mesmo com testosterona total normal.",
    baixo: "SHBG reduzida aumenta a fração livre de testosterona. Associa-se a obesidade, resistência insulínica e síndrome metabólica.",
    normal: "SHBG dentro dos limites de referência para o sexo e faixa etária.",
  },
};

// ─── Utilitários de parsing ───────────────────────────────────────────────────

/** Extrai valor numérico de uma string de resultado */
export function parseNumericResult(resultStr: string): number | null {
  if (!resultStr || resultStr === "null") return null;
  const clean = resultStr.replace(",", ".");
  const match = clean.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extrai min/max do intervalo de referência.
 * Estratégia: tenta encontrar a faixa mais simples "X a Y" ou "< X" / "> X".
 * Para intervalos multi-critério (sexo, faixa etária), usa a primeira faixa numérica encontrada
 * como estimativa, pois o sexo/idade do paciente não está disponível neste contexto.
 */
export function parseReferenceRange(refStr: string): { min: number | null; max: number | null } {
  if (!refStr || refStr === "null") return { min: null, max: null };

  const clean = refStr.replace(/,/g, ".");

  // Tenta "X - Y" — pega a ÚLTIMA ocorrência para intervalos multi-linha (ex: adultos)
  const dashRegex = /(\d+(?:\.\d+)?)\s*[-\u2013]\s*(\d+(?:\.\d+)?)/g;
  let dashMatch: RegExpExecArray | null;
  let lastDashMatch: RegExpExecArray | null = null;
  while ((dashMatch = dashRegex.exec(clean)) !== null) lastDashMatch = dashMatch;
  if (lastDashMatch) {
    return { min: parseFloat(lastDashMatch[1]), max: parseFloat(lastDashMatch[2]) };
  }

  // "X a Y" com palavra "a"
  const wordRegex = /(\d+(?:\.\d+)?)\s+a\s+(\d+(?:\.\d+)?)/gi;
  let wordMatch: RegExpExecArray | null;
  let lastWordMatch: RegExpExecArray | null = null;
  while ((wordMatch = wordRegex.exec(clean)) !== null) lastWordMatch = wordMatch;
  if (lastWordMatch) {
    return { min: parseFloat(lastWordMatch[1]), max: parseFloat(lastWordMatch[2]) };
  }

  // "Inferior a X" ou "< X"
  const maxMatch = clean.match(/(?:inferior|<)\s*a?\s*(\d+(?:\.\d+)?)/i);
  if (maxMatch) return { min: null, max: parseFloat(maxMatch[1]) };

  // "Superior a X" ou "> X"
  const minMatch = clean.match(/(?:superior|>)\s*a?\s*(\d+(?:\.\d+)?)/i);
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
  // Se o JSON já traz status "normal", confiar nele
  if (status === "normal") return "normal";

  // Se há valor numérico e referência, classificar
  if (numericResult !== null) {
    if (refMax !== null && numericResult > refMax) return "elevado";
    if (refMin !== null && numericResult < refMin) return "baixo";
    // Tem valor e referência mas está dentro — normal
    if (refMin !== null || refMax !== null) return "normal";
  }

  // Status "alterado" sem referência numérica parseável
  if (status === "alterado") return "alterado";

  return "indeterminado";
}

/** Busca interpretação clínica para um exame */
export function getClinicalInterpretation(examName: string, classification: ExamClassification): string {
  const nameUpper = examName.toUpperCase().trim();

  // Primeira passagem: correspondência exata ou por inclusão direta (mais específica)
  for (const [key, interpretations] of Object.entries(CLINICAL_KNOWLEDGE)) {
    const keyUpper = key.toUpperCase().trim();
    if (nameUpper.includes(keyUpper) || keyUpper.includes(nameUpper)) {
      const text = interpretations[classification];
      if (text) return text;
      if (interpretations.normal) return interpretations.normal;
      break;
    }
  }

  // Segunda passagem: correspondência por palavras-chave significativas (≥5 chars)
  // Exclui palavras genéricas que causam falsos positivos
  const STOP_WORDS = new Set(["TOTAL", "LIVRE", "ULTRA", "REATIVA", "SENSÍVEL", "LIGAÇÃO"]);
  const nameWords = nameUpper.split(/\s+/).filter((w) => w.length >= 5 && !STOP_WORDS.has(w));

  for (const [key, interpretations] of Object.entries(CLINICAL_KNOWLEDGE)) {
    const keyUpper = key.toUpperCase();
    if (nameWords.some((word) => keyUpper.includes(word))) {
      const text = interpretations[classification];
      if (text) return text;
      if (interpretations.normal) return interpretations.normal;
      break;
    }
  }

  // Fallbacks genéricos
  if (classification === "elevado") return "Resultado acima do intervalo de referência. Avaliação clínica recomendada para determinar significância e conduta.";
  if (classification === "baixo") return "Resultado abaixo do intervalo de referência. Avaliação clínica recomendada para determinar significância e conduta.";
  if (classification === "normal") return "Resultado dentro dos limites de referência.";
  if (classification === "alterado") return "Resultado fora dos limites de referência. Avaliação clínica recomendada.";
  return "Resultado requer correlação clínica com dados do paciente.";
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
