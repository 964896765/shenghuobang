import { TRPCError } from "@trpc/server";
import { applyFieldMask } from "./field-mask";
import { AuthorizationService } from "./authorization-service";
import { DrizzleAuthorizationDataSource } from "./drizzle-data-source";
import { DrizzlePermissionAuditWriter } from "./drizzle-audit-writer";
import type { AuthorizationRequest, AuthorizationResult } from "./types";

let runtimeService: AuthorizationService | null = null;

export function getAuthorizationService(): AuthorizationService {
  runtimeService ??= new AuthorizationService(new DrizzleAuthorizationDataSource(), new DrizzlePermissionAuditWriter());
  return runtimeService;
}

export function setAuthorizationServiceForTests(service: AuthorizationService | null): void {
  runtimeService = service;
}

export async function authorizeOrThrow(
  accountId: number,
  request: Omit<AuthorizationRequest, "accountId">,
): Promise<AuthorizationResult> {
  const result = await getAuthorizationService().authorize({ ...request, accountId });
  if (!result.allowed) throw new TRPCError({ code: "FORBIDDEN", message: result.reasonCode });
  return result;
}

export function serializeAuthorized<T extends Record<string, unknown>>(record: T, authorization: AuthorizationResult): T {
  return applyFieldMask(record, authorization.fieldMask) as T;
}
