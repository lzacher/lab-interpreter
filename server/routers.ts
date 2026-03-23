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

// ─── Helpers de parsing do JSON ───────────────────────────────────────────────

function parseLabJson(raw: any) {
  const campos = raw?.campos ?? {};

  const sessionData = {
    patientName: campos.paciente_nome ?? null,
    patientDob: campos.paciente_data_nascimento ?? null,
    patientSex: campos.paciente_sexo ?? null,
    collectionDate: campos.data_realizacao ?? null,
    emissionDate: campos.data_emissao ?? null,
    requestingDoctor: campos.medico_solicitante ?? null,
    responsibleDoctor: campos.medico_responsavel ?? null,
    laboratory: campos.laboratorio_clinica ?? null,
    attendanceNumber: campos.numero_atendimento ?? null,
    material: campos.material ?? null,
    method: campos.metodo ?? null,
    observations: campos.observacoes ?? null,
    rawJson: raw,
  };

  const exams = (campos.exames ?? []).map((e: any) => ({
    name: String(e.nome_exame ?? ""),
    result: String(e.resultado ?? ""),
    unit: String(e.unidade ?? ""),
    referenceRange: String(e.valor_referencia ?? ""),
    status: String(e.status ?? ""),
  }));

  return { sessionData, exams };
}

// ─── Router ───────────────────────────────────────────────────────────────────

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

      const { sessionData, exams } = parseLabJson(payload);

      const sessionId = await createExamSession({
        ...sessionData,
        userId: ctx.user.id,
      });

      await createExams(
        exams.map((e: any) => ({
          sessionId,
          name: e.name,
          result: e.result,
          unit: e.unit,
          referenceRange: e.referenceRange,
          status: e.status,
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

  /** Retorna sessão completa com exames */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId);
      if (!session || session.userId !== ctx.user.id) {
        throw new Error("Sessão não encontrada.");
      }

      const rawExams = await getExamsBySessionId(input.sessionId);

      const processedExams = rawExams.map((e) => ({
        id: e.id,
        sessionId: e.sessionId,
        name: e.name,
        result: e.result ?? "",
        unit: e.unit ?? "",
        referenceRange: e.referenceRange ?? "",
        status: e.status ?? "",
      }));

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
