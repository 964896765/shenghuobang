export type DomainRealtimeEvent = {
  type: "message.created" | "message.delivered" | "message.read" | "notification.created" | "quote.updated" | "project.updated" | "milestone.updated" | "order.updated" | "complaint.updated" | "payment.updated" | "refund.updated";
  userId?: number;
  conversationId?: number;
  payload: unknown;
  eventId?: string;
};
type Listener = (event: DomainRealtimeEvent) => void;
const listeners = new Set<Listener>();
export function emitRealtimeEvent(event: DomainRealtimeEvent) { for (const listener of listeners) listener(event); }
export function subscribeRealtimeEvents(listener: Listener) { listeners.add(listener); return () => listeners.delete(listener); }
