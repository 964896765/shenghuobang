import { sha256 } from "../migration/v33-a2/contract";
import type { PermissionAuditEvent, PermissionAuditWriter } from "./types";

const sensitiveKey = /(phone|email|idnumber|registrationno|bank|accountno|token|secret|password|storagekey|url|quote(content|body)?|design|bom|process(content|body)?)/i;
const sensitiveValue = /(?:https?:\/\/|-----BEGIN|\b(?:token|secret|password)\s*[:=])/i;

export function assertSafeAuditDetail(detail: Record<string, unknown>): void {
  const visit = (value: unknown, key?: string): void => {
    if (key && sensitiveKey.test(key)) throw new Error(`AUDIT_DETAIL_UNSAFE:${key}`);
    if (typeof value === "string" && sensitiveValue.test(value)) throw new Error(`AUDIT_DETAIL_UNSAFE:${key ?? "value"}`);
    if (Array.isArray(value)) value.forEach((item) => visit(item));
    else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(detail);
}

export function resourceIdDigest(resourceType: string | null | undefined, resourceId: string | null | undefined): string | null {
  return resourceType && resourceId ? sha256(`${resourceType}|${resourceId}`) : null;
}

export class MemoryPermissionAuditWriter implements PermissionAuditWriter {
  readonly events: PermissionAuditEvent[] = [];

  async write(event: PermissionAuditEvent): Promise<void> {
    assertSafeAuditDetail(event.detail ?? {});
    this.events.push(structuredClone(event));
  }

  async writeMutation(input: Omit<PermissionAuditEvent, "decision">): Promise<void> {
    await this.write({ ...input, decision: "changed" });
  }
}
