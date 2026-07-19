import type { PushMessage, PushProvider, PushResult } from "./provider";

type ExpoTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

export function isExpoPushToken(token: string) {
  return /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

export class ExpoPushProvider implements PushProvider {
  readonly name = "expo";

  constructor(private readonly accessToken = "", private readonly endpoint = "https://exp.host/--/api/v2/push/send") {}

  async send(message: PushMessage): Promise<PushResult> {
    if (!isExpoPushToken(message.token)) return { success: false, error: "DeviceNotRegistered: Expo Push Token 格式无效" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify({
          to: message.token,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default",
          channelId: "default",
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as { data?: ExpoTicket; errors?: { message?: string; code?: string }[] };
      if (!response.ok) {
        const error = payload.errors?.[0];
        return { success: false, error: `${error?.code ?? `HTTP_${response.status}`}: ${error?.message ?? "Expo Push 请求失败"}` };
      }
      const ticket = payload.data;
      if (ticket?.status === "ok" && ticket.id) return { success: true, providerMessageId: ticket.id };
      return { success: false, error: `${ticket?.details?.error ?? "ExpoPushError"}: ${ticket?.message ?? "Expo Push 投递失败"}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Expo Push 请求失败" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
