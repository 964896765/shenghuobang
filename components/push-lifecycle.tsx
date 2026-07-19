import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

import { useRole } from "@/lib/role-context";
import { registerExpoPushToken } from "@/lib/push/client";
import { resolveNotificationRoute } from "@/lib/push/notification-routing";
import { trpc } from "@/lib/trpc";

export function PushLifecycle() {
  const router = useRouter();
  const { isAuthenticated } = useRole();
  const utils = trpc.useUtils();
  const register = trpc.messagesRouter.registerPushToken.useMutation();
  const registerRef = useRef(register.mutateAsync);
  const syncing = useRef(false);
  const handledResponse = useRef<string | undefined>(undefined);

  useEffect(() => {
    registerRef.current = register.mutateAsync;
  }, [register.mutateAsync]);

  const syncIfPermitted = useCallback(async () => {
    if (!isAuthenticated || Platform.OS === "web" || syncing.current) return;
    syncing.current = true;
    try { await registerExpoPushToken((input) => registerRef.current(input)); }
    finally { syncing.current = false; }
  }, [isAuthenticated]);

  const openResponse = useCallback((response: Notifications.NotificationResponse | null) => {
    if (!response || handledResponse.current === response.notification.request.identifier) return;
    handledResponse.current = response.notification.request.identifier;
    const route = resolveNotificationRoute(response.notification.request.content.data);
    if (route) router.push(route as never);
  }, [router]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    void syncIfPermitted();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncIfPermitted();
    });
    const tokenChanged = Notifications.addPushTokenListener(() => void syncIfPermitted());
    return () => {
      appState.remove();
      tokenChanged.remove();
    };
  }, [syncIfPermitted]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const received = Notifications.addNotificationReceivedListener(() => {
      void utils.messagesRouter.notifications.invalidate();
      void utils.messagesRouter.unreadCount.invalidate();
    });
    const response = Notifications.addNotificationResponseReceivedListener(openResponse);
    void Notifications.getLastNotificationResponseAsync().then(openResponse);
    return () => {
      received.remove();
      response.remove();
    };
  }, [openResponse, utils]);

  return null;
}
