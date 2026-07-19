type AuthScopedQueryClient = {
  cancelQueries: () => Promise<unknown>;
  clear: () => void;
};

export function clearAuthScopedQueries(queryClient: AuthScopedQueryClient) {
  void queryClient.cancelQueries().catch(() => undefined);
  queryClient.clear();
}
