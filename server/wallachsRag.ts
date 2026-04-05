/**
 * MedSuite — Wallach's RAG Engine v2.0
 *
 * Versão atualizada do motor RAG que suporta a base de conhecimento unificada
 * (Wallach's + Caquet), com melhorias para contexto bilíngue e alertas clínicos.
 *
 * Mudanças em relação à v1:
 * - Suporte a conceitos bilíngues (EN + PT-BR)
 * - Priorização de conceitos com alertas clínicos
 * - Uso do campo `context_pt` para enriquecer o prompt em português
 * - Suporte a valores de referência em unidades SI (do Caquet)
 * - Índice por especialidade para recuperação direcionada
 *
 * Ponto de integração: server/routers.ts → lab.generateClinicalSummary
 * Arquivo de dados: data/unified_knowledge_base.json (6.432 conceitos)
 */

import * as fs from "fs";
import * as path from "path";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface UnifiedChunk {
  unified_id: string;
  id: string;
  chapter: string;
  specialty: string;
  term: string;
  definition: string;
  keywords: string[];
  source?: string;
  language?: string;
  alert_level?: "normal" | "warning" | "critical";
  priority?: number;
  context?: string;
  context_pt?: string;           // Contexto em português (do Caquet)
  reference_values?: Record<string, any>;
  reference_values_pt?: Record<string, any>; // Valores SI (do Caquet)
  tfidfVector?: Record<string, number>;
}

export interface RetrievedContext {
  chunk: UnifiedChunk;
  score: number;
  relevanceReason: string;
}

export interface RagResult {
  contexts: RetrievedContext[];
  formattedContext: string;
  retrievedTerms: string[];
  hasAlerts: boolean;
  alertTerms: string[];
}

// ─── Stop words ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "has",
  "was", "had", "have", "with", "this", "that", "from", "they", "will",
  "been", "more", "when", "also", "into", "than", "its", "may", "which",
  "uma", "uns", "umas", "para", "com", "por", "que", "dos", "das", "nos",
  "nas", "seu", "sua", "seus", "suas", "como", "mais", "mas", "isso",
  "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas",
  "ser", "ter", "pode", "deve", "caso", "valor", "nível", "resultado",
]);

// ─── Utilitários TF-IDF ───────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-záéíóúàâêôãõüç\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .filter((t) => !STOP_WORDS.has(t));
}

function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] ?? 0) + 1;
  }
  const total = tokens.length || 1;
  for (const key of Object.keys(tf)) {
    tf[key] = tf[key] / total;
  }
  return tf;
}

