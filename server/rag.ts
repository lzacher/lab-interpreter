/**
 * RAG (Retrieval-Augmented Generation) module
 *
 * Uses keyword-based search (LIKE) on the knowledge_base table to find
 * relevant chunks from medical reference books. No external dependencies —
 * works in any environment that has a MySQL/TiDB connection.
 */

import mysql2 from "mysql2/promise";

const TOP_K = 5;
const MAX_CONTEXT_CHARS = 3000;

export interface KnowledgeChunk {
  id: number;
  source: string;
  chunkIndex: number;
  chunkText: string;
  score?: number;
}

export interface RagResult {
  context: string;
  chunks: KnowledgeChunk[];
}

// --- DB connection ---

async function createRagConnection(): Promise<mysql2.Connection | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  try {
    const url = new URL(dbUrl);
    const conn = await mysql2.createConnection({
      host: url.hostname,
      port: parseInt(url.port || "4000"),
      user: url.username,
      password: url.password,
      database: url.pathname.replace(/^\//, "").split("?")[0],
      ssl: { rejectUnauthorized: false },
      connectTimeout: 8000,
    });
    return conn;
  } catch (error) {
    console.warn("[RAG] DB connection failed:", error);
    return null;
  }
}

// --- Keyword term extraction ---

const ALIAS_MAP: Record<string, string[]> = {
  creatinina: ["creatinine", "creatinina"],
  creatinine: ["creatinine", "creatinina"],
  ureia: ["urea", "ureia", "BUN"],
  urea: ["urea", "ureia", "BUN"],
  bun: ["BUN", "urea", "ureia"],
  "taxa de filtracao glomerular": ["glomerular filtration", "GFR", "TFG"],
  "taxa de filtra\u00e7\u00e3o glomerular": ["glomerular filtration", "GFR", "TFG"],
  tfg: ["GFR", "glomerular filtration", "TFG"],
  gfr: ["GFR", "glomerular filtration"],
  hemoglobina: ["hemoglobin", "hemoglobina", "Hgb"],
  hemoglobin: ["hemoglobin", "hemoglobina"],
  "hemat\u00f3crito": ["hematocrit", "Hct"],
  ferritina: ["ferritin", "ferritina"],
  ferritin: ["ferritin", "ferritina"],
  ferro: ["iron", "ferro", "serum iron"],
  iron: ["iron", "ferro"],
  glicose: ["glucose", "glicose", "glicemia"],
  glucose: ["glucose", "glicose"],
  glicemia: ["glucose", "glicose", "glicemia"],
  "hemoglobina glicada": ["glycated hemoglobin", "HbA1c"],
  hba1c: ["HbA1c", "glycated hemoglobin"],
  colesterol: ["cholesterol", "colesterol"],
  cholesterol: ["cholesterol", "colesterol"],
  "triglicer\u00eddeos": ["triglycerides", "triglyceride"],
  triglycerides: ["triglycerides"],
  hdl: ["HDL", "HDL cholesterol"],
  ldl: ["LDL", "LDL cholesterol"],
  alt: ["ALT", "alanine aminotransferase", "SGPT", "TGP"],
  tgp: ["ALT", "alanine aminotransferase", "TGP"],
  ast: ["AST", "aspartate aminotransferase", "SGOT", "TGO"],
  tgo: ["AST", "aspartate aminotransferase", "TGO"],
  "fosfatase alcalina": ["alkaline phosphatase", "ALP"],
  ggt: ["GGT", "gamma-glutamyl transferase"],
  bilirrubina: ["bilirubin", "bilirrubina"],
  bilirubin: ["bilirubin", "bilirrubina"],
  tsh: ["TSH", "thyroid stimulating hormone"],
  t4: ["T4", "thyroxine", "tiroxina"],
  t3: ["T3", "triiodothyronine"],
  "prote\u00edna c reativa": ["C-reactive protein", "CRP", "PCR"],
  pcr: ["CRP", "C-reactive protein", "PCR"],
  vhs: ["ESR", "erythrocyte sedimentation", "VHS"],
  "s\u00f3dio": ["sodium", "Na"],
  sodium: ["sodium"],
  "pot\u00e1ssio": ["potassium", "K"],
  potassium: ["potassium"],
  "c\u00e1lcio": ["calcium", "Ca"],
  calcium: ["calcium"],
  "magn\u00e9sio": ["magnesium"],
  inr: ["INR", "prothrombin time", "PT"],
  troponina: ["troponin", "troponina"],
  psa: ["PSA", "prostate specific antigen"],
  "vitamina d": ["vitamin D", "25-hydroxyvitamin"],
  "vitamina b12": ["vitamin B12", "cobalamin"],
  "\u00e1cido f\u00f3lico": ["folic acid", "folate"],
};

