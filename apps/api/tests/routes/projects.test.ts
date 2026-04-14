import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn() },
  })),
}));

vi.mock("@scoper/db", () => ({
  db: {},
  projects: {},
  scopes: {},
  magicLinks: {},
  users: {},
}));

import app from "../../src/index";

describe("projects routes", () => {
  it("POST /api/projects returns 401 without auth", async () => {
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });
    expect(res.status).toBe(401);
  });
});
