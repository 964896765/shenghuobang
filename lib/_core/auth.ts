import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/app";

export type User = {
  id: number;
  openId: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  accountStatus: "active" | "restricted" | "suspended" | "closed";
  lastSignedIn: Date;
};

type AuthListener = () => void;
const listeners = new Set<AuthListener>();

export function subscribeAuthChanges(listener: AuthListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAuthChanged() {
  listeners.forEach((listener) => listener());
}

async function readValue(key: string) {
  if (Platform.OS === "web") {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function writeValue(key: string, value: string) {
  if (Platform.OS === "web") {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeValue(key: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function getSessionToken() {
  return readValue(SESSION_TOKEN_KEY);
}

export function setSessionToken(token: string) {
  return writeValue(SESSION_TOKEN_KEY, token);
}

export function removeSessionToken() {
  return removeValue(SESSION_TOKEN_KEY);
}

export async function getUserInfo(): Promise<User | null> {
  try {
    const info = await readValue(USER_INFO_KEY);
    if (!info) return null;
    const parsed = JSON.parse(info) as Omit<User, "lastSignedIn"> & { lastSignedIn: string };
    return { ...parsed, lastSignedIn: new Date(parsed.lastSignedIn) };
  } catch {
    return null;
  }
}

export function setUserInfo(user: User) {
  return writeValue(USER_INFO_KEY, JSON.stringify(user));
}

export function clearUserInfo() {
  return removeValue(USER_INFO_KEY);
}

export async function saveSession(token: string, user: User) {
  await Promise.all([setSessionToken(token), setUserInfo(user)]);
  notifyAuthChanged();
}

export async function clearSession() {
  await Promise.all([removeSessionToken(), clearUserInfo()]);
  notifyAuthChanged();
}
