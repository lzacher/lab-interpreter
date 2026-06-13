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
import { storagePut, storageReadBuffer, storageDelete } from "../storage";
import { analyzeDocument, extractTextFromPages } from "../classifier";
import {
  createDocument,
  updateDocumentStatus,
  getDocumentById,
  listDocumentsByUser,
  upsertDocumentPage,
  getPagesByDocument,
  updatePageExtractedText,
  updatePageOcrStatus,
  updatePageClassification,
  createImagingReport,
  clearAllUserHistory,
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
        const buffer = await storageReadBuffer(doc.fileUrl);
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

  // ── Get progress (polling) ──────────────────────────────────────────────────
  getProgress: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const doc = await getDocumentById(input.documentId);
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }
      const pages = await getPagesByDocument(input.documentId);
      const selectedPages = pages.filter((p) => p.selectedForProcessing === 1);
      const total = selectedPages.length;
      const done = selectedPages.filter((p) => p.ocrStatus === "done").length;
      const error = selectedPages.filter((p) => p.ocrStatus === "error").length;
      const processing = selectedPages.filter((p) => p.ocrStatus === "processing").length;

      return {
        documentStatus: doc.status,
        total,
        done,
        error,
        processing,
        pending: total - done - error - processing,
        pages: selectedPages.map((p) => ({
          pageNumber: p.pageNumber,
          ocrStatus: p.ocrStatus ?? "pending",
        })),
      };
    }),

  // ── Process: OCR → JSON estruturado → salvar resultado ─────────────────────
  process: protectedProcedure
    .input(
      z.object({
        documentId: z.number(),
        selectedPageNumbers: z.array(z.number()).min(1),
        // Classificações manuais das páginas enviadas pelo frontend
        // chave = número da página como string, valor = classificação
        pageClassifications: z
          .record(z.string(), z.enum(["laudo", "imagem", "indefinido"]))
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await getDocumentById(input.documentId);
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }

      await updateDocumentStatus(input.documentId, "processing");

      const tmpDir = os.tmpdir();
      // tmpFile usado apenas para documentos de arquivo único (fallback)
      const tmpFile = path.join(tmpDir, `doc-ocr-${input.documentId}-${nanoid()}.${doc.fileType}`);
      const tmpFilesCreated: string[] = [];

      try {
        // Marcar páginas selecionadas como "pending" antes de iniciar o OCR
        const savedPages = await getPagesByDocument(input.documentId);
        for (const pageNum of input.selectedPageNumbers) {
          const dbPage = savedPages.find((p) => p.pageNumber === pageNum);
          if (dbPage) {
            await updatePageOcrStatus(dbPage.id, "pending");
          }
        }

        // ── Verificar se é documento com múltiplos arquivos (sourceFileUrl por página) ──
        const selectedDbPages = savedPages.filter((p) =>
          input.selectedPageNumbers.includes(p.pageNumber)
        );
        const hasMultipleFiles = selectedDbPages.some(
          (p) => p.sourceFileUrl && p.sourceFileUrl !== doc.fileUrl
        );

        let allOcrPages: Array<{ pageNumber: number; text: string }> = [];

        if (hasMultipleFiles) {
          // ── Múltiplos arquivos: agrupar páginas por sourceFileUrl e fazer OCR de cada arquivo ──
          // Mapa: fileUrl → lista de páginas (com pageNumber global)
          const fileGroups = new Map<string, Array<{ pageNumber: number; dbPage: typeof savedPages[0] }>>();
          for (const dbPage of selectedDbPages) {
            const fileUrl = dbPage.sourceFileUrl ?? doc.fileUrl;
            if (!fileGroups.has(fileUrl)) fileGroups.set(fileUrl, []);
            fileGroups.get(fileUrl)!.push({ pageNumber: dbPage.pageNumber, dbPage });
          }

          for (const [fileUrl, pageGroup] of Array.from(fileGroups.entries())) {
            const firstPage = pageGroup[0].dbPage;
            const fileExt = ((firstPage.sourceFileKey ?? doc.fileKey ?? "jpeg") as string).split(".").pop() ?? "jpeg";
            const tmpGroupFile = path.join(tmpDir, `doc-ocr-${input.documentId}-${nanoid()}.${fileExt}`);
            tmpFilesCreated.push(tmpGroupFile);

            const buffer = await storageReadBuffer(fileUrl);
            fs.writeFileSync(tmpGroupFile, buffer);

            // Para imagens JPEG, cada arquivo tem apenas 1 página — mapear pageNumber=1 do OCR para o pageNumber global
            const globalPageNumbers = pageGroup.map((g: { pageNumber: number; dbPage: typeof savedPages[0] }) => g.pageNumber);
            const ocrResult = await extractTextFromPages(
              tmpGroupFile,
              [1], // imagem sempre tem página 1
              async (_pageNum, status) => {
                // Atualizar status de todas as páginas deste arquivo
                for (const g of pageGroup as Array<{ pageNumber: number; dbPage: typeof savedPages[0] }>) {
                  await updatePageOcrStatus(g.dbPage.id, status);
                }
              }
            );

            // Mapear resultado OCR (pageNumber=1) para o pageNumber global
            for (const ocrPage of ocrResult.pages) {
              const globalPageNumber = globalPageNumbers[ocrPage.pageNumber - 1] ?? globalPageNumbers[0];
              allOcrPages.push({ pageNumber: globalPageNumber, text: ocrPage.text });
              const dbPage = (pageGroup as Array<{ pageNumber: number; dbPage: typeof savedPages[0] }>).find((g) => g.pageNumber === globalPageNumber)?.dbPage;
              if (dbPage) await updatePageExtractedText(dbPage.id, ocrPage.text);
            }
          }
        } else {
          // ── Arquivo único: comportamento original ──
          const buffer = await storageReadBuffer(doc.fileUrl);
          fs.writeFileSync(tmpFile, buffer);
          tmpFilesCreated.push(tmpFile);

          const ocrResult = await extractTextFromPages(
            tmpFile,
            input.selectedPageNumbers,
            async (pageNum, status) => {
              const dbPage = savedPages.find((p) => p.pageNumber === pageNum);
              if (dbPage) await updatePageOcrStatus(dbPage.id, status);
            }
          );

          for (const ocrPage of ocrResult.pages) {
            allOcrPages.push({ pageNumber: ocrPage.pageNumber, text: ocrPage.text });
            const dbPage = savedPages.find((p) => p.pageNumber === ocrPage.pageNumber);
            if (dbPage) await updatePageExtractedText(dbPage.id, ocrPage.text);
          }
        }

        // Ordenar páginas OCR por número de página
        allOcrPages.sort((a, b) => a.pageNumber - b.pageNumber);

        // Extrair nome do paciente do nome do arquivo (fallback)
        const fileBaseName = doc.originalName.replace(/\.[^.]+$/, "");

        // ── Separar páginas por tipo (Lab vs Imagem) ──────────────────────────
        // Usar classificações do frontend (prioridade) ou do banco (fallback)
        const getPageType = (pageNum: number): "laudo" | "imagem" | "indefinido" => {
          if (input.pageClassifications) {
            const frontendClass = input.pageClassifications[String(pageNum)];
            if (frontendClass) return frontendClass as "laudo" | "imagem" | "indefinido";
          }
          const dbPage = savedPages.find((p) => p.pageNumber === pageNum);
          return (dbPage?.classification ?? "indefinido") as "laudo" | "imagem" | "indefinido";
        };

        const labPages = allOcrPages.filter((p) => {
          const t = getPageType(p.pageNumber);
          return t === "laudo" || t === "indefinido"; // indefinido vai para lab como fallback
        });
        const imagingPages = allOcrPages.filter((p) => getPageType(p.pageNumber) === "imagem");

        // ── Resultados múltiplos ──────────────────────────────────────────────
        const results: Array<{ type: "lab" | "imaging"; id: number; fileName: string }> = [];

        // Processar grupo Lab
        if (labPages.length > 0) {
          const labText = labPages.map((p) => p.text).join("\n\n");
          const labData = await extractLabJson(labText, fileBaseName);
          const labFileName = generateFileName(labData.paciente_nome || fileBaseName, "lab");

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
          results.push({ type: "lab", id: sessionId, fileName: labFileName });

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
        }

        // Processar grupo Imagem
        if (imagingPages.length > 0) {
          const imagingText = imagingPages.map((p) => p.text).join("\n\n");
          const imagingData = await extractImagingJson(imagingText, fileBaseName);
          const imagingFileName = generateFileName(
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

          results.push({ type: "imaging", id: reportId, fileName: imagingFileName });
        }

        // Fallback: se nenhum grupo foi processado (ex: todas indefinido sem páginas lab)
        if (results.length === 0) {
          const fullText = allOcrPages.map((p) => p.text).join("\n\n");
          const labData = await extractLabJson(fullText, fileBaseName);
          const labFileName = generateFileName(labData.paciente_nome || fileBaseName, "lab");
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
          results.push({ type: "lab", id: sessionId, fileName: labFileName });
          if (labData.exames && labData.exames.length > 0) {
            const db2 = await getDb();
            if (db2) {
              for (const exam of labData.exames) {
                await db2.insert(exams).values({
                  sessionId,
                  name: exam.nome,
                  result: exam.resultado,
                  unit: exam.unidade,
                  referenceRange: exam.valor_referencia,
                  status: exam.status,
                });
              }
            }
          }
        }

        await updateDocumentStatus(input.documentId, "done");

        // ── Limpeza automática: deletar arquivos de upload após processamento ──
        // Os dados estruturados já foram salvos no banco; os arquivos físicos
        // não precisam mais ser armazenados por questões de privacidade.
        setImmediate(async () => {
          try {
            // Deletar arquivo principal do documento
            if (doc.fileKey) {
              await storageDelete(doc.fileKey);
            }
            // Deletar thumbnails de todas as páginas
            const allPages = await getPagesByDocument(input.documentId);
            for (const page of allPages) {
              if (page.thumbnailKey) {
                await storageDelete(page.thumbnailKey);
              }
              if (page.sourceFileKey && page.sourceFileKey !== doc.fileKey) {
                await storageDelete(page.sourceFileKey);
              }
            }
          } catch { /* falha silenciosa — não impacta o resultado */ }
        });

        // Compatibilidade retroativa: manter resultType/resultId para o primeiro resultado
        const primaryResult = results[0];
        return {
          resultType: primaryResult.type,
          resultId: primaryResult.id,
          fileName: primaryResult.fileName,
          pagesProcessed: allOcrPages.length,
          results, // novo campo com todos os resultados
        };
      } catch (err: any) {
        await updateDocumentStatus(input.documentId, "error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message ?? "Erro ao processar páginas.",
        });
      } finally {
        // Limpar todos os arquivos temporários criados
        for (const f of tmpFilesCreated) {
          try { fs.unlinkSync(f); } catch {}
        }
        // Limpar tmpFile original se não foi adicionado à lista
        if (!tmpFilesCreated.includes(tmpFile)) {
          try { fs.unlinkSync(tmpFile); } catch {}
        }
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

    // ── List documents ────────────────────────────────────────────────────────
  listDocuments: protectedProcedure.query(async ({ ctx }) => {
    return listDocumentsByUser(ctx.user.id);
  }),


  // ── Upload múltiplo: vários arquivos → um documento composto ──────────────
  uploadMultiple: protectedProcedure
    .input(
      z.object({
        files: z
          .array(
            z.object({
              fileName: z.string(),
              fileType: z.string(),
              fileBase64: z.string(),
            })
          )
          .min(1)
          .max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const allowedTypes = ["pdf", "jpg", "jpeg"];
      for (const file of input.files) {
        const ext = file.fileType.toLowerCase().replace(".", "");
        if (!allowedTypes.includes(ext)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Tipo não suportado: ${file.fileName}. Use PDF, JPG ou JPEG.`,
          });
        }
      }
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };
      const uploadedFiles: Array<{ fileName: string; fileType: string; fileKey: string; fileUrl: string }> = [];
      for (const file of input.files) {
        const ext = file.fileType.toLowerCase().replace(".", "");
        const buffer = Buffer.from(file.fileBase64, "base64");
        const fileKey = `medsuite/${ctx.user.id}/${nanoid()}-${file.fileName}`;
        const { url } = await storagePut(fileKey, buffer, mimeMap[ext] ?? "application/octet-stream");
        uploadedFiles.push({ fileName: file.fileName, fileType: ext, fileKey, fileUrl: url });
      }
      const primary = uploadedFiles[0];
      const composedName =
        input.files.length > 1
          ? `${primary.fileName} (+${input.files.length - 1} arquivo${input.files.length > 2 ? "s" : ""})`
          : primary.fileName;
      const docId = await createDocument({
        userId: ctx.user.id,
        originalName: composedName,
        fileType: primary.fileType,
        fileKey: primary.fileKey,
        fileUrl: primary.fileUrl,
      });
      return {
        documentId: docId,
        fileUrl: primary.fileUrl,
        fileCount: uploadedFiles.length,
        uploadedFiles,
      };
    }),

  // ── Analyze múltiplo: classifica páginas de todos os arquivos do documento ──
  analyzeMultiple: protectedProcedure
    .input(
      z.object({
        documentId: z.number(),
        uploadedFiles: z.array(
          z.object({
            fileName: z.string(),
            fileUrl: z.string(),
            fileKey: z.string(),
            fileType: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await getDocumentById(input.documentId);
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }
      await updateDocumentStatus(input.documentId, "analyzing");
      const tmpDir = os.tmpdir();
      let globalPageNumber = 0;
      let totalPages = 0;
      try {
        for (let fileIndex = 0; fileIndex < input.uploadedFiles.length; fileIndex++) {
          const uf = input.uploadedFiles[fileIndex];
          const tmpFile = path.join(
            tmpDir,
            `doc-multi-${input.documentId}-${fileIndex}-${nanoid()}.${uf.fileType}`
          );
          try {
            const buffer = await storageReadBuffer(uf.fileUrl);
            fs.writeFileSync(tmpFile, buffer);
            const result = await analyzeDocument(tmpFile);
            for (const page of result.pages) {
              globalPageNumber++;
              const thumbBuffer = Buffer.from(page.thumbnailBase64, "base64");
              const thumbKey = `medsuite/thumbnails/${ctx.user.id}/${input.documentId}/page-${globalPageNumber}.jpg`;
              const { url: thumbUrl } = await storagePut(thumbKey, thumbBuffer, "image/jpeg");
              await upsertDocumentPage({
                documentId: input.documentId,
                pageNumber: globalPageNumber,
                thumbnailKey: thumbKey,
                thumbnailUrl: thumbUrl,
                classification: page.classification,
                classificationScore: page.score,
                sourceFileUrl: uf.fileUrl,
                sourceFileKey: uf.fileKey,
                sourceFileIndex: fileIndex,
              });
            }
            totalPages += result.totalPages;
          } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        }
        await updateDocumentStatus(input.documentId, "analyzed", totalPages);
        const savedPages = await getPagesByDocument(input.documentId);
        return { totalPages, pages: savedPages };
      } catch (err: any) {
        await updateDocumentStatus(input.documentId, "error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message ?? "Erro ao analisar documentos.",
        });
      }
    }),

  // ── Clear all history ──────────────────────────────────────────────────────
  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await clearAllUserHistory(ctx.user.id);
    return result;
  }),
});
