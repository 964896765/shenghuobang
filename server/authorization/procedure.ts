import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import type { AuthorizationService } from "./authorization-service";
import type { AuthorizationRequest } from "./types";

export function capabilityProcedure(
  service: AuthorizationService,
  resolveRequest: (input: { ctx: TrpcContext & { user: NonNullable<TrpcContext["user"]> }; rawInput: unknown }) => Omit<AuthorizationRequest, "accountId"> | Promise<Omit<AuthorizationRequest, "accountId">>,
) {
  return protectedProcedure.use(async ({ ctx, next, getRawInput }) => {
    const rawInput = await getRawInput();
    const request = await resolveRequest({ ctx, rawInput });
    const authorization = await service.authorize({ ...request, accountId: ctx.user.id });
    if (!authorization.allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: authorization.reasonCode });
    }
    return next({ ctx: { ...ctx, authorization } });
  });
}
