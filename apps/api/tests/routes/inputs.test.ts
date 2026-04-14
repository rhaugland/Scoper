import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn() },
  })),
}));

vi.mock("@scoper/db", () => ({
  db: {},
  projects: {},
  inputs: {},
  scopes: {},
  magicLinks: {},
  users: {},
}));

import app from "../../src/index";

describe("inputs routes", () => {
  it("POST /api/projects/:id/inputs returns 401 without auth", async () => {
    const res = await app.request("/api/projects/fake-id/inputs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Some notes", source: "call_notes" }),
    });
    expect(res.status).toBe(401);
  });
});
