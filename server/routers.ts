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
import { documentsRouter } from "./routers/documents";
import { imagingRouter } from "./routers/imaging";
import { localAuthRouter } from "./routers/localAuth";

// ─── Helpers de parsing do JSON de laboratório ────────────────────────────────

function parseLabJson(raw: any) {
  // Suporte a dois formatos: {campos: {exames: [...]}} e {exames: [...]}
  const campos = raw?.campos ?? raw ?? {};

  const sessionData = {
    patientName: campos.paciente_nome ?? campos.campos?.paciente_nome ?? null,
    patientDob: campos.paciente_data_nascimento ?? campos.campos?.paciente_data_nascimento ?? null,
    patientSex: campos.paciente_sexo ?? campos.campos?.paciente_sexo ?? null,
    collectionDate: campos.data_coleta ?? campos.data_realizacao ?? campos.campos?.data_realizacao ?? null,
    emissionDate: campos.data_emissao ?? campos.campos?.data_emissao ?? null,
    requestingDoctor: campos.medico_solicitante ?? campos.campos?.medico_solicitante ?? null,
    responsibleDoctor: campos.medico_responsavel ?? campos.campos?.medico_responsavel ?? null,
    laboratory: campos.laboratorio ?? campos.laboratorio_clinica ?? campos.campos?.laboratorio_clinica ?? null,
    attendanceNumber: campos.numero_atendimento ?? campos.campos?.numero_atendimento ?? null,
    material: campos.material ?? campos.campos?.material ?? null,
    method: campos.metodo ?? campos.campos?.metodo ?? null,
    observations: campos.observacoes ?? campos.campos?.observacoes ?? null,
    rawJson: raw,
  };

  const examList = campos.exames ?? campos.campos?.exames ?? [];
  const examsParsed = examList.map((e: any) => ({
    name: String(e.nome ?? e.nome_exame ?? ""),
    result: String(e.resultado ?? ""),
    unit: String(e.unidade ?? e.unidade_valor ?? ""),
    referenceRange: String(e.valor_referencia ?? ""),
    status: String(e.status ?? ""),
  }));

  return { sessionData, exams: examsParsed };
}

// ─── Lab Router ───────────────────────────────────────────────────────────────

const labRouter = router({
  /** Upload de JSON de exames (legado + novo formato) */
  upload: protectedProcedure
    .input(z.object({ jsonContent: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let payload: any;
      try {
        payload = JSON.parse(input.jsonContent);
      } catch {
        throw new Error("JSON inválido. Verifique o arquivo e tente novamente.");
      }

      const hasExams =
        payload?.campos?.exames ||
        payload?.exames;

      if (!hasExams) {
        throw new Error(
          "Estrutura do JSON inválida. O arquivo deve conter resultados de exames laboratoriais."
        );
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

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId);
      if (!session || session.userId !== ctx.user.id) {
        throw new Error("Sessão não encontrada.");
      }

      const rawExams = await getExamsBySessionId(input.sessionId);

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
        exams: rawExams.map((e) => ({
          id: e.id,
          sessionId: e.sessionId,
          name: e.name,
          result: e.result ?? "",
          unit: e.unit ?? "",
          referenceRange: e.referenceRange ?? "",
          status: e.status ?? "",
        })),
      };
    }),

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

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: localAuthRouter,
  lab: labRouter,
  documents: documentsRouter,
  imaging: imagingRouter,
});

export type AppRouter = typeof appRouter;
