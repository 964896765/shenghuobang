export type PushMessage = { token: string; title: string; body?: string; data?: Record<string, string> };
export type PushResult = { success: boolean; providerMessageId?: string; error?: string };
export interface PushProvider { readonly name: string; send(message: PushMessage): Promise<PushResult>; }
