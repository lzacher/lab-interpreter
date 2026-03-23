import { describe, expect, it } from "vitest";

/**
 * Testes do parseamento do JSON de exames laboratoriais.
 * A interpretação clínica automática foi removida — os dados são exibidos
 * diretamente como vieram do JSON (nome, resultado, unidade, valor de referência).
 */

// Replica a lógica de parseLabJson do routers.ts
function parseLabJson(raw: any) {
  const campos = raw?.campos ?? {};

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
  };

  const exams = (campos.exames ?? []).map((e: any) => ({
    name: String(e.nome_exame ?? ""),
    result: String(e.resultado ?? ""),
    unit: String(e.unidade ?? ""),
    referenceRange: String(e.valor_referencia ?? ""),
    status: String(e.status ?? ""),
  }));

  return { sessionData, exams };
}

// JSON de exemplo baseado no formato do ExamesCarlos
const carlosJson = {
  tipo_laudo: "Bioquímica",
  campos: {
    paciente_nome: "Carlos Silva",
    paciente_data_nascimento: "1975-03-10",
    paciente_sexo: "Masculino",
    data_realizacao: "2024-01-15",
    laboratorio_clinica: "LabTeste",
    exames: [
      { nome_exame: "Glicose", resultado: "110", unidade: "mg/dL", valor_referencia: "70 - 99 mg/dL", status: "elevado" },
      { nome_exame: "Creatinina", resultado: "0,9", unidade: "mg/dL", valor_referencia: "0,7 - 1,3 mg/dL", status: "normal" },
      { nome_exame: "Colesterol Total", resultado: "220", unidade: "mg/dL", valor_referencia: "< 190 mg/dL", status: "elevado" },
    ],
  },
};

// JSON baseado no laudo do Marcondes (valores de referência muito longos)
const marcondesJson = {
  tipo_laudo: "Hormônios",
  campos: {
    paciente_nome: "Marcondes Ferreira",
    paciente_sexo: "Masculino",
    data_realizacao: "2024-02-20",
    laboratorio_clinica: "LabHormônios",
    exames: [
      {
        nome_exame: "TESTOSTERONA TOTAL",
        resultado: "372,0",
        unidade: "ng/dL",
        valor_referencia: "Feminino Masculino Crianças pré-púberes Inferior a 40 ng/dL Inferior a 1 ano 12 - 21 ng/dL Adultos 6 - 82 ng/dL 1 a 6 anos 3 - 32 ng/dL 7 a 12 anos 3 - 68 ng/dL 13 a 17 anos 28 - 1110 ng/dL Adultos 280 - 800 ng/dL",
        status: "normal",
      },
      {
        nome_exame: "Testosterona Livre",
        resultado: "8,59",
        unidade: "ng/dL",
        valor_referencia: "Feminino: 20 a 49 anos 0,08 - 0,95 ng/dL acima de 50 anos 0,02 - 0,57 ng/dL Masculino: 20 a 49 anos 5,71 - 17,85 ng/dL acima de 50 anos 4,70 - 13,64 ng/dL",
        status: "normal",
      },
      {
        nome_exame: "GLOBULINA DE LIGAÇÃO DO HORMÔNIO SEXUAL (SHBG)",
        resultado: "25,8",
        unidade: "nmol/L",
        valor_referencia: "Feminino Masculino 20 a 49 anos 32,4 - 128,0 nmol/L 20 a 49 anos 18,3 - 54,1 nmol/L Acima de 50 anos 27,1 - 128,0 nmol/L Acima de 50 anos 20,6 - 76,7 nmol/L",
        status: "normal",
      },
      {
        nome_exame: "PCR Ultra-Sensível",
        resultado: "0,30",
        unidade: "mg/L",
        valor_referencia: "Risco cardiovascular baixo: < 1,0 mg/L Risco cardiovascular intermediário: 1,0 - 3,0 mg/L Risco cardiovascular alto: > 3,0 mg/L",
        status: "normal",
      },
    ],
  },
};

