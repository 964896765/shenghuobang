import { getApiBaseUrl } from "@/constants/app";
import * as Auth from "./auth";
import { fetchWithTimeout } from "./network";
import { ApiError, resolveAuthMeFailure } from "./api-error";
import { clearStoredPushRegistration, getStoredPushRegistration } from "@/lib/push/client";
import { clearLocationCaches } from "@/lib/location-storage";

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await Auth.getSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const response = await fetchWithTimeout(`${getApiBaseUrl()}${cleanEndpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload?.error || payload?.message || `请求失败（${response.status}）`, response.status);
  }
  return payload as T;
}

export type AuthResponse = {
  sessionToken: string;
  user: {
    id: number;
    openId: string;
    phone: string | null;
    name: string | null;
    email: string | null;
    loginMethod: string | null;
    role: "user" | "admin";
    accountStatus: "active" | "restricted" | "suspended" | "closed";
    lastSignedIn: string;
  };
};

function normalizeUser(user: AuthResponse["user"]): Auth.User {
  return { ...user, lastSignedIn: new Date(user.lastSignedIn) };
}

export async function login(phone: string, password: string) {
  const result = await apiCall<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
  const user = normalizeUser(result.user);
  await Auth.saveSession(result.sessionToken, user);
  return user;
}

export async function register(phone: string, password: string, name?: string) {
  const result = await apiCall<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ phone, password, name: name?.trim() || undefined }),
  });
  const user = normalizeUser(result.user);
  await Auth.saveSession(result.sessionToken, user);
  return user;
}

export async function logout(): Promise<void> {
  const registration = await getStoredPushRegistration();
  try {
    await apiCall<void>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify(registration ? { pushToken: registration.token, deviceId: registration.deviceId } : {}),
    });
  } finally {
    await Promise.all([Auth.clearSession(), clearStoredPushRegistration(), clearLocationCaches()]);
  }
}

export async function getMe(): Promise<Auth.User | null> {
  try {
    const result = await apiCall<{ user: AuthResponse["user"] }>("/api/auth/me");
    return result.user ? normalizeUser(result.user) : null;
  } catch (error) {
    return resolveAuthMeFailure(error);
  }
}
