import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { sdk } from "./_core/sdk";
import { ENV, type RuntimeEnvironment } from "./_core/env";
import { logger } from "./_core/logger";
import * as db from "./db";
import { subscribeRealtimeEvents, type DomainRealtimeEvent } from "./event-bus";

export type RealtimeEvent = DomainRealtimeEvent;
type ClientMeta = { userId: number; conversations: Set<number>; alive: boolean; ip: string };
const clients = new Map<WebSocket, ClientMeta>();
const connectionAttempts = new Map<string, number[]>();
const pendingUsers = new WeakMap<IncomingMessage, number>();
const MAX_BUFFERED_BYTES = 1024 * 1024;

function requestIp(request: IncomingMessage) {
  return String(request.headers["x-forwarded-for"] ?? request.socket.remoteAddress ?? "unknown").split(",")[0].trim();
}

export function isWebSocketOriginAllowed(origin: string | undefined, env: RuntimeEnvironment = ENV) {
  if (!origin) return env.allowNativeWsWithoutOrigin;
  if (!env.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return env.corsOrigins.includes(origin);
}

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    logger.warn("websocket.slow_consumer", { userId: clients.get(ws)?.userId, bufferedBytes: ws.bufferedAmount });
    ws.close(4408, "Slow consumer");
    return;
  }
  ws.send(JSON.stringify(data));
}

async function auditRejected(request: IncomingMessage, reason: string, userId?: number) {
  const fields = { userId: userId ?? "anonymous", origin: request.headers.origin ?? "none", ip: requestIp(request), reason };
  logger.warn("websocket.handshake_rejected", fields);
  try {
    await db.addAuditLog({ actorId: userId, actorRole: userId ? "user" : "anonymous", action: "websocket.handshake", resourceType: "websocket", result: "denied", riskLevel: "sensitive", detail: { origin: fields.origin, reason }, ipAddress: fields.ip });
  } catch (error) {
    logger.warn("websocket.audit_unavailable", { reason, error });
  }
}

function rejectUpgrade(socket: Duplex, status: 401 | 403 | 429, reason: string) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function withinRateLimit(ip: string) {
  const now = Date.now();
  const recent = (connectionAttempts.get(ip) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  connectionAttempts.set(ip, recent);
  return recent.length <= 20;
}

export function publishRealtime(event: RealtimeEvent) {
  const message = { ...event, eventId: event.eventId ?? `${event.type}:${Date.now()}:${Math.random().toString(36).slice(2)}` };
  for (const [ws, meta] of clients) {
    const matchesUser = event.userId != null && meta.userId === event.userId;
    const matchesConversation = event.conversationId != null && meta.conversations.has(event.conversationId);
    if (matchesUser || matchesConversation) send(ws, message);
  }
}

export function closeUserConnections(userId: number, reason = "Session revoked") {
  for (const [ws, meta] of clients) if (meta.userId === userId) ws.close(4401, reason);
}

export function registerRealtime(server: Server) {
  const unsubscribe = subscribeRealtimeEvents(publishRealtime);
  const wss = new WebSocketServer({ noServer: true, maxPayload: ENV.wsMaxMessageBytes, clientTracking: false });

  server.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/ws") return;
    const ip = requestIp(request);
    if (!withinRateLimit(ip)) {
      await auditRejected(request, "rate_limit");
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }
    if (!isWebSocketOriginAllowed(request.headers.origin)) {
      await auditRejected(request, "origin_denied");
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    const session = await sdk.verifySession(url.searchParams.get("token"));
    if (!session) {
      await auditRejected(request, "invalid_session");
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    const user = await db.getUserById(session.userId).catch(() => undefined);
    if (!user || ["suspended", "closed"].includes(user.accountStatus)) {
      await auditRejected(request, "account_unavailable", session.userId);
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    const currentConnections = [...clients.values()].filter((meta) => meta.userId === user.id).length;
    if (currentConnections >= ENV.wsMaxConnectionsPerUser) {
      await auditRejected(request, "user_connection_limit", user.id);
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }
    pendingUsers.set(request, user.id);
    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => wss.emit("connection", ws, request));
  });

  wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    const authenticatedUserId = pendingUsers.get(request);
    pendingUsers.delete(request);
    if (!authenticatedUserId) { ws.close(4401, "Unauthorized"); return; }
    const meta: ClientMeta = { userId: authenticatedUserId, conversations: new Set(), alive: true, ip: requestIp(request) };
    clients.set(ws, meta);
    send(ws, { type: "connected", userId: authenticatedUserId });
    ws.on("pong", () => { meta.alive = true; });
    ws.on("message", async (raw: RawData) => {
      try {
        const rawBytes = Buffer.isBuffer(raw) ? raw.byteLength : Array.isArray(raw) ? raw.reduce((total, part) => total + part.byteLength, 0) : raw.byteLength;
        if (rawBytes > ENV.wsMaxMessageBytes) { ws.close(1009, "Message too large"); return; }
        const input = JSON.parse(raw.toString()) as { action?: string; conversationId?: number };
        if (input.action === "subscribe" && Number.isInteger(input.conversationId)) {
          if (meta.conversations.size >= ENV.wsMaxSubscriptions && !meta.conversations.has(input.conversationId!)) {
            send(ws, { type: "error", code: "SUBSCRIPTION_LIMIT" });
            return;
          }
          const conv = await db.getConversation(input.conversationId!);
          if (!conv || (conv.userAId !== authenticatedUserId && conv.userBId !== authenticatedUserId)) {
            send(ws, { type: "error", code: "CONVERSATION_ACCESS_DENIED" });
            return;
          }
          meta.conversations.add(input.conversationId!);
          await db.markConversationDelivered(input.conversationId!, authenticatedUserId);
          send(ws, { type: "subscribed", conversationId: input.conversationId });
        } else if (input.action === "unsubscribe" && Number.isInteger(input.conversationId)) {
          meta.conversations.delete(input.conversationId!);
        } else if (input.action === "read" && Number.isInteger(input.conversationId)) {
          if (!meta.conversations.has(input.conversationId!)) { send(ws, { type: "error", code: "SUBSCRIPTION_REQUIRED" }); return; }
          await db.markConversationRead(input.conversationId!, authenticatedUserId);
          publishRealtime({ type: "message.read", conversationId: input.conversationId!, payload: { userId: authenticatedUserId } });
        } else if (input.action === "ping") send(ws, { type: "pong", timestamp: Date.now() });
        else send(ws, { type: "error", code: "INVALID_ACTION" });
      } catch (error) {
        logger.warn("websocket.invalid_message", { userId: authenticatedUserId, error });
        send(ws, { type: "error", code: "INVALID_MESSAGE" });
      }
    });
    ws.on("close", () => clients.delete(ws));
    ws.on("error", (error: Error) => { logger.warn("websocket.connection_error", { userId: authenticatedUserId, error }); clients.delete(ws); });
  });

  const heartbeat = setInterval(() => {
    for (const [ws, meta] of clients) {
      if (!meta.alive) { logger.warn("websocket.heartbeat_timeout", { userId: meta.userId, ip: meta.ip }); ws.terminate(); clients.delete(ws); continue; }
      meta.alive = false;
      ws.ping();
    }
  }, 30_000);
  (heartbeat as unknown as { unref?: () => void }).unref?.();
  wss.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  return wss;
}

export function realtimeStats() {
  return { connections: clients.size, users: new Set([...clients.values()].map((value) => value.userId)).size };
}
