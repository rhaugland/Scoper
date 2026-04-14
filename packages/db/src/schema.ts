import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums
export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "scoping",
  "complete",
  "proposal_sent",
]);

export const inputSourceEnum = pgEnum("input_source", [
  "call_notes",
  "email",
  "transcript",
  "other",
]);

export const assumptionStatusEnum = pgEnum("assumption_status", [
  "unresolved",
  "accepted",
  "rejected",
]);

export const riskSeverityEnum = pgEnum("risk_severity", [
  "low",
  "medium",
  "high",
]);

// Tables
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const magicLinks = pgTable("magic_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: varchar("token", { length: 255 }).unique().notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  clientName: varchar("client_name", { length: 255 }),
  status: projectStatusEnum("status").default("draft").notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const inputs = pgTable("inputs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  source: inputSourceEnum("source").default("other").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scopes = pgTable("scopes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  version: integer("version").default(1).notNull(),
  summary: text("summary"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const scopeItems = pgTable("scope_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  scopeId: uuid("scope_id").references(() => scopes.id).notNull(),
  phase: varchar("phase", { length: 255 }).notNull(),
  deliverable: text("deliverable").notNull(),
  optimisticHours: integer("optimistic_hours"),
  likelyHours: integer("likely_hours"),
  pessimisticHours: integer("pessimistic_hours"),
  confidence: integer("confidence"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const assumptions = pgTable("assumptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  scopeId: uuid("scope_id").references(() => scopes.id).notNull(),
  content: text("content").notNull(),
  status: assumptionStatusEnum("status").default("unresolved").notNull(),
  sourceQuestionId: uuid("source_question_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  scopeId: uuid("scope_id").references(() => scopes.id).notNull(),
  content: text("content").notNull(),
  answer: text("answer"),
  skipped: boolean("skipped").default(false).notNull(),
  scopeImpact: varchar("scope_impact", { length: 20 }).default("medium"),
  riskLevel: riskSeverityEnum("risk_level").default("medium"),
  forClient: boolean("for_client").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  answeredAt: timestamp("answered_at"),
});

export const risks = pgTable("risks", {
  id: uuid("id").defaultRandom().primaryKey(),
  scopeId: uuid("scope_id").references(() => scopes.id).notNull(),
  content: text("content").notNull(),
  severity: riskSeverityEnum("severity").default("medium").notNull(),
  mitigation: text("mitigation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
