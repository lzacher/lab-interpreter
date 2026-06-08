/**
 * context.ts — Contexto tRPC
 *
 * Suporta dois modos de autenticação:
 *   1. JWT local (AUTH_MODE=local ou OAUTH_SERVER_URL não configurado) — VPS independente
 *   2. Manus OAuth (padrão quando rodando na plataforma Manus)
 */
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { verifyToken } from "./localAuth";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

async function authenticateLocalJwt(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await db.getUserByOpenId(`local:${payload.email}`);
  return user ?? null;
}

async function authenticateManus(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  try {
    const { sdk } = await import("./sdk");
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Modo local: JWT próprio (VPS sem Manus)
  const isLocalMode =
    process.env.AUTH_MODE === "local" || !process.env.OAUTH_SERVER_URL;

  try {
    if (isLocalMode) {
      user = await authenticateLocalJwt(opts.req);
    } else {
      // Plataforma Manus: OAuth primeiro, fallback para JWT local
      user = await authenticateManus(opts.req);
      if (!user) {
        user = await authenticateLocalJwt(opts.req);
      }
    }
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
