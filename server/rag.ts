/**
 * RAG (Retrieval-Augmented Generation) module for MedSuite.
 *
 * Uses a local Python embedding microservice to generate query embeddings,
 * then performs vector similarity search in TiDB to retrieve relevant
 * chunks from medical reference books.
 *
 * Architecture:
 *   Node.js server → Python embedding service (port 5001) → TiDB vector search
 */
import mysql2 from "mysql2/promise";

const EMBEDDING_SERVICE_URL =
  process.env.EMBEDDING_SERVICE_URL || "http://127.0.0.1:5001";
const TOP_K = 5; // Number of chunks to retrieve
const MAX_CONTEXT_CHARS = 4000; // Max chars for RAG context in prompt

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KnowledgeChunk {
  id: number;
  source: string;
  chunkIndex: number;
  chunkText: string;
  distance?: number;
}

export interface RagResult {
  /** Formatted context string to inject into the LLM prompt */
  context: string;
  /** Chunks actually used (with id, source, text) for UI display */
  chunks: KnowledgeChunk[];
}

// ─── DB connection ───────────────────────────────────────────────────────────

/**
 * Create a short-lived mysql2 connection for RAG queries.
 * Uses a separate connection (not the drizzle pool) to avoid lifecycle issues.
 */
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

// ─── Embedding generation ────────────────────────────────────────────────────

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Embedding service error: ${response.status}`);
    }

    const data = (await response.json()) as {
      embeddings: number[][];
      dim: number;
    };
    return data.embeddings;
  } catch (error) {
    console.warn("[RAG] Embedding service unavailable:", error);
    return [];
  }
}

// ─── Vector search ───────────────────────────────────────────────────────────

async function vectorSearch(
  embedding: number[],
  topK: number = TOP_K
): Promise<KnowledgeChunk[]> {
  const conn = await createRagConnection();
  if (!conn) return [];

  try {
    const embStr = "[" + embedding.map((v) => v.toFixed(6)).join(",") + "]";

    const [rows] = await conn.execute(
      `SELECT id, source, chunk_index, chunk_text,
              VEC_COSINE_DISTANCE(embedding, ?) as dist
       FROM knowledge_base
       ORDER BY dist ASC
       LIMIT ${topK}`,
      [embStr]
    );

    return (rows as any[]).map((row: any) => ({
      id: Number(row.id),
      source: row.source as string,
      chunkIndex: row.chunk_index as number,
      chunkText: (row.chunk_text as string) ?? "",
      distance: row.dist as number,
    }));
  } catch (error) {
    console.warn("[RAG] Vector search error:", error);
    return [];
  } finally {
    await conn.end();
  }
}

// ─── Main RAG function ───────────────────────────────────────────────────────

/**
 * Build a RAG context string and return the chunks used.
 *
 * @param examNames - List of exam names from the lab results
 * @param examValues - Optional list of exam values with status
 * @returns { context, chunks } — context for LLM, chunks for UI display
 */
export async function buildRagContext(
  examNames: string[],
  examValues?: Array<{ name: string; value: string; status?: string }>
): Promise<RagResult> {
  if (examNames.length === 0) {
    return { context: "", chunks: [] };
  }

  const abnormalExams = examValues?.filter(
    (e) => e.status === "high" || e.status === "low" || e.status === "critical"
  );

  const queryParts = [
    ...examNames.slice(0, 10),
    ...(abnormalExams?.map((e) => `${e.name} ${e.status}`) || []),
    "interpretation clinical significance reference values",
  ];

  const query = queryParts.join(" ");

  const embeddings = await generateEmbeddings([query]);
  if (embeddings.length === 0) {
    console.warn("[RAG] No embeddings generated, skipping RAG context");
    return { context: "", chunks: [] };
  }

  const chunks = await vectorSearch(embeddings[0], TOP_K);
  if (chunks.length === 0) {
    return { context: "", chunks: [] };
  }

  // Format context for the prompt
  let context = "## Referências de Literatura Médica\n\n";
  context +=
    "Os seguintes trechos de livros médicos de referência são relevantes para os exames presentes:\n\n";

  let totalChars = context.length;
  const usedChunks: KnowledgeChunk[] = [];

  for (const chunk of chunks) {
    const chunkText = (chunk.chunkText ?? "").trim();
    if (!chunkText) continue;

    const chunkHeader = `**Fonte: ${chunk.source}**\n`;
    const chunkContent = `${chunkText}\n\n---\n\n`;
    const chunkTotal = chunkHeader.length + chunkContent.length;

    if (totalChars + chunkTotal > MAX_CONTEXT_CHARS) {
      const remaining =
        MAX_CONTEXT_CHARS - totalChars - chunkHeader.length - 10;
      if (remaining > 100) {
        context +=
          chunkHeader + chunkText.substring(0, remaining) + "...\n\n";
        usedChunks.push({ ...chunk, chunkText: chunkText.substring(0, remaining) + "..." });
      }
      break;
    }

    context += chunkHeader + chunkContent;
    totalChars += chunkTotal;
    usedChunks.push(chunk);
  }

  console.log(
    `[RAG] Retrieved ${usedChunks.length} chunks (${totalChars} chars) for query: "${query.substring(0, 60)}..."`
  );

  return { context, chunks: usedChunks };
}

// ─── Feedback ────────────────────────────────────────────────────────────────

/**
 * Save or update a user's vote on a RAG chunk.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE to handle re-votes.
 */
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

/**
 * Get all feedback votes for a given session and user.
 * Returns a map of chunkId → vote.
 */
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
    );

    const result: Record<number, "up" | "down"> = {};
    for (const row of rows as any[]) {
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

/**
 * Check if the embedding service is available.
 */
export async function isEmbeddingServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${EMBEDDING_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