function extractSearchTerms(examNames: string[]): string[] {
  const terms = new Set<string>();
  for (const name of examNames) {
    const key = name.toLowerCase().trim();
    terms.add(name);
    const mapped = ALIAS_MAP[key];
    if (mapped) {
      mapped.forEach((t) => terms.add(t));
    } else {
      for (const [aliasKey, aliases] of Object.entries(ALIAS_MAP)) {
        if (key.includes(aliasKey) || aliasKey.includes(key)) {
          aliases.forEach((t) => terms.add(t));
        }
      }
    }
  }
  return Array.from(terms).filter((t) => t.length >= 3);
}

// --- Keyword search ---

async function keywordSearch(terms: string[], topK: number): Promise<KnowledgeChunk[]> {
  if (terms.length === 0) return [];
  const conn = await createRagConnection();
  if (!conn) return [];

  try {
    const capped = terms.slice(0, 15);
    const likeParams = capped.map((t) => `%${t}%`);

    const scoreExpr = capped.map(() => `CASE WHEN chunk_text LIKE ? THEN 1 ELSE 0 END`).join(" + ");
    const whereClause = capped.map(() => `chunk_text LIKE ?`).join(" OR ");

    const sql = `
      SELECT id, source, chunk_index, chunk_text,
             (${scoreExpr}) AS score
      FROM knowledge_base
      WHERE ${whereClause}
      ORDER BY score DESC, id ASC
      LIMIT ${topK * 3}
    `;

    const [rows] = await conn.execute(sql, [...likeParams, ...likeParams]) as [any[], any];

    const seen = new Set<string>();
    const result: KnowledgeChunk[] = [];
    for (const row of rows) {
      const dedupKey = row.chunk_text.substring(0, 80);
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        result.push({
          id: Number(row.id),
          source: row.source as string,
          chunkIndex: Number(row.chunk_index ?? 0),
          chunkText: row.chunk_text as string,
          score: Number(row.score),
        });
      }
      if (result.length >= topK) break;
    }
    return result;
  } catch (error) {
    console.warn("[RAG] Keyword search error:", error);
    return [];
  } finally {
    await conn.end();
  }
}

// --- Main RAG function ---

export async function buildRagContext(
  examNames: string[],
  examValues?: Array<{ name: string; value: string; status?: string }>
): Promise<RagResult> {
  if (examNames.length === 0) return { context: "", chunks: [] };

  const terms = extractSearchTerms(examNames);
  if (terms.length === 0) return { context: "", chunks: [] };

  let chunks: KnowledgeChunk[] = [];
  try {
    chunks = await keywordSearch(terms, TOP_K);
  } catch (err: any) {
    console.warn("[RAG] Search failed:", err.message);
    return { context: "", chunks: [] };
  }

  if (chunks.length === 0) return { context: "", chunks: [] };

  let context = "## Refer\u00eancias de Literatura M\u00e9dica\n\n";
  context += "Os seguintes trechos de livros m\u00e9dicos de refer\u00eancia s\u00e3o relevantes para os exames presentes:\n\n";
  let totalChars = context.length;
  const usedChunks: KnowledgeChunk[] = [];

  for (const chunk of chunks) {
    const chunkText = (chunk.chunkText ?? "").trim();
    if (!chunkText) continue;
    const entry = `**Fonte: ${chunk.source}**\n${chunkText}\n\n---\n\n`;
    if (totalChars + entry.length > MAX_CONTEXT_CHARS) {
      const remaining = MAX_CONTEXT_CHARS - totalChars - chunk.source.length - 20;
      if (remaining > 100) {
        context += `**Fonte: ${chunk.source}**\n${chunkText.substring(0, remaining)}...\n\n`;
        usedChunks.push({ ...chunk, chunkText: chunkText.substring(0, remaining) + "..." });
      }
      break;
    }
    context += entry;
    totalChars += entry.length;
    usedChunks.push(chunk);
  }

  console.log(`[RAG] Retrieved ${usedChunks.length} chunks (${totalChars} chars) for terms: ${terms.slice(0, 5).join(", ")}`);
  return { context, chunks: usedChunks };
}

// --- Feedback ---

export async function saveRagFeedback(
  chunkId: number,
  sessionId: number,
  userId: number,
  vote: "up" | "down"
): Promise<boolean> {
  const conn = await createRagConnection();
  if (!conn) return false;
  try {
    await conn.execute(
      `INSERT INTO rag_feedback (chunk_id, session_id, user_id, vote)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE vote = VALUES(vote)`,
      [chunkId, sessionId, userId, vote]
    );
    return true;
  } catch (error) {
    console.warn("[RAG] Save feedback error:", error);
    return false;
  } finally {
    await conn.end();
  }
}

export async function getRagFeedbackForSession(
  sessionId: number,
  userId: number
): Promise<Record<number, "up" | "down">> {
  const conn = await createRagConnection();
  if (!conn) return {};
  try {
    const [rows] = await conn.execute(
      `SELECT chunk_id, vote FROM rag_feedback WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    ) as [any[], any];
    const result: Record<number, "up" | "down"> = {};
    for (const row of rows) {
      result[Number(row.chunk_id)] = row.vote as "up" | "down";
    }
    return result;
  } catch (error) {
    console.warn("[RAG] Get feedback error:", error);
    return {};
  } finally {
    await conn.end();
  }
}
