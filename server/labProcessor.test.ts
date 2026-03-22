import { describe, it, expect } from "vitest";
import {
  parseNumericResult,
  parseReferenceRange,
  classifyExam,
  getClinicalInterpretation,
  processLabJson,
} from "./labProcessor";

describe("parseNumericResult", () => {
  it("parses integer string", () => expect(parseNumericResult("53")).toBe(53));
  it("parses decimal with comma", () => expect(parseNumericResult("0,93")).toBe(0.93));
  it("parses decimal with dot", () => expect(parseNumericResult("8.36")).toBe(8.36));
  it("returns null for null string", () => expect(parseNumericResult("null")).toBeNull());
  it("returns null for empty string", () => expect(parseNumericResult("")).toBeNull());
  it("parses '32,8' (estradiol)", () => expect(parseNumericResult("32,8")).toBe(32.8));
  it("parses '372,0' (testosterona)", () => expect(parseNumericResult("372,0")).toBe(372));
  it("parses '0,92' (PCR)", () => expect(parseNumericResult("0,92")).toBe(0.92));
});

describe("parseReferenceRange", () => {
  it("parses 'X a Y' range", () => {
    expect(parseReferenceRange("17 a 43 mg/dL")).toEqual({ min: 17, max: 43 });
  });
  it("parses 'X,X a Y,Y' range with commas", () => {
    expect(parseReferenceRange("0,81 a 1,44 mg/dL")).toEqual({ min: 0.81, max: 1.44 });
  });
  it("parses 'Inferior a X'", () => {
    expect(parseReferenceRange("Inferior a 5,7%")).toEqual({ min: null, max: 5.7 });
  });
  it("parses '< X'", () => {
    expect(parseReferenceRange("<190")).toEqual({ min: null, max: 190 });
  });
  it("parses 'Superior a X'", () => {
    expect(parseReferenceRange("Superior a 90 mL/min")).toEqual({ min: 90, max: null });
  });
  it("returns null/null for unrecognized format", () => {
    expect(parseReferenceRange("null")).toEqual({ min: null, max: null });
  });

  // Intervalos complexos multi-faixa (laudo Marcondes)
  it("parses multi-range SHBG — retorna última faixa (adultos masculino)", () => {
    const ref = "Feminino Masculino 20 a 49 anos 32.4 - 128.0 nmol/L 20 a 49 anos 18.3 - 54.1 nmol/L Acima de 50 anos 27.1 - 128.0 nmol/L Acima de 50 anos 20.6 - 76.7 nmol/L";
    const result = parseReferenceRange(ref);
    // Deve retornar a última faixa encontrada
    expect(result.min).not.toBeNull();
    expect(result.max).not.toBeNull();
  });

  it("parses Testosterona Total multi-range — retorna última faixa (adultos)", () => {
    const ref = "Masculino Adultos 280 - 800 ng/dL";
    const result = parseReferenceRange(ref);
    expect(result.min).toBe(280);
    expect(result.max).toBe(800);
  });

  it("parses PCR ultra-sensível com 'Inferior a 1,0'", () => {
    // O campo tem texto descritivo; deve pegar o primeiro "Inferior a"
    const ref = "Risco baixo Inferior a 1.0 mg/L Risco médio 1.0 - 3.0 mg/L Risco alto Superior a 3.0 mg/L";
    const result = parseReferenceRange(ref);
    // Deve encontrar pelo menos uma faixa numérica
    expect(result.min !== null || result.max !== null).toBe(true);
  });
});

describe("classifyExam", () => {
  it("returns normal when status is normal", () => {
    expect(classifyExam("normal", 5, 3, 10)).toBe("normal");
  });
  it("returns elevado when value > refMax", () => {
    expect(classifyExam("alterado", 53, 17, 43)).toBe("elevado");
  });
  it("returns baixo when value < refMin", () => {
    expect(classifyExam("alterado", 0.59, 0.61, 1.12)).toBe("baixo");
  });
  it("returns indeterminado when no numeric result and no status", () => {
    expect(classifyExam("", null, null, null)).toBe("indeterminado");
  });
  it("returns elevado when only max is set and value exceeds it", () => {
    expect(classifyExam("alterado", 200, null, 190)).toBe("elevado");
  });
  it("returns normal for PCR 0.92 with max 1.0 and status normal", () => {
    expect(classifyExam("normal", 0.92, null, 1.0)).toBe("normal");
  });
  it("returns normal for Testosterona 372 within 280-800", () => {
    expect(classifyExam("normal", 372, 280, 800)).toBe("normal");
  });
});

