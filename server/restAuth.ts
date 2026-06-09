/**
 * restAuth.ts — Endpoint REST para login
 * 
 * Usa endpoint REST simples (POST /api/auth/login) em vez de tRPC mutation
 * para evitar o bug "No procedure found" em mutations no deploy VPS.
 * 
 * Single-user: sem registro público.
 */
import type { Express } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { comparePassword, signToken } from "./_core/localAuth";
import { getSessionCookieOptions } from "./_core/cookies";
import { getUserByEmail } from "./db";

export function registerAuthRoutes(app: Express) {
  /** POST /api/auth/login — Login com email e senha */
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body ?? {};

      if (!email || !password) {
        return res.status(400).json({
          error: "E-mail e senha são obrigatórios",
        });
      }

      if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({
          error: "Dados inválidos",
        });
      }

      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({
          error: "E-mail ou senha incorretos",
        });
      }

      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({
          error: "E-mail ou senha incorretos",
        });
      }

      // Gerar JWT
      const token = signToken({
        userId: user.id,
        email: user.email ?? email,
        role: user.role,
      });

      // Setar cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("[Auth] Login error:", error);
      return res.status(500).json({
        error: "Erro interno do servidor",
      });
    }
  });

  /** POST /api/auth/logout — Limpa o cookie (fallback REST) */
  app.post("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.json({ success: true });
  });
}
