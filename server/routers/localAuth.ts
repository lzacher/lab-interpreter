/**
 * localAuth.ts — Router de autenticação JWT local
 * Substitui o Manus OAuth para deploy independente na VPS.
 *
 * Procedures:
 *   auth.login    — email + senha → define cookie JWT
 *   auth.register — email + senha + nome → cria usuário + define cookie JWT
 *   auth.logout   — limpa o cookie JWT
 *   auth.me       — retorna o usuário autenticado ou null
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { comparePassword, hashPassword, signToken } from "../_core/localAuth";
import { getSessionCookieOptions } from "../_core/cookies";
import { publicProcedure, router } from "../_core/trpc";

export const localAuthRouter = router({
  /** Retorna o usuário da sessão atual (null se não autenticado) */
  me: publicProcedure.query(({ ctx }) => ctx.user ?? null),

  /** Login com email e senha */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email("E-mail inválido"),
        password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user || !user.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "E-mail ou senha incorretos",
        });
      }
      const valid = await comparePassword(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "E-mail ou senha incorretos",
        });
      }
      // Atualizar lastSignedIn
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });
      const token = signToken({
        userId: user.id,
        email: user.email ?? input.email,
        role: user.role,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    }),

  /** Registro de novo usuário */
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
        email: z.string().email("E-mail inválido"),
        password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verificar se e-mail já existe
      const existing = await db.getUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Este e-mail já está cadastrado",
        });
      }
      const passwordHash = await hashPassword(input.password);
      const userId = await db.createLocalUser({
        email: input.email,
        name: input.name,
        passwordHash,
        role: "user",
      });
      const token = signToken({
        userId,
        email: input.email,
        role: "user",
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      return { id: userId, name: input.name, email: input.email, role: "user" };
    }),

  /** Logout — limpa o cookie */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),
});
