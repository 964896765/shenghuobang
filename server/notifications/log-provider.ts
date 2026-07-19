import crypto from "node:crypto";
import type { PushMessage, PushProvider, PushResult } from "./provider";
export class LogPushProvider implements PushProvider {
  readonly name = "log";
  async send(message: PushMessage): Promise<PushResult> {
    console.info("[Push:log]", { token: `${message.token.slice(0, 8)}…`, title: message.title, data: message.data });
    return { success: true, providerMessageId: `log-${crypto.randomUUID()}` };
  }
}
