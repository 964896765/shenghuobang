import type { PushProvider } from "./provider";
import { LogPushProvider } from "./log-provider";
import { ExpoPushProvider } from "./expo-provider";
let provider: PushProvider | null = null;
export function createPushProvider(name = process.env.PUSH_PROVIDER ?? "log", accessToken = process.env.EXPO_PUSH_ACCESS_TOKEN ?? "") {
  if (name === "log") return new LogPushProvider();
  if (name === "expo") return new ExpoPushProvider(accessToken);
  throw new Error(`Unsupported PUSH_PROVIDER: ${name}`);
}
export function getPushProvider(): PushProvider { return provider ??= createPushProvider(); }
export function resetPushProviderForTests() { provider = null; }
