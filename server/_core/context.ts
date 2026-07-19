import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { HttpError } from "../../shared/_core/errors.js";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.statusCode)) {
      // Missing, invalid and unavailable accounts remain anonymous for public procedures.
      user = null;
    } else {
      // Infrastructure failures must not be downgraded to an expired session.
      throw error;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
