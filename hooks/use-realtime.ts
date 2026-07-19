import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { getApiConfigurationIssue, getWebSocketBaseUrl } from "@/constants/app";
import { getSessionToken, subscribeAuthChanges } from "@/lib/_core/auth";

export type RealtimeStatus = "connected" | "reconnecting" | "polling" | "offline";
export type RealtimeEnvelope = { type: string; eventId?: string; conversationId?: number; payload?: unknown };
type EventListener = (event: RealtimeEnvelope) => void;
type StatusListener = (status: RealtimeStatus) => void;

class RealtimeManager {
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private consumers = 0;
  private stopped = true;
  private subscriptions = new Map<number, number>();
  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private seen = new Set<string>();
  private status: RealtimeStatus = "offline";
  private appStateSubscription: { remove(): void } | null = null;
  private unsubscribeAuth: (() => void) | null = null;

  private updateStatus(status: RealtimeStatus) {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private emit(event: RealtimeEnvelope) {
    if (event.eventId) {
      if (this.seen.has(event.eventId)) return;
      this.seen.add(event.eventId);
      if (this.seen.size > 500) this.seen.clear();
    }
    for (const listener of this.eventListeners) listener(event);
  }

  private scheduleReconnect() {
    if (this.stopped || this.retryTimer) return;
    this.attempts += 1;
    this.updateStatus(this.attempts > 3 ? "polling" : "reconnecting");
    const delay = Math.min(30_000, 750 * 2 ** Math.min(this.attempts, 6)) + Math.floor(Math.random() * 250);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.connect(); }, delay);
  }

  private async connect() {
    if (this.stopped || this.socket) return;
    const token = await getSessionToken();
    if (!token || this.stopped) { this.updateStatus("offline"); return; }
    if (getApiConfigurationIssue()) { this.updateStatus("polling"); return; }
    this.updateStatus(this.attempts ? "reconnecting" : "offline");
    let wsBase: string;
    try { wsBase = getWebSocketBaseUrl(); }
    catch { this.updateStatus("polling"); return; }
    const socket = new WebSocket(`${wsBase}/api/ws?token=${encodeURIComponent(token)}`);
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
      this.updateStatus("connected");
      for (const conversationId of this.subscriptions.keys()) {
        socket.send(JSON.stringify({ action: "subscribe", conversationId }));
        this.emit({ type: "sync.required", conversationId });
      }
    };
    socket.onmessage = (message) => {
      try { this.emit(JSON.parse(String(message.data)) as RealtimeEnvelope); }
      catch { /* Malformed remote frames are ignored; the socket stays usable. */ }
    };
    socket.onclose = () => { if (this.socket === socket) this.socket = null; this.scheduleReconnect(); };
    socket.onerror = () => socket.close();
  }

  private handleAuthChange = () => {
    void getSessionToken().then((token) => {
      this.socket?.close(1000, token ? "Token refreshed" : "Logged out");
      if (!token) { this.stopSocket(); this.updateStatus("offline"); }
      else if (!this.stopped) void this.connect();
    });
  };

  private startSocket() {
    if (!this.stopped) return;
    this.stopped = false;
    this.appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") { this.socket?.close(1000, "App resumed"); void this.connect(); }
      else { this.socket?.close(1000, "App backgrounded"); this.updateStatus("offline"); }
    });
    this.unsubscribeAuth = subscribeAuthChanges(this.handleAuthChange);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
    void this.connect();
  }

  private handleOnline = () => { this.socket?.close(1000, "Network restored"); void this.connect(); };
  private handleOffline = () => { this.socket?.close(1000, "Network offline"); this.updateStatus("offline"); };

  private stopSocket() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close(1000, "No active consumers");
    this.socket = null;
  }

  subscribe(conversationId: number | undefined, eventListener: EventListener, statusListener: StatusListener) {
    this.consumers += 1;
    this.eventListeners.add(eventListener);
    this.statusListeners.add(statusListener);
    statusListener(this.status);
    if (conversationId) {
      this.subscriptions.set(conversationId, (this.subscriptions.get(conversationId) ?? 0) + 1);
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ action: "subscribe", conversationId }));
    }
    this.startSocket();
    return () => {
      this.consumers -= 1;
      this.eventListeners.delete(eventListener);
      this.statusListeners.delete(statusListener);
      if (conversationId) {
        const count = (this.subscriptions.get(conversationId) ?? 1) - 1;
        if (count <= 0) {
          this.subscriptions.delete(conversationId);
          if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ action: "unsubscribe", conversationId }));
        } else this.subscriptions.set(conversationId, count);
      }
      if (this.consumers <= 0) {
        this.stopSocket();
        this.appStateSubscription?.remove();
        this.appStateSubscription = null;
        this.unsubscribeAuth?.();
        this.unsubscribeAuth = null;
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.removeEventListener("online", this.handleOnline);
          window.removeEventListener("offline", this.handleOffline);
        }
      }
    };
  }
}

const realtimeManager = new RealtimeManager();

export function useRealtime(options: { conversationId?: number; onEvent?: (event: RealtimeEnvelope) => void; enabled?: boolean }) {
  const { conversationId, onEvent, enabled = true } = options;
  const [status, setStatus] = useState<RealtimeStatus>("offline");
  useEffect(() => {
    if (!enabled) { setStatus("offline"); return; }
    return realtimeManager.subscribe(conversationId, (event) => {
      if (event.conversationId == null || event.conversationId === conversationId) onEvent?.(event);
    }, setStatus);
  }, [conversationId, enabled, onEvent]);
  return status;
}
