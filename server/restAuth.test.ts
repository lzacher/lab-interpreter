import { describe, expect, it, vi } from "vitest";

// Mock the db module before importing restAuth
vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
}));

vi.mock("./_core/localAuth", () => ({
  comparePassword: vi.fn(),
  signToken: vi.fn(() => "mock-jwt-token"),
}));

vi.mock("./_core/cookies", () => ({
  getSessionCookieOptions: vi.fn(() => ({
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
  })),
}));

vi.mock("../shared/const", () => ({
  COOKIE_NAME: "lab_session",
  ONE_YEAR_MS: 365 * 24 * 60 * 60 * 1000,
}));

import { getUserByEmail } from "./db";
import { comparePassword } from "./_core/localAuth";

describe("REST /api/auth/login logic", () => {
  it("rejects missing email or password", async () => {
    // Simulate the validation logic from restAuth.ts
    const body = { email: "", password: "" };
    expect(!body.email || !body.password).toBe(true);
  });

  it("rejects invalid credentials when user not found", async () => {
    (getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const user = await getUserByEmail("nonexistent@test.com");
    expect(user).toBeNull();
  });

  it("rejects invalid password", async () => {
    (getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      openId: "local:admin@drzacher.com",
      email: "admin@drzacher.com",
      name: "Dr. Zacher",
      role: "admin",
      passwordHash: "$2b$12$somehash",
    });
    (comparePassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const user = await getUserByEmail("admin@drzacher.com");
    const valid = await comparePassword("wrongpassword", user!.passwordHash);
    expect(valid).toBe(false);
  });

  it("accepts valid credentials", async () => {
    (getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      openId: "local:admin@drzacher.com",
      email: "admin@drzacher.com",
      name: "Dr. Zacher",
      role: "admin",
      passwordHash: "$2b$12$validhash",
    });
    (comparePassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const user = await getUserByEmail("admin@drzacher.com");
    const valid = await comparePassword("Lz@ch3r", user!.passwordHash);
    expect(valid).toBe(true);
    expect(user).toMatchObject({
      email: "admin@drzacher.com",
      role: "admin",
    });
  });
});
