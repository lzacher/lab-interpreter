/**
 * MedSuite — Testes para a lógica de dual-tab (imagingId na URL)
 */
import { describe, expect, it } from "vitest";

// Replica a lógica de parsing do imagingId usada no Analysis.tsx
function parseImagingId(search: string): number | null {
  const p = new URLSearchParams(search);
  const v = parseInt(p.get("imagingId") ?? "0", 10);
  return v > 0 ? v : null;
}

describe("parseImagingId", () => {
  it("retorna null quando não há imagingId na query string", () => {
    expect(parseImagingId("")).toBeNull();
  });

  it("retorna null quando imagingId é 0", () => {
    expect(parseImagingId("?imagingId=0")).toBeNull();
  });

  it("retorna null quando imagingId é negativo", () => {
    expect(parseImagingId("?imagingId=-5")).toBeNull();
  });

  it("retorna null quando imagingId não é numérico", () => {
    expect(parseImagingId("?imagingId=abc")).toBeNull();
  });

  it("retorna o ID correto quando imagingId é um número positivo", () => {
    expect(parseImagingId("?imagingId=42")).toBe(42);
  });

  it("retorna o ID correto quando há outros parâmetros na URL", () => {
    expect(parseImagingId("?foo=bar&imagingId=99&baz=1")).toBe(99);
  });

  it("retorna o ID correto para imagingId=1", () => {
    expect(parseImagingId("?imagingId=1")).toBe(1);
  });

  it("retorna null quando imagingId está ausente mas outros parâmetros existem", () => {
    expect(parseImagingId("?foo=bar")).toBeNull();
  });
});

// Testa a lógica de determinação do modo de exibição
function getDisplayMode(imagingId: number | null): "dual" | "lab-only" {
  return imagingId !== null ? "dual" : "lab-only";
}

describe("getDisplayMode", () => {
  it("retorna 'dual' quando imagingId está presente", () => {
    expect(getDisplayMode(42)).toBe("dual");
  });

  it("retorna 'lab-only' quando imagingId é null", () => {
    expect(getDisplayMode(null)).toBe("lab-only");
  });

  it("retorna 'dual' para qualquer ID positivo", () => {
    expect(getDisplayMode(1)).toBe("dual");
    expect(getDisplayMode(999)).toBe("dual");
  });
});
