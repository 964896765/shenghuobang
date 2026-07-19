export type NotificationRouteData = Record<string, unknown>;

const ROUTE_PREFIXES: Record<string, string> = {
  order: "/orders",
  project: "/projects",
  need: "/needs",
  complaint: "/complaints",
  listing: "/listings",
  recycling: "/recycling",
  swap: "/swaps",
  conversation: "/chat",
  message: "/chat",
};

function positiveId(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveNotificationRoute(data: NotificationRouteData | null | undefined) {
  if (!data) return null;
  const type = typeof data.refType === "string"
    ? data.refType
    : typeof data.type === "string"
      ? data.type
      : typeof data.notificationType === "string"
        ? data.notificationType
        : "";
  const normalizedType = type === "new_message" ? "conversation"
    : type.startsWith("swap_") ? "swap"
      : type.startsWith("recycling_") ? "recycling"
        : type.startsWith("order_") ? "order"
          : type;
  const id = positiveId(
    data.refId ?? data.resourceId ?? data.conversationId ?? data.swapId ?? data.recyclingId ?? data.orderId,
  );
  const prefix = ROUTE_PREFIXES[normalizedType];
  return prefix && id ? `${prefix}/${id}` : null;
}

export function notificationRouteData(refType?: string | null, refId?: number | null) {
  return resolveNotificationRoute({ refType, refId });
}
