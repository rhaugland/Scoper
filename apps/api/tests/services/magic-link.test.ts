import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn() },
  })),
}));

vi.mock("@scoper/db", () => ({
  db: {},
  magicLinks: {},
  users: {},
}));

import { generateToken, isTokenExpired } from "../../src/services/magic-link";

describe("magic-link", () => {
  it("generateToken returns a 64-char hex string", () => {
    const token = generateToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("isTokenExpired returns false for future date", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isTokenExpired(future)).toBe(false);
  });

  it("isTokenExpired returns true for past date", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isTokenExpired(past)).toBe(true);
  });
});
