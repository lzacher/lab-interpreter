import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createExamSession,
  createExams,
  deleteSession,
  getExamsBySessionId,
  getSessionById,
  getSessionsByUserId,
} from "./db";
import { processLabJson, classifyExam, parseNumericResult, parseReferenceRange, getClinicalInterpretation } from "./labProcessor";
import type { ProcessedExam, ExamClassification } from "../shared/labTypes";

const labRouter = router({
  /** Faz upload de um JSON de exames, persiste e retorna o ID da sessão */
  upload: protectedProcedure
    .input(z.object({ jsonContent: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let payload: any;
      try {
        payload = JSON.parse(input.jsonContent);
      } catch {
        throw new Error("JSON inválido. Verifique o arquivo e tente novamente.");
      }

      if (!payload?.campos?.exames) {
        throw new Error("Estrutura do JSON inválida. O arquivo deve conter 'campos.exames'.");
      }

      const { sessionData, processedExams } = processLabJson(payload);

      const sessionId = await createExamSession({
        ...sessionData,
        userId: ctx.user.id,
      });

      await createExams(
        processedExams.map((e) => ({
          sessionId,
          name: e.name,
          result: e.result,
          unit: e.unit,
          referenceRange: e.referenceRange,
          status: e.status,
          interpretation: e.interpretation,
        }))
      );

      return { sessionId };
    }),

  /** Lista todas as sessões do usuário autenticado */
  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await getSessionsByUserId(ctx.user.id);
    return sessions.map((s) => ({
      id: s.id,
      patientName: s.patientName,
      patientSex: s.patientSex,
      collectionDate: s.collectionDate,
      laboratory: s.laboratory,
      createdAt: s.createdAt,
    }));
  }),

  /** Retorna sessão completa com exames processados */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId);
      if (!session || session.userId !== ctx.user.id) {
        throw new Error("Sessão não encontrada.");
      }

      const rawExams = await getExamsBySessionId(input.sessionId);

      const processedExams: ProcessedExam[] = rawExams.map((e) => {
        const numericResult = parseNumericResult(e.result ?? "");
        const { min: refMin, max: refMax } = parseReferenceRange(e.referenceRange ?? "");
        const classification = classifyExam(e.status ?? "", numericResult, refMin, refMax);

        return {
          id: e.id,
          sessionId: e.sessionId,
          name: e.name,
          result: e.result ?? "",
          unit: e.unit ?? "",
          referenceRange: e.referenceRange ?? "",
          status: e.status ?? "",
          classification,
          numericResult,
          refMin,
          refMax,
          interpretation: e.interpretation,
        };
      });

      return {
        id: session.id,
        patientName: session.patientName,
        patientDob: session.patientDob,
        patientSex: session.patientSex,
        collectionDate: session.collectionDate,
        emissionDate: session.emissionDate,
        requestingDoctor: session.requestingDoctor,
        responsibleDoctor: session.responsibleDoctor,
        laboratory: session.laboratory,
        attendanceNumber: session.attendanceNumber,
        material: session.material,
        method: session.method,
        observations: session.observations,
        createdAt: session.createdAt,
        exams: processedExams,
      };
    }),

  /** Remove uma sessão e seus exames */
  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId);
      if (!session || session.userId !== ctx.user.id) {
        throw new Error("Sessão não encontrada.");
      }
      await deleteSession(input.sessionId, ctx.user.id);
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  lab: labRouter,
});

export type AppRouter = typeof appRouter;
