/**
 * MedSuite — Documents Router
 * Upload → Análise (thumbnails + classificação) → OCR → JSON estruturado → roteamento
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { analyzeDocument, extractTextFromPages } from "../classifier";
import {
  createDocument,
  updateDocumentStatus,
  getDocumentById,
  listDocumentsByUser,
  upsertDocumentPage,
  getPagesByDocument,
  updatePageExtractedText,
  updatePageClassification,
  createImagingReport,
} from "../documents.db";
import { getDb } from "../db";
import { examSessions, exams } from "../../drizzle/schema";
import {
  extractLabJson,
  extractImagingJson,
  detectDocumentType,
  generateFileName,
} from "../jsonExtractor";

function nanoid(len = 10) {
  return Math.random().toString(36).substring(2, 2 + len);
}

export const documentsRouter = router({
  // ── Upload ──────────────────────────────────────────────────────────────────
  upload: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileType: z.string(),
        fileBase64: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const allowedTypes = ["pdf", "jpg", "jpeg"];
      const ext = input.fileType.toLowerCase().replace(".", "");
      if (!allowedTypes.includes(ext)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tipo de arquivo não suportado. Use PDF, JPG ou JPEG.",
        });
      }

      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `medsuite/${ctx.user.id}/${nanoid()}-${input.fileName}`;
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };

      const { url } = await storagePut(fileKey, buffer, mimeMap[ext] ?? "application/octet-stream");

      const docId = await createDocument({
        userId: ctx.user.id,
        originalName: input.fileName,
        fileType: ext,
        fileKey,
        fileUrl: url,
      });

      return { documentId: docId, fileUrl: url };
    }),

  // ── Analyze (thumbnails + classificação por LLM) ────────────────────────────
  analyze: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await getDocumentById(input.documentId);
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }

      await updateDocumentStatus(input.documentId, "analyzing");

      const tmpDir = os.tmpdir();
      const tmpFile = path.join(tmpDir, `doc-${input.documentId}-${nanoid()}.${doc.fileType}`);

      try {
        const res = await fetch(doc.fileUrl);
        if (!res.ok) throw new Error("Falha ao baixar arquivo do armazenamento.");
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(tmpFile, buffer);

        const result = await analyzeDocument(tmpFile);

        for (const page of result.pages) {
          const thumbBuffer = Buffer.from(page.thumbnailBase64, "base64");
          const thumbKey = `medsuite/thumbnails/${ctx.user.id}/${input.documentId}/page-${page.pageNumber}.jpg`;
          const { url: thumbUrl } = await storagePut(thumbKey, thumbBuffer, "image/jpeg");

          await upsertDocumentPage({
            documentId: input.documentId,
            pageNumber: page.pageNumber,
            thumbnailKey: thumbKey,
            thumbnailUrl: thumbUrl,
            classification: page.classification,
            classificationScore: page.score,
          });
        }

        await updateDocumentStatus(input.documentId, "analyzed", result.totalPages);
        const savedPages = await getPagesByDocument(input.documentId);
        return { totalPages: result.totalPages, pages: savedPages };
      } catch (err: any) {
        await updateDocumentStatus(input.documentId, "error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message ?? "Erro ao analisar documento.",
        });
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    }),

  // ── Update page classification (manual override) ────────────────────────────
  updatePageClassification: protectedProcedure
    .input(
      z.object({
        pageId: z.number(),
        classification: z.enum(["laudo", "imagem", "indefinido"]),
      })
    )
    .mutation(async ({ input }) => {
      await updatePageClassification(input.pageId, input.classification);
      return { success: true };
    }),

  // ── Process: OCR → JSON estruturado → salvar resultado ─────────────────────
  process: protectedProcedure
    .input(
      z.object({
        documentId: z.number(),
        selectedPageNumbers: z.array(z.number()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await getDocumentById(input.documentId);
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }

      await updateDocumentStatus(input.documentId, "processing");

      const tmpDir = os.tmpdir();
      const tmpFile = path.join(tmpDir, `doc-ocr-${input.documentId}-${nanoid()}.${doc.fileType}`);

      try {
        const res = await fetch(doc.fileUrl);
        if (!res.ok) throw new Error("Falha ao baixar arquivo.");
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(tmpFile, buffer);

        // OCR das páginas selecionadas
        const ocrResult = await extractTextFromPages(tmpFile, input.selectedPageNumbers);

        // Salvar texto extraído por página
        const savedPages = await getPagesByDocument(input.documentId);
        for (const ocrPage of ocrResult.pages) {
          const dbPage = savedPages.find((p) => p.pageNumber === ocrPage.pageNumber);
          if (dbPage) {
            await updatePageExtractedText(dbPage.id, ocrPage.text);
          }
        }

        // Concatenar todo o texto extraído
        const fullText = ocrResult.pages.map((p) => p.text).join("\n\n");

        // Detectar tipo predominante das páginas selecionadas
        const selectedPages = savedPages.filter((p) =>
          input.selectedPageNumbers.includes(p.pageNumber)
        );
        const classifications = selectedPages.map(
          (p) => (p.classification ?? "indefinido") as "laudo" | "imagem" | "indefinido"
        );
        const docType = detectDocumentType(classifications);

        // Extrair nome do paciente do nome do arquivo (fallback)
        const fileBaseName = doc.originalName.replace(/\.[^.]+$/, "");

        let resultId: number;
        let resultType: "lab" | "imaging";
        let fileName: string;

        if (docType === "lab") {
          // Extrair JSON de laboratório
          const labData = await extractLabJson(fullText, fileBaseName);
          fileName = generateFileName(labData.paciente_nome || fileBaseName, "lab");

          // Salvar no banco como exam_session + exams
          const db = await getDb();
          if (!db) throw new Error("Database not available");

          const sessionResult = await db.insert(examSessions).values({
            userId: ctx.user.id,
            documentId: input.documentId,
            patientName: labData.paciente_nome,
            patientDob: labData.paciente_data_nascimento,
            patientSex: labData.paciente_sexo,
            collectionDate: labData.data_coleta,
            emissionDate: labData.data_emissao,
            requestingDoctor: labData.medico_solicitante,
            responsibleDoctor: labData.medico_responsavel,
            laboratory: labData.laboratorio,
            attendanceNumber: labData.numero_atendimento,
            material: labData.material,
            method: labData.metodo,
            observations: labData.observacoes,
            rawJson: labData as any,
          });

          const sessionId = (sessionResult[0] as any).insertId as number;
          resultId = sessionId;
          resultType = "lab";

          // Inserir exames individuais
          if (labData.exames && labData.exames.length > 0) {
            for (const exam of labData.exames) {
              await db.insert(exams).values({
                sessionId,
                name: exam.nome,
                result: exam.resultado,
                unit: exam.unidade,
                referenceRange: exam.valor_referencia,
                status: exam.status,
              });
            }
          }
        } else {
          // Extrair JSON de imagem
          const imagingData = await extractImagingJson(fullText, fileBaseName);
          fileName = generateFileName(
            imagingData.paciente_nome || fileBaseName,
            "imaging",
            imagingData.tipo_exame
          );

          const reportId = await createImagingReport({
            userId: ctx.user.id,
            documentId: input.documentId,
            patientName: imagingData.paciente_nome,
            patientDob: imagingData.paciente_data_nascimento,
            examDate: imagingData.data_exame,
            examType: imagingData.tipo_exame,
            requestingDoctor: imagingData.medico_solicitante,
            responsibleDoctor: imagingData.medico_responsavel,
            technique: imagingData.tecnica,
            description: imagingData.descricao,
            conclusion: imagingData.conclusao,
            observations: imagingData.observacoes,
            rawJson: imagingData as any,
          });

          resultId = reportId;
          resultType = "imaging";
        }

        await updateDocumentStatus(input.documentId, "done");

        return {
          resultType,
          resultId,
          fileName,
          pagesProcessed: ocrResult.pages.length,
        };
      } catch (err: any) {
        await updateDocumentStatus(input.documentId, "error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message ?? "Erro ao processar páginas.",
        });
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    }),

  // ── Get document with pages ─────────────────────────────────────────────────
  getDocument: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const doc = await getDocumentById(input.documentId);
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }
      const pages = await getPagesByDocument(input.documentId);
      return { document: doc, pages };
    }),

  // ── List documents ──────────────────────────────────────────────────────────
  listDocuments: protectedProcedure.query(async ({ ctx }) => {
    return listDocumentsByUser(ctx.user.id);
  }),
});
