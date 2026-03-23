/**
 * MedSuite — Testes unitários dos módulos de extração e roteamento
 */
import { describe, expect, it } from "vitest";
import { detectDocumentType, generateFileName } from "./jsonExtractor";

// ─── detectDocumentType ───────────────────────────────────────────────────────

describe("detectDocumentType", () => {
  it("retorna 'lab' quando maioria das páginas é laudo", () => {
    expect(detectDocumentType(["laudo", "laudo", "imagem"])).toBe("lab");
  });

  it("retorna 'imaging' quando maioria das páginas é imagem", () => {
    expect(detectDocumentType(["imagem", "imagem", "laudo"])).toBe("imaging");
  });

  it("retorna 'lab' quando todas são laudo", () => {
    expect(detectDocumentType(["laudo", "laudo", "laudo"])).toBe("lab");
  });

  it("retorna 'imaging' quando todas são imagem", () => {
    expect(detectDocumentType(["imagem", "imagem"])).toBe("imaging");
  });

  it("retorna 'lab' em caso de empate (laudo tem prioridade)", () => {
    expect(detectDocumentType(["laudo", "imagem"])).toBe("lab");
  });

  it("retorna 'lab' quando há indefinidos e maioria é laudo", () => {
    expect(detectDocumentType(["laudo", "indefinido", "indefinido"])).toBe("lab");
  });

  it("retorna 'lab' quando todas são indefinido (laudo >= imagem)", () => {
    // 0 laudos >= 0 imagens → 'lab' por padrão
    expect(detectDocumentType(["indefinido", "indefinido"])).toBe("lab");
  });

  it("lida com array vazio retornando 'lab' (laudo >= imagem)", () => {
    // Com 0 laudos e 0 imagens, laudoCount >= imagemCount → 'lab'
    expect(detectDocumentType([])).toBe("lab");
  });
});

// ─── generateFileName ─────────────────────────────────────────────────────────

describe("generateFileName", () => {
  it("gera nome correto para laudo de laboratório", () => {
    const name = generateFileName("Carlos Silva", "lab");
    expect(name).toBe("carlos_lab.json");
  });

  it("gera nome correto para laudo de imagem com tipo", () => {
    const name = generateFileName("Maria Souza", "imaging", "Ultrassonografia");
    expect(name).toBe("maria_eco.json");
  });

  it("gera nome correto para tomografia", () => {
    const name = generateFileName("João Pedro", "imaging", "Tomografia Computadorizada");
    expect(name).toBe("joao_ct_rm.json");
  });

  it("gera nome correto para ressonância", () => {
    const name = generateFileName("Ana Lima", "imaging", "Ressonância Magnética");
    expect(name).toBe("ana_ct_rm.json");
  });

  it("usa 'paciente' como fallback quando nome está vazio", () => {
    const name = generateFileName("", "lab");
    expect(name).toBe("paciente_lab.json");
  });

  it("remove caracteres especiais do nome do arquivo", () => {
    const name = generateFileName("José Ângelo", "lab");
    expect(name).toBe("jose_lab.json");
  });

  it("usa apenas o primeiro nome", () => {
    const name = generateFileName("Roberto Carlos Braga", "lab");
    expect(name).toBe("roberto_lab.json");
  });
});

// ─── Testes do router de auth (regressão) ────────────────────────────────────

import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = { name: string; options: Record<string, unknown> };
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

describe("auth.logout (regressão)", () => {
  it("limpa o cookie de sessão e retorna sucesso", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});