function cosineSimilarity(
  vecA: Record<string, number>,
  vecB: Record<string, number>
): number {
  const keysA = Object.keys(vecA);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key of keysA) {
    dotProduct += (vecA[key] ?? 0) * (vecB[key] ?? 0);
    normA += (vecA[key] ?? 0) ** 2;
  }
  for (const val of Object.values(vecB)) {
    normB += val ** 2;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Motor RAG v2 ─────────────────────────────────────────────────────────────

export class WallachsRagEngineV2 {
  private chunks: UnifiedChunk[] = [];
  private idfScores: Record<string, number> = {};
  private isLoaded = false;
  private specialtyIndex: Record<string, string[]> = {};
  private alertChunks: UnifiedChunk[] = [];

  private readonly dataPath: string;
  private readonly indexPath: string;

  constructor(
    dataPath = path.join(process.cwd(), "data", "unified_knowledge_base.json"),
    indexPath = path.join(process.cwd(), "data", "unified_tfidf_index.json")
  ) {
    this.dataPath = dataPath;
    this.indexPath = indexPath;
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    // Tentar carregar índice TF-IDF pré-computado
    if (fs.existsSync(this.indexPath)) {
      console.log("[RAG v2] Carregando índice pré-computado...");
      const data = JSON.parse(fs.readFileSync(this.indexPath, "utf-8"));
      this.chunks = data.chunks;
      this.idfScores = data.idfScores;
      this.specialtyIndex = data.specialtyIndex ?? {};
      this.alertChunks = this.chunks.filter(
        (c) => c.alert_level === "critical" || c.alert_level === "warning"
      );
      this.isLoaded = true;
      console.log(`[RAG v2] Índice carregado: ${this.chunks.length} chunks`);
      return;
    }

    // Construir índice a partir da base unificada
    console.log("[RAG v2] Construindo índice TF-IDF da base unificada...");
    await this.buildIndex();
  }

  private async buildIndex(): Promise<void> {
    if (!fs.existsSync(this.dataPath)) {
      console.warn("[RAG v2] Base de dados não encontrada:", this.dataPath);
      return;
    }

    const rawData = JSON.parse(fs.readFileSync(this.dataPath, "utf-8"));
    const concepts: UnifiedChunk[] = rawData.concepts ?? [];
    this.specialtyIndex = rawData.indexes?.bySpecialty ?? {};

    const allTokens: string[][] = [];

    for (const concept of concepts) {
      // Combinar texto em inglês e português para indexação bilíngue
      const textForIndexing = [
        concept.term,
        concept.definition,
        concept.context ?? "",
        concept.context_pt ?? "",
        (concept.keywords ?? []).join(" "),
      ].join(" ");

      const tokens = tokenize(textForIndexing);
      allTokens.push(tokens);
      this.chunks.push({ ...concept });
    }

    // Calcular IDF
    this.idfScores = this.calculateIDF(allTokens);

    // Calcular vetores TF-IDF
    for (let i = 0; i < this.chunks.length; i++) {
      const tokens = allTokens[i];
      const tf = termFrequency(tokens);
      const tfidf: Record<string, number> = {};
      for (const [term, tfScore] of Object.entries(tf)) {
        tfidf[term] = tfScore * (this.idfScores[term] ?? 1);
      }
      this.chunks[i].tfidfVector = tfidf;
    }

    // Índice de alertas
    this.alertChunks = this.chunks.filter(
      (c) => c.alert_level === "critical" || c.alert_level === "warning"
    );

    // Salvar índice
    const dataDir = path.dirname(this.indexPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(
      this.indexPath,
      JSON.stringify(
        { chunks: this.chunks, idfScores: this.idfScores, specialtyIndex: this.specialtyIndex },
        null,
        2
      )
    );

    this.isLoaded = true;
    console.log(
      `[RAG v2] Índice construído: ${this.chunks.length} chunks, ` +
      `${this.alertChunks.length} com alertas`
    );
  }

  private calculateIDF(allTokens: string[][]): Record<string, number> {
    const docCount = allTokens.length;
    const docFreq: Record<string, number> = {};

    for (const tokens of allTokens) {
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        docFreq[token] = (docFreq[token] ?? 0) + 1;
      }
    }

    const idf: Record<string, number> = {};
    for (const [term, freq] of Object.entries(docFreq)) {
      idf[term] = Math.log(docCount / (freq + 1)) + 1;
    }
    return idf;
  }

  /**
   * Recupera os chunks mais relevantes para os exames informados.
   * Prioriza: alertas clínicos > correspondência exata > similaridade TF-IDF
   */
  async retrieve(
    examNames: string[],
    examStatuses: string[],
    topK = 6
  ): Promise<RagResult> {
    await this.initialize();

    if (this.chunks.length === 0) {
      return { contexts: [], formattedContext: "", retrievedTerms: [], hasAlerts: false, alertTerms: [] };
    }

    // Query combinada
    const queryText = examNames
      .map((name, i) => `${name} ${examStatuses[i] ?? ""}`)
      .join(" ");

    const queryTokens = tokenize(queryText);
    const queryTf = termFrequency(queryTokens);
    const queryTfidf: Record<string, number> = {};
    for (const [term, tfScore] of Object.entries(queryTf)) {
      queryTfidf[term] = tfScore * (this.idfScores[term] ?? 1);
    }

    // Calcular scores
    const scored: Array<{ chunk: UnifiedChunk; score: number }> = [];

    for (const chunk of this.chunks) {
      if (!chunk.tfidfVector) continue;

      let score = cosineSimilarity(queryTfidf, chunk.tfidfVector);

      // Boost por correspondência exata de nome de exame
      const chunkTermLower = chunk.term.toLowerCase();
      for (const examName of examNames) {
        const examLower = examName.toLowerCase();
        if (chunkTermLower.includes(examLower) || examLower.includes(chunkTermLower)) {
          score += 0.5;
        }
        // Boost parcial por palavras
        for (const word of examLower.split(/\s+/)) {
          if (word.length > 3 && chunkTermLower.includes(word)) {
            score += 0.1;
          }
        }
      }

      // Boost por prioridade (alertas, bilíngue, valores de referência)
      const priority = chunk.priority ?? 0;
      score += priority * 0.001;

      // Boost extra para alertas críticos
      if (chunk.alert_level === "critical") score += 0.3;
      else if (chunk.alert_level === "warning") score += 0.15;

      // Boost para conceitos em português (mais relevantes para laudos BR)
      if (chunk.language === "pt-BR") score += 0.05;

      if (score > 0.01) {
        scored.push({ chunk, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topChunks = scored.slice(0, topK);

    const contexts: RetrievedContext[] = topChunks.map(({ chunk, score }) => ({
      chunk,
      score,
      relevanceReason: this.explainRelevance(chunk, examNames),
    }));

    const hasAlerts = contexts.some(
      (c) => c.chunk.alert_level === "critical" || c.chunk.alert_level === "warning"
    );

    const alertTerms = contexts
      .filter((c) => c.chunk.alert_level !== "normal")
      .map((c) => c.chunk.term);

    const formattedContext = this.formatContextForPrompt(contexts);
    const retrievedTerms = [...new Set(contexts.map((c) => c.chunk.term))];

    return { contexts, formattedContext, retrievedTerms, hasAlerts, alertTerms };
  }

  private explainRelevance(chunk: UnifiedChunk, examNames: string[]): string {
    for (const examName of examNames) {
      if (chunk.term.toLowerCase().includes(examName.toLowerCase())) {
        return `Correspondência direta com "${examName}"`;
      }
    }
    const source = chunk.language === "pt-BR" ? "Caquet" : "Wallach's";
    return `Relevante para o contexto clínico — ${source} (${chunk.specialty})`;
  }

  /**
   * Formata os contextos recuperados para injeção no prompt do LLM.
   * Prioriza texto em português quando disponível (campo context_pt).
   */
  formatContextForPrompt(contexts: RetrievedContext[]): string {
    if (contexts.length === 0) return "";

    const lines = [
      "=== BASE DE CONHECIMENTO CLÍNICO ===",
      "(Fontes: Wallach's Interpretation of Diagnostic Tests 9ª ed. + 250 Exames de Laboratório — Caquet 12ª ed.)",
      "",
    ];

    for (const { chunk } of contexts) {
      const alertPrefix =
        chunk.alert_level === "critical" ? "⚠️ ALERTA CRÍTICO — " :
        chunk.alert_level === "warning" ? "⚠️ Atenção — " : "";

      lines.push(`[${chunk.specialty?.toUpperCase() ?? chunk.chapter}] ${alertPrefix}${chunk.term}`);

      // Preferir contexto em português se disponível
      if (chunk.context_pt) {
        lines.push(chunk.context_pt);
      } else {
        lines.push(chunk.definition);
      }

      // Adicionar valores de referência em PT-BR se disponíveis
      if (chunk.reference_values_pt) {
        const refs = chunk.reference_values_pt;
        if (refs.ranges?.length) {
          const rangeStr = refs.ranges
            .map((r: any) => `${r.min}–${r.max} ${r.unit}`)
            .join(", ");
          lines.push(`Valores de referência: ${rangeStr}`);
        }
      }

      lines.push("");
    }

    lines.push("=== FIM DA BASE DE CONHECIMENTO ===");
    return lines.join("\n");
  }
}

// ─── Singleton global ─────────────────────────────────────────────────────────

let _ragEngineV2: WallachsRagEngineV2 | null = null;

export function getRagEngine(): WallachsRagEngineV2 {
  if (!_ragEngineV2) {
    _ragEngineV2 = new WallachsRagEngineV2();
  }
  return _ragEngineV2;
}
