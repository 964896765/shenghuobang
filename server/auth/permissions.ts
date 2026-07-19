import type { User } from "../../drizzle/schema";

export type AdminRole = Exclude<User["role"], "user">;
export type Permission =
  | "admin.menu"
  | "verification.read"
  | "verification.review"
  | "verification.revoke"
  | "complaint.read"
  | "complaint.operate"
  | "complaint.decide"
  | "finance.read"
  | "finance.refund.review"
  | "finance.release"
  | "audit.read"
  | "admin.roles.write";

const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  admin: [
    "admin.menu", "verification.read", "verification.review", "verification.revoke", "complaint.read",
    "complaint.operate", "complaint.decide", "finance.read", "finance.refund.review", "finance.release",
    "audit.read", "admin.roles.write",
  ],
  verification_reviewer: ["admin.menu", "verification.read", "verification.review", "verification.revoke", "audit.read"],
  complaint_operator: ["admin.menu", "complaint.read", "complaint.operate", "complaint.decide", "finance.read", "audit.read"],
  finance_operator: ["admin.menu", "finance.read", "finance.refund.review", "finance.release", "complaint.read", "audit.read"],
  customer_service: ["admin.menu", "verification.read", "complaint.read", "audit.read"],
};

export function isAdminRole(role: User["role"]): role is AdminRole {
  return role !== "user";
}

export function hasPermission(role: User["role"], permission: Permission) {
  return isAdminRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}

export function assertPermission(role: User["role"], permission: Permission) {
  if (!hasPermission(role, permission)) throw new Error(`缺少操作权限：${permission}`);
}

export function permissionsFor(role: User["role"]) {
  return isAdminRole(role) ? [...ROLE_PERMISSIONS[role]] : [];
}
