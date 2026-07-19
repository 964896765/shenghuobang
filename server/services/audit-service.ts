import { desc, eq } from "drizzle-orm";
import { auditLogs, type User } from "../../drizzle/schema";
import { requireDb } from "../db";

const SENSITIVE_KEYS = /(password|token|secret|authorization|phone|email|idnumber|registrationno|bank|accountno|storagekey|privateurl|fileurl|quote(body|content)?|design|bom|process(content|body)?)/i;

function sanitizeAuditText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[REDACTED_PHONE]")
    .replace(/(?<!\d)(?:\d{15}|\d{17}[\dXx]|\d{12,19})(?!\d)/g, "[REDACTED_IDENTIFIER]")
    .replace(/https?:\/\/[^\s]+/gi, "[REDACTED_URL]")
    .replace(/\b(?:bearer|token|secret|password)\s*[:=]?\s*[^\s,;]+/gi, "[REDACTED_CREDENTIAL]");
}

export function sanitizeAuditDetail(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditDetail);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEYS.test(key) ? "[REDACTED]" : sanitizeAuditDetail(entry)]),
    );
  }
  if (typeof value === "string") {
    const sanitized = sanitizeAuditText(value);
    return sanitized.length > 500 ? `${sanitized.slice(0, 500)}…` : sanitized;
  }
  return value;
}

export type AuditInput = {
  actorId: number | null;
  actorRole: User["role"];
  action: string;
  resourceType: string;
  resourceId?: string | number;
  result?: "success" | "denied" | "failed";
  riskLevel?: "normal" | "sensitive" | "high";
  detail?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export function buildAuditValues(input: AuditInput) {
  return {
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId === undefined ? null : String(input.resourceId),
    result: input.result ?? "success" as const,
    riskLevel: input.riskLevel ?? "normal" as const,
    detail: sanitizeAuditDetail(input.detail) as Record<string, unknown> | undefined,
    ipAddress: input.ipAddress?.slice(0, 64),
    userAgent: input.userAgent?.slice(0, 255),
  };
}

export async function writeAudit(input: AuditInput) {
  const db = await requireDb();
  await db.insert(auditLogs).values(buildAuditValues(input));
}

export async function listAuditLogs(limit = 100) {
  const db = await requireDb();
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(limit, 200));
}

export async function getAuditLog(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);
  return rows[0];
}
