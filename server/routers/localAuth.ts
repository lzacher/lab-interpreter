/**
 * localAuth.ts — Router de autenticação JWT local (simplificado)
 * 
 * Single-user: sem registro público.
 * Login é feito via endpoint REST (/api/auth/login) para evitar bug de mutations tRPC no deploy.
 * 
 * Procedures tRPC:
 *   auth.me     — retorna o usuário autenticado ou null (query GET)
 *   auth.logout — limpa o cookie JWT (mutation)
 */
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { publicProcedure, router } from "../_core/trpc";

export const localAuthRouter = router({
  /** Retorna o usuário da sessão atual (null se não autenticado) */
  me: publicProcedure.query(({ ctx }) => ctx.user ?? null),

  /** Logout — limpa o cookie */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),
});
