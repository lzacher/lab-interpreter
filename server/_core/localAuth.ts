/**
 * localAuth.ts
 * Autenticação JWT local — substitui o Manus OAuth.
 * Usado quando AUTH_MODE=local (deploy na VPS sem dependências Manus).
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "./env";

const SALT_ROUNDS = 12;

export interface JwtPayload {
  userId: number;
  email: string;
  role: "user" | "admin";
  iat?: number;
  exp?: number;
}

/** Gera hash seguro de senha */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compara senha em texto plano com o hash armazenado */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Assina um JWT com expiração de 1 ano */
export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  const secret = ENV.cookieSecret;
  if (!secret) throw new Error("JWT_SECRET não configurado");
  return jwt.sign(payload, secret, { expiresIn: "365d" });
}

/** Verifica e decodifica um JWT — retorna null se inválido/expirado */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const secret = ENV.cookieSecret;
    if (!secret) return null;
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}
