import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getImagingReportById,
  listImagingReportsByUser,
  deleteImagingReport,
} from "../documents.db";

export const imagingRouter = router({
  getReport: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .query(async ({ ctx, input }) => {
      const report = await getImagingReportById(input.reportId);
      if (!report || report.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Laudo não encontrado." });
      }
      return report;
    }),

  listReports: protectedProcedure.query(async ({ ctx }) => {
    return listImagingReportsByUser(ctx.user.id);
  }),

  deleteReport: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const report = await getImagingReportById(input.reportId);
      if (!report || report.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Laudo não encontrado." });
      }
      await deleteImagingReport(input.reportId, ctx.user.id);
      return { success: true };
    }),
});
