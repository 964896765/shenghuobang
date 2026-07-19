import { router } from "expo-router";
import { Platform } from "react-native";

export const SESSION_TOKEN_KEY = "shenghuobang_session_token";
export const USER_INFO_KEY = "shenghuobang_user_info";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3000`;
  }

  return "http://localhost:3000";
}

export function getApiConfigurationIssue(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!configured && Platform.OS !== "web") {
    return "未配置移动端 API 地址。请将 EXPO_PUBLIC_API_BASE_URL 设置为电脑的局域网地址，然后重新启动 Expo。";
  }
  try {
    const url = new URL(getApiBaseUrl());
    if (!new Set(["http:", "https:"]).has(url.protocol)) return "API 地址必须以 http:// 或 https:// 开头。";
    if (Platform.OS !== "web" && LOOPBACK_HOSTS.has(url.hostname)) {
      return "真机不能使用 localhost 连接电脑。请把 EXPO_PUBLIC_API_BASE_URL 改为电脑的局域网 IP 地址。";
    }
  } catch {
    return "API 地址格式不正确，请检查 EXPO_PUBLIC_API_BASE_URL。";
  }
  return null;
}

export function getWebSocketBaseUrl(): string {
  const apiUrl = new URL(getApiBaseUrl());
  const configured = process.env.EXPO_PUBLIC_WS_BASE_URL?.trim();
  const wsUrl = configured
    ? new URL(configured)
    : new URL(getApiBaseUrl().replace(/^http:/, "ws:").replace(/^https:/, "wss:"));
  if (!new Set(["ws:", "wss:"]).has(wsUrl.protocol)) throw new Error("WebSocket 地址必须以 ws:// 或 wss:// 开头。");
  if ((apiUrl.protocol === "https:" && wsUrl.protocol !== "wss:") || (apiUrl.protocol === "http:" && wsUrl.protocol !== "ws:")) {
    throw new Error("WebSocket 协议必须与 API 的 HTTP/HTTPS 安全级别一致。");
  }
  return wsUrl.toString().replace(/\/$/, "");
}

export function startLogin() {
  router.push("/login" as never);
}
