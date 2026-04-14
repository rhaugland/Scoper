import { describe, it, expect } from "vitest";
import * as schema from "@scoper/db";

describe("schema", () => {
  it("exports all required tables", () => {
    expect(schema.projects).toBeDefined();
    expect(schema.inputs).toBeDefined();
    expect(schema.scopes).toBeDefined();
    expect(schema.scopeItems).toBeDefined();
    expect(schema.questions).toBeDefined();
    expect(schema.assumptions).toBeDefined();
    expect(schema.users).toBeDefined();
    expect(schema.magicLinks).toBeDefined();
  });

  it("exports all required enums", () => {
    expect(schema.projectStatusEnum).toBeDefined();
    expect(schema.inputSourceEnum).toBeDefined();
    expect(schema.assumptionStatusEnum).toBeDefined();
    expect(schema.riskSeverityEnum).toBeDefined();
  });
});
