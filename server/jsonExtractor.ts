/**
 * MedSuite — JSON Extractor
 *
 * Recebe texto extraído por OCR e usa LLM para estruturar em JSON
 * conforme o tipo de documento: laboratório ou imagem (eco/TC/RM).
 */

import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LabExam {
  nome: string;
  resultado: string;
  unidade: string;
  valor_referencia: string;
  status: string;
}

export interface LabJson {
  paciente_nome: string;
  paciente_data_nascimento: string;
  paciente_sexo: string;
  data_coleta: string;
  data_emissao: string;
  laboratorio: string;
  medico_solicitante: string;
  medico_responsavel: string;
  numero_atendimento: string;
  material: string;
  metodo: string;
  observacoes: string;
  exames: LabExam[];
}

export interface ImagingJson {
  paciente_nome: string;
  paciente_data_nascimento: string;
  data_exame: string;
  tipo_exame: string;
  medico_solicitante: string;
  medico_responsavel: string;
  tecnica: string;
  descricao: string;
  conclusao: string;
  observacoes: string;
}

export type ExtractedResult =
  | { type: "lab"; data: LabJson; fileName: string }
  | { type: "imaging"; data: ImagingJson; fileName: string }
  | { type: "error"; error: string };

// ─── Lab Extraction ───────────────────────────────────────────────────────────

export async function extractLabJson(
  ocrText: string,
  patientName: string
): Promise<LabJson> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system" as const,
        content: `Você é um especialista em extração de dados de laudos laboratoriais brasileiros.
Extraia TODOS os exames do texto fornecido e retorne um JSON estruturado.
Para cada exame, extraia: nome, resultado, unidade, valor_referencia e status.
O status deve ser exatamente como aparece no laudo (normal, elevado, alto, baixo, alterado, etc.).
Se um campo não estiver disponível, use string vazia "".
Retorne APENAS o JSON, sem comentários.`,
      },
      {
        role: "user" as const,
        content: `Extraia os dados deste laudo laboratorial:\n\n${ocrText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "lab_result",
        strict: true,
        schema: {
          type: "object",
          properties: {
            paciente_nome: { type: "string" },
            paciente_data_nascimento: { type: "string" },
            paciente_sexo: { type: "string" },
            data_coleta: { type: "string" },
            data_emissao: { type: "string" },
            laboratorio: { type: "string" },
            medico_solicitante: { type: "string" },
            medico_responsavel: { type: "string" },
            numero_atendimento: { type: "string" },
            material: { type: "string" },
            metodo: { type: "string" },
            observacoes: { type: "string" },
            exames: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nome: { type: "string" },
                  resultado: { type: "string" },
                  unidade: { type: "string" },
                  valor_referencia: { type: "string" },
                  status: { type: "string" },
                },
                required: ["nome", "resultado", "unidade", "valor_referencia", "status"],
                additionalProperties: false,
              },
            },
          },
          required: [
            "paciente_nome",
            "paciente_data_nascimento",
            "paciente_sexo",
            "data_coleta",
            "data_emissao",
            "laboratorio",
            "medico_solicitante",
            "medico_responsavel",
            "numero_atendimento",
            "material",
            "metodo",
            "observacoes",
            "exames",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("LLM não retornou conteúdo para extração de laboratório.");

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

  // Se o nome do paciente não foi extraído, usar o nome do arquivo
  if (!parsed.paciente_nome && patientName) {
    parsed.paciente_nome = patientName;
  }

  return parsed as LabJson;
}

// ─── Imaging Extraction ───────────────────────────────────────────────────────

export async function extractImagingJson(
  ocrText: string,
  patientName: string
): Promise<ImagingJson> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system" as const,
        content: `Você é um especialista em extração de dados de laudos de exames de imagem brasileiros (ecocardiograma, ultrassom, tomografia, ressonância magnética).
Extraia os dados estruturados do texto fornecido.
Preserve o texto completo dos campos "descricao" e "conclusao" sem resumir.
Se um campo não estiver disponível, use string vazia "".
Retorne APENAS o JSON, sem comentários.`,
      },
      {
        role: "user" as const,
        content: `Extraia os dados deste laudo de exame de imagem:\n\n${ocrText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "imaging_result",
        strict: true,
        schema: {
          type: "object",
          properties: {
            paciente_nome: { type: "string" },
            paciente_data_nascimento: { type: "string" },
            data_exame: { type: "string" },
            tipo_exame: { type: "string" },
            medico_solicitante: { type: "string" },
            medico_responsavel: { type: "string" },
            tecnica: { type: "string" },
            descricao: { type: "string" },
            conclusao: { type: "string" },
            observacoes: { type: "string" },
          },
          required: [
            "paciente_nome",
            "paciente_data_nascimento",
            "data_exame",
            "tipo_exame",
            "medico_solicitante",
            "medico_responsavel",
            "tecnica",
            "descricao",
            "conclusao",
            "observacoes",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("LLM não retornou conteúdo para extração de imagem.");

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!parsed.paciente_nome && patientName) {
    parsed.paciente_nome = patientName;
  }

  return parsed as ImagingJson;
}

// ─── Document Type Detection ──────────────────────────────────────────────────

/**
 * Detecta o tipo predominante de um conjunto de páginas selecionadas.
 * Retorna "lab" se a maioria das páginas for classificada como "laudo",
 * "imaging" caso contrário.
 */
export function detectDocumentType(
  pageClassifications: Array<"laudo" | "imagem" | "indefinido">
): "lab" | "imaging" {
  const laudoCount = pageClassifications.filter((c) => c === "laudo").length;
  const imagemCount = pageClassifications.filter((c) => c === "imagem").length;
  return laudoCount >= imagemCount ? "lab" : "imaging";
}

// ─── File Name Generator ──────────────────────────────────────────────────────

/**
 * Gera o nome do arquivo JSON conforme a convenção:
 * primeiro_nome_lab.json / primeiro_nome_eco.json / primeiro_nome_ct_rm.json
 */
export function generateFileName(
  patientName: string,
  docType: "lab" | "imaging",
  examType?: string
): string {
  const firstName = (patientName || "paciente")
    .split(" ")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_");

  if (docType === "lab") return `${firstName}_lab.json`;

  // Imaging subtypes
  const type = (examType || "").toLowerCase();
  if (type.includes("eco") || type.includes("ultrassom") || type.includes("ultrasson") || type.includes("usg")) {
    return `${firstName}_eco.json`;
  }
  if (
    type.includes("tomografia") ||
    type.includes("ressonância") ||
    type.includes("ressonancia") ||
    type.includes("tc") ||
    type.includes("rm")
  ) {
    return `${firstName}_ct_rm.json`;
  }
  return `${firstName}_imagem.json`;
}
