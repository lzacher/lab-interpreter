import { eq, desc, and } from "drizzle-orm";
import { storageDelete } from "./storage";
import { getDb } from "./db";
import {
  documents,
  documentPages,
  imagingReports,
  examSessions,
  exams,
  InsertDocument,
  InsertDocumentPage,
  InsertImagingReport,
} from "../drizzle/schema";

// ─── Documents ────────────────────────────────────────────────────────────────

export async function createDocument(data: InsertDocument): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values(data);
  return (result[0] as any).insertId as number;
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return rows[0];
}

export async function updateDocumentStatus(
  id: number,
  status: "uploaded" | "analyzing" | "analyzed" | "processing" | "done" | "error",
  totalPages?: number
) {
  const db = await getDb();
  if (!db) return;
  const update: Record<string, unknown> = { status };
  if (totalPages !== undefined) update.totalPages = totalPages;
  await db.update(documents).set(update).where(eq(documents.id, id));
}

export async function listDocumentsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

// ─── Document Pages ───────────────────────────────────────────────────────────

export async function upsertDocumentPage(data: InsertDocumentPage) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(documentPages)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        thumbnailKey: data.thumbnailKey,
        thumbnailUrl: data.thumbnailUrl,
        classification: data.classification,
        classificationScore: data.classificationScore,
      },
    });
}

export async function getPagesByDocument(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documentPages)
    .where(eq(documentPages.documentId, documentId))
    .orderBy(documentPages.pageNumber);
}

export async function updatePageExtractedText(pageId: number, text: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(documentPages)
    .set({ extractedText: text, selectedForProcessing: 1, ocrStatus: "done" })
    .where(eq(documentPages.id, pageId));
}

export async function updatePageOcrStatus(
  pageId: number,
  status: "pending" | "processing" | "done" | "error"
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(documentPages)
    .set({ ocrStatus: status })
    .where(eq(documentPages.id, pageId));
}

export async function updatePageClassification(
  pageId: number,
  classification: "laudo" | "imagem" | "indefinido"
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(documentPages)
    .set({ classification })
    .where(eq(documentPages.id, pageId));
}

// ─── Imaging Reports ──────────────────────────────────────────────────────────

export async function createImagingReport(data: InsertImagingReport): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(imagingReports).values(data);
  return (result[0] as any).insertId as number;
}

export async function getImagingReportById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(imagingReports)
    .where(eq(imagingReports.id, id))
    .limit(1);
  return rows[0];
}

export async function listImagingReportsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(imagingReports)
    .where(eq(imagingReports.userId, userId))
    .orderBy(desc(imagingReports.createdAt));
}

export async function deleteImagingReport(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(imagingReports)
    .where(and(eq(imagingReports.id, id), eq(imagingReports.userId, userId)));
}

// ─── Clear all history for a user ─────────────────────────────────────────────
export async function clearAllUserHistory(userId: number) {
  const db = await getDb();
  if (!db) return { deletedDocuments: 0, deletedSessions: 0, deletedReports: 0, total: 0 };

  // 1. Buscar todos os documentos do usuário com URLs para deletar arquivos físicos
  const userDocs = await db
    .select({ id: documents.id, fileUrl: documents.fileUrl, thumbnailUrl: documents.thumbnailUrl })
    .from(documents)
    .where(eq(documents.userId, userId));
  const docIds = userDocs.map((d) => d.id);

  if (docIds.length > 0) {
    // 2. Deletar arquivos físicos dos documentos
    for (const doc of userDocs) {
      if (doc.fileUrl) await storageDelete(doc.fileUrl);
      if (doc.thumbnailUrl) await storageDelete(doc.thumbnailUrl);
    }
    // 3. Deletar thumbnails das páginas
    for (const docId of docIds) {
      const pages = await db.select({ thumbnailUrl: documentPages.thumbnailUrl }).from(documentPages).where(eq(documentPages.documentId, docId));
      for (const page of pages) {
        if (page.thumbnailUrl) await storageDelete(page.thumbnailUrl);
      }
      await db.delete(documentPages).where(eq(documentPages.documentId, docId));
    }
    // 4. Deletar os documentos do banco
    await db.delete(documents).where(eq(documents.userId, userId));
  }

  // 4. Buscar todas as sessões de exames de laboratório do usuário
  const userSessions = await db
    .select({ id: examSessions.id })
    .from(examSessions)
    .where(eq(examSessions.userId, userId));
  const sessionIds = userSessions.map((s) => s.id);

  if (sessionIds.length > 0) {
    // 5. Deletar exames individuais de cada sessão
    for (const sessionId of sessionIds) {
      await db.delete(exams).where(eq(exams.sessionId, sessionId));
    }
    // 6. Deletar as sessões de exames
    await db.delete(examSessions).where(eq(examSessions.userId, userId));
  }

  // 7. Buscar e deletar laudos de imagem do usuário
  const userReports = await db
    .select({ id: imagingReports.id })
    .from(imagingReports)
    .where(eq(imagingReports.userId, userId));
  await db.delete(imagingReports).where(eq(imagingReports.userId, userId));

  const total = docIds.length + sessionIds.length + userReports.length;
  return {
    deletedDocuments: docIds.length,
    deletedSessions: sessionIds.length,
    deletedReports: userReports.length,
    total,
  };
}
