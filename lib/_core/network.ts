import { getApiConfigurationIssue } from "@/constants/app";

const configuredTimeout = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS ?? 15_000);
export const DEFAULT_API_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 15_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
) {
  const configurationIssue = getApiConfigurationIssue();
  if (configurationIssue) throw new Error(configurationIssue);

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error("请求超时，请检查网络连接后重试。");
    if (init.signal?.aborted) throw error;
    throw new Error("无法连接生活帮服务，请检查网络和 API 地址后重试。", { cause: error });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}
