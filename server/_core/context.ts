/**
 * context.ts — Contexto tRPC
 *
 * Autenticação JWT local (VPS independente).
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

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateLocalJwt(opts.req);
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
