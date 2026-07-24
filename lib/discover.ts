const DISCOVER_REASON_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  FORBIDDEN: "当前身份暂时无法访问该内容。",
  NOT_FOUND: "内容不存在或暂时不可见。",
  CONFLICT: "内容状态已变化，请刷新后重试。",
  BAD_REQUEST: "当前频道暂时无法加载，请稍后重试。",
  INTERNAL_SERVER_ERROR: "发现内容暂时不可用，请稍后重试。",
};

export function discoverErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = Object.keys(DISCOVER_REASON_MESSAGES).find((item) => message.includes(item));
  if (code) return DISCOVER_REASON_MESSAGES[code];
  if (/network|fetch|timeout|offline/i.test(message)) return "网络连接不可用，请检查网络后重试。";
  if (/TRPCClientError|too_small|invalid_type|minimum|path|origin|\{|\[/.test(message)) {
    return "发现内容暂时无法加载，请稍后重试。";
  }
  return "发现内容暂时无法加载，请稍后重试。";
}
