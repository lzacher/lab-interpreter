import { ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getSession } from "../auth";
import { ENV } from "./env";

export type SessionPayload = {
  openId: string;
  name: string;
};

class SDKServer {
  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({ openId: payload.openId, name: payload.name })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, name } = payload as Record<string, unknown>;

      if (typeof openId !== "string" || openId.length === 0) {
        console.warn("[Auth] Session payload missing openId");
        return null;
      }

      return {
        openId,
        name: typeof name === "string" ? name : "",
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const session = await getSession(req);
    const openId = (session?.user as any)?.openId as string | undefined;

    if (!openId) {
      throw ForbiddenError("Invalid or missing session");
    }

    const signedInAt = new Date();
    let user = await db.getUserByOpenId(openId);

    if (!user) {
      // First login: provision user record from Google profile
      await db.upsertUser({
        openId,
        name: session!.user.name ?? null,
        email: session!.user.email ?? null,
        loginMethod: "google",
        lastSignedIn: signedInAt,
      });
      user = await db.getUserByOpenId(openId);
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({ openId: user.openId, lastSignedIn: signedInAt });

    return user;
  }
}

export const sdk = new SDKServer();
