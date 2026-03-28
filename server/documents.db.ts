import { eq, desc, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  documents,
  documentPages,
  imagingReports,
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