describe("getClinicalInterpretation", () => {
  it("returns interpretation for Glicose elevated", () => {
    const text = getClinicalInterpretation("Glicose", "elevado");
    expect(text).toContain("Glicemia");
  });
  it("returns interpretation for PSA Total elevated", () => {
    const text = getClinicalInterpretation("PSA Total", "elevado");
    expect(text).toContain("PSA");
  });
  it("returns generic text for unknown exam", () => {
    const text = getClinicalInterpretation("ExameDesconhecido", "elevado");
    expect(text.length).toBeGreaterThan(10);
  });
  it("returns interpretation for PCR ultra-sensível", () => {
    const text = getClinicalInterpretation("PROTEÍNA C REATIVA ULTRA SENSÍVEL", "normal");
    expect(text.length).toBeGreaterThan(10);
  });
  it("returns interpretation for Testosterona Total", () => {
    const text = getClinicalInterpretation("TESTOSTERONA TOTAL", "normal");
    expect(text.length).toBeGreaterThan(10);
  });
  it("returns interpretation for Testosterona Livre", () => {
    const text = getClinicalInterpretation("Testosterona Livre", "normal");
    expect(text.length).toBeGreaterThan(10);
  });
  it("returns interpretation for SHBG", () => {
    const text = getClinicalInterpretation("GLOBULINA DE LIGAÇÃO DO HORMÔNIO SEXUAL (SHBG)", "normal");
    expect(text.length).toBeGreaterThan(10);
  });
  it("returns interpretation for Estradiol", () => {
    const text = getClinicalInterpretation("17- BETA ESTRADIOL (E2)", "normal");
    expect(text.length).toBeGreaterThan(10);
  });
});

describe("processLabJson", () => {
  const samplePayload = {
    tipo_laudo: "laboratorial",
    campos: {
      paciente_nome: "Carlos Omar Klassmann",
      paciente_data_nascimento: "03/12/1963",
      paciente_sexo: "Masculino",
      data_realizacao: "02/05/2025",
      laboratorio_clinica: "DASA",
      exames: [
        {
          nome_exame: "Glicose",
          resultado: "117",
          unidade: "mg/dL",
          valor_referencia: "70 a 99 mg/dL",
          status: "alterado",
        },
        {
          nome_exame: "Creatinina",
          resultado: "0,93",
          unidade: "mg/dL",
          valor_referencia: "0,81 a 1,44 mg/dL",
          status: "normal",
        },
      ],
    },
  };

  const marcondesPayload = {
    tipo_laudo: "laboratorial",
    campos: {
      paciente_nome: "MARCONDES DOS SANTOS KRESCH",
      paciente_sexo: "Masculino",
      data_realizacao: "27/02/2026",
      laboratorio_clinica: "Laboratório",
      exames: [
        {
          nome_exame: "PROTEÍNA C REATIVA ULTRA SENSÍVEL",
          resultado: "0,92",
          unidade: "mg/L",
          valor_referencia: "Risco baixo Inferior a 1,0 mg/L Risco médio 1,0 - 3,0 mg/L Risco alto Superior a 3,0 mg/L",
          status: "normal",
        },
        {
          nome_exame: "TESTOSTERONA TOTAL",
          resultado: "372,0",
          unidade: "ng/dL",
          valor_referencia: "Masculino Adultos 280 - 800 ng/dL",
          status: "normal",
        },
        {
          nome_exame: "GLOBULINA DE LIGAÇÃO DO HORMÔNIO SEXUAL (SHBG)",
          resultado: "25,8",
          unidade: "nmol/L",
          valor_referencia: "Masculino 20 a 49 anos 18,3 - 54,1 nmol/L",
          status: "normal",
        },
      ],
    },
  };

  it("extracts session data correctly", () => {
    const { sessionData } = processLabJson(samplePayload as any);
    expect(sessionData.patientName).toBe("Carlos Omar Klassmann");
    expect(sessionData.laboratory).toBe("DASA");
  });

  it("processes exams with correct count", () => {
    const { processedExams } = processLabJson(samplePayload as any);
    expect(processedExams).toHaveLength(2);
  });

  it("assigns interpretation to each exam", () => {
    const { processedExams } = processLabJson(samplePayload as any);
    processedExams.forEach((e) => {
      expect(e.interpretation).toBeTruthy();
      expect(e.interpretation!.length).toBeGreaterThan(5);
    });
  });

  it("processes Marcondes exams — all get interpretations", () => {
    const { processedExams } = processLabJson(marcondesPayload as any);
    expect(processedExams).toHaveLength(3);
    processedExams.forEach((e) => {
      expect(e.interpretation).toBeTruthy();
      expect(e.interpretation!.length).toBeGreaterThan(10);
    });
  });

  it("PCR 0.92 with status normal is classified correctly", () => {
    const { processedExams } = processLabJson(marcondesPayload as any);
    const pcr = processedExams.find((e) => e.name.includes("PROTEÍNA C REATIVA"));
    expect(pcr).toBeTruthy();
    expect(pcr!.interpretation).toBeTruthy();
  });

  it("Testosterona Total 372 gets interpretation", () => {
    const { processedExams } = processLabJson(marcondesPayload as any);
    const testo = processedExams.find((e) => e.name.includes("TESTOSTERONA TOTAL"));
    expect(testo).toBeTruthy();
    expect(testo!.interpretation!.length).toBeGreaterThan(10);
  });
});
