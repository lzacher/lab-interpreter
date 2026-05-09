import { ExpressAuth, getSession as getExpressSession } from "@auth/express";
import Google from "@auth/core/providers/google";
import type { AuthConfig } from "@auth/core";
import type { Request } from "express";
import { ENV } from "./_core/env";

export const authConfig: AuthConfig = {
  providers: [
    Google({
      clientId: ENV.googleClientId,
      clientSecret: ENV.googleClientSecret,
    }),
  ],
  secret: ENV.cookieSecret,
  trustHost: true,
  callbacks: {
    jwt({ token }) {
      // token.sub is automatically populated with Google's user ID
      return token;
    },
    session({ session, token }) {
      // Expose Google sub as openId — matches the column name in the users table
      if (token.sub) {
        (session.user as any).openId = token.sub;
      }
      return session;
    },
  },
};

export const authHandler = ExpressAuth(authConfig);

export async function getSession(req: Request) {
  return getExpressSession(req, authConfig);
}
