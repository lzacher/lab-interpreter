import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getSession } from "../auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const session = await getSession(opts.req);
    const openId = (session?.user as any)?.openId as string | undefined;

    if (openId) {
      const signedInAt = new Date();
      let found = (await db.getUserByOpenId(openId)) ?? null;

      if (!found) {
        // First login: provision user record from Google profile
        await db.upsertUser({
          openId,
          name: session!.user.name ?? null,
          email: session!.user.email ?? null,
          loginMethod: "google",
          lastSignedIn: signedInAt,
        });
        found = (await db.getUserByOpenId(openId)) ?? null;
      } else {
        await db.upsertUser({ openId: found.openId, lastSignedIn: signedInAt });
      }

      user = found;
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    console.error("[context] auth error:", error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