describe("parseLabJson — dados básicos (Carlos)", () => {
  it("extrai metadados do paciente corretamente", () => {
    const { sessionData } = parseLabJson(carlosJson);
    expect(sessionData.patientName).toBe("Carlos Silva");
    expect(sessionData.patientSex).toBe("Masculino");
    expect(sessionData.collectionDate).toBe("2024-01-15");
    expect(sessionData.laboratory).toBe("LabTeste");
  });

  it("extrai a lista de exames corretamente", () => {
    const { exams } = parseLabJson(carlosJson);
    expect(exams).toHaveLength(3);
  });

  it("preserva nome do exame sem alteração", () => {
    const { exams } = parseLabJson(carlosJson);
    expect(exams[0].name).toBe("Glicose");
    expect(exams[1].name).toBe("Creatinina");
    expect(exams[2].name).toBe("Colesterol Total");
  });

  it("preserva resultado como string", () => {
    const { exams } = parseLabJson(carlosJson);
    expect(exams[0].result).toBe("110");
    expect(exams[1].result).toBe("0,9");
  });

  it("preserva unidade corretamente", () => {
    const { exams } = parseLabJson(carlosJson);
    expect(exams[0].unit).toBe("mg/dL");
  });

  it("preserva valor de referência sem truncamento", () => {
    const { exams } = parseLabJson(carlosJson);
    expect(exams[0].referenceRange).toBe("70 - 99 mg/dL");
  });

  it("preserva status do exame", () => {
    const { exams } = parseLabJson(carlosJson);
    expect(exams[0].status).toBe("elevado");
    expect(exams[1].status).toBe("normal");
  });
});

describe("parseLabJson — laudo Marcondes (valores de referência longos)", () => {
  it("extrai todos os 4 exames do laudo Marcondes", () => {
    const { exams } = parseLabJson(marcondesJson);
    expect(exams).toHaveLength(4);
  });

  it("preserva valor de referência longo da Testosterona Total (> 100 chars)", () => {
    const { exams } = parseLabJson(marcondesJson);
    const testo = exams.find((e) => e.name === "TESTOSTERONA TOTAL");
    expect(testo).toBeDefined();
    expect(testo!.referenceRange.length).toBeGreaterThan(100);
    expect(testo!.referenceRange).toContain("280 - 800 ng/dL");
  });

  it("preserva valor de referência longo do SHBG (> 100 chars)", () => {
    const { exams } = parseLabJson(marcondesJson);
    const shbg = exams.find((e) => e.name.includes("SHBG"));
    expect(shbg).toBeDefined();
    expect(shbg!.referenceRange.length).toBeGreaterThan(100);
    expect(shbg!.referenceRange).toContain("18,3 - 54,1 nmol/L");
  });

  it("preserva valor de referência do PCR com múltiplas faixas de risco", () => {
    const { exams } = parseLabJson(marcondesJson);
    const pcr = exams.find((e) => e.name === "PCR Ultra-Sensível");
    expect(pcr).toBeDefined();
    expect(pcr!.referenceRange).toContain("< 1,0 mg/L");
    expect(pcr!.referenceRange).toContain("> 3,0 mg/L");
  });

  it("preserva resultado numérico com vírgula decimal", () => {
    const { exams } = parseLabJson(marcondesJson);
    const testo = exams.find((e) => e.name === "TESTOSTERONA TOTAL");
    expect(testo!.result).toBe("372,0");
  });

  it("preserva status vindo do JSON sem modificação", () => {
    const { exams } = parseLabJson(marcondesJson);
    exams.forEach((e) => {
      expect(e.status).toBe("normal");
    });
  });

  it("extrai metadados do paciente Marcondes", () => {
    const { sessionData } = parseLabJson(marcondesJson);
    expect(sessionData.patientName).toBe("Marcondes Ferreira");
    expect(sessionData.laboratory).toBe("LabHormônios");
  });
});

describe("parseLabJson — casos extremos", () => {
  it("retorna arrays vazios para JSON sem exames", () => {
    const { exams } = parseLabJson({ campos: {} });
    expect(exams).toHaveLength(0);
  });

  it("retorna metadados nulos para JSON sem campos de paciente", () => {
    const { sessionData } = parseLabJson({ campos: { exames: [] } });
    expect(sessionData.patientName).toBeNull();
    expect(sessionData.patientSex).toBeNull();
  });

  it("converte campos ausentes para string vazia", () => {
    const { exams } = parseLabJson({
      campos: {
        exames: [{ nome_exame: "Hemoglobina" }],
      },
    });
    expect(exams[0].name).toBe("Hemoglobina");
    expect(exams[0].result).toBe("");
    expect(exams[0].unit).toBe("");
    expect(exams[0].referenceRange).toBe("");
    expect(exams[0].status).toBe("");
  });

  it("lida com JSON completamente vazio sem erros", () => {
    expect(() => parseLabJson({})).not.toThrow();
    const { exams, sessionData } = parseLabJson({});
    expect(exams).toHaveLength(0);
    expect(sessionData.patientName).toBeNull();
  });

  it("preserva campos opcionais quando presentes", () => {
    const { sessionData } = parseLabJson({
      campos: {
        exames: [],
        medico_solicitante: "Dr. João",
        observacoes: "Jejum de 8h",
        numero_atendimento: "12345",
      },
    });
    expect(sessionData.requestingDoctor).toBe("Dr. João");
    expect(sessionData.observations).toBe("Jejum de 8h");
    expect(sessionData.attendanceNumber).toBe("12345");
  });
});
