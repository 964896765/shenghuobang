export function dedupeMessages<T extends { id: number; clientMessageId?: string | null }>(messages: T[]) {
  const seenIds = new Set<number>();
  const seenClientIds = new Set<string>();
  return messages.filter((message) => {
    if (seenIds.has(message.id)) return false;
    if (message.clientMessageId && seenClientIds.has(message.clientMessageId)) return false;
    seenIds.add(message.id);
    if (message.clientMessageId) seenClientIds.add(message.clientMessageId);
    return true;
  });
}

export function dedupeNotifications<T extends { id: number; dedupeKey?: string | null }>(notifications: T[]) {
  const seen = new Set<string>();
  return notifications.filter((notification) => {
    const key = notification.dedupeKey || `id:${notification.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
