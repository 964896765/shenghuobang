export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function resolveAuthMeFailure(error: unknown): null {
  if (error instanceof ApiError && error.status === 401) return null;
  throw error;
}
