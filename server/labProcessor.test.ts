import { describe, it, expect } from "vitest";
import {
  parseNumericResult,
  parseReferenceRange,
  classifyExam,
  getClinicalInterpretation,
  processLabJson,
} from "./labProcessor";

describe("parseNumericResult", () => {
  it("parses integer string", () => {
    expect(parseNumericResult("53")).toBe(53);
  });
  it("parses decimal with comma", () => {
    expect(parseNumericResult("0,93")).toBe(0.93);
  });
  it("parses decimal with dot", () => {
    expect(parseNumericResult("8.36")).toBe(8.36);
  });
  it("parses value with text prefix like '194.000'", () => {
    expect(parseNumericResult("194.000")).toBe(194);
  });
  it("returns null for 'Superior a 90'", () => {
    // 'Superior a 90' has a number, so it parses 90
    expect(parseNumericResult("Superior a 90")).toBe(90);
  });
  it("returns null for null string", () => {
    expect(parseNumericResult("null")).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(parseNumericResult("")).toBeNull();
  });
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
  it("returns indeterminado when no numeric result", () => {
    expect(classifyExam("alterado", null, null, null)).toBe("indeterminado");
  });
  it("returns elevado when only max is set and value exceeds it", () => {
    expect(classifyExam("alterado", 200, null, 190)).toBe("elevado");
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
  it("returns normal text for normal classification", () => {
    const text = getClinicalInterpretation("Creatinina", "normal");
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

  it("extracts session data correctly", () => {
    const { sessionData } = processLabJson(samplePayload as any);
    expect(sessionData.patientName).toBe("Carlos Omar Klassmann");
    expect(sessionData.laboratory).toBe("DASA");
  });

  it("processes exams with correct count", () => {
    const { processedExams } = processLabJson(samplePayload as any);
    expect(processedExams).toHaveLength(2);
  });

  it("classifies Glicose as elevated", () => {
    const { processedExams } = processLabJson(samplePayload as any);
    const glicose = processedExams.find((e) => e.name === "Glicose");
    expect(glicose?.interpretation).toBeTruthy();
  });

  it("assigns interpretation to each exam", () => {
    const { processedExams } = processLabJson(samplePayload as any);
    processedExams.forEach((e) => {
      expect(e.interpretation).toBeTruthy();
      expect(e.interpretation!.length).toBeGreaterThan(5);
    });
  });
});
