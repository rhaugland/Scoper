import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({ Resend: class { emails = { send: vi.fn() }; } }));
vi.mock("@scoper/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  users: {}, magicLinks: {}, projects: {}, scopes: {}, scopeItems: {},
  inputs: {}, questions: {}, assumptions: {}, risks: {},
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: vi.fn() }; } }));

import app from "../../src/index";

describe("scoping routes", () => {
  it("POST /api/scoping/:projectId/start returns 401 without auth", async () => {
    const res = await app.request("/api/scoping/fake-id/start", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("GET /api/scoping/:scopeId/state returns 401 without auth", async () => {
    const res = await app.request("/api/scoping/fake-id/state");
    expect(res.status).toBe(401);
  });

  it("POST /api/scoping/questions/:id/answer returns 401 without auth", async () => {
    const res = await app.request("/api/scoping/questions/fake-id/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "Yes" }),
    });
    expect(res.status).toBe(401);
  });
});
