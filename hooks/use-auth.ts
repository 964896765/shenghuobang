import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = { autoFetch?: boolean };

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await Auth.getSessionToken();
      if (!token) {
        setUser(null);
        return;
      }

      const apiUser = await Api.getMe();
      if (apiUser) {
        await Auth.setUserInfo(apiUser);
        setUser(apiUser);
      } else {
        await Auth.clearSession();
        setUser(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("读取登录状态失败"));
      setUser(await Auth.getUserInfo());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }
    void fetchUser();
    return Auth.subscribeAuthChanges(() => void fetchUser());
  }, [autoFetch, fetchUser]);

  const logout = useCallback(async () => {
    await Api.logout();
    setUser(null);
    setError(null);
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: useMemo(() => Boolean(user), [user]),
    refresh: fetchUser,
    logout,
  };
}
