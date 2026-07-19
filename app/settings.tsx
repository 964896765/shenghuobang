import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, ScrollView, Text, View } from "react-native";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl, getApiConfigurationIssue } from "@/constants/app";
import {
  clearStoredPushRegistration,
  getNotificationPermissionState,
  getStoredPushRegistration,
  registerExpoPushToken,
  type NotificationPermissionState,
} from "@/lib/push/client";
import { showFeedback } from "@/lib/feedback";
import { trpc } from "@/lib/trpc";

const permissionLabels: Record<NotificationPermissionState["status"], string> = {
  granted: "系统通知权限已开启",
  denied: "系统通知权限已拒绝",
  undetermined: "尚未请求系统通知权限",
  unsupported: "当前平台不支持移动 Push",
};

function SettingsInner() {
  const register = trpc.messagesRouter.registerPushToken.useMutation();
  const unregister = trpc.messagesRouter.unregisterPushToken.useMutation();
  const [permission, setPermission] = useState<NotificationPermissionState>({ status: "undetermined", canAskAgain: true });
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const apiIssue = getApiConfigurationIssue();

  const refresh = useCallback(async () => {
    const [nextPermission, registration] = await Promise.all([
      getNotificationPermissionState(),
      getStoredPushRegistration(),
    ]);
    setPermission(nextPermission);
    setRegistered(Boolean(registration));
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    try {
      const result = await registerExpoPushToken((input) => register.mutateAsync(input), { requestPermission: true });
      await refresh();
      showFeedback(result.registered ? "通知已开启" : "暂时无法开启通知", result.registered ? "本设备已完成 Push Token 注册。" : result.reason);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    const registration = await getStoredPushRegistration();
    if (!registration) return;
    setBusy(true);
    try {
      await unregister.mutateAsync({ token: registration.token, deviceId: registration.deviceId });
      await clearStoredPushRegistration();
      await refresh();
      showFeedback("本设备通知已关闭", "站内通知仍可在通知页面查看。系统权限不会被自动修改。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View className="bg-surface rounded-2xl border border-border p-4 mb-4">
        <Text className="text-base font-bold text-foreground">通知权限</Text>
        <Text className="text-sm text-muted mt-2">{permissionLabels[permission.status]}</Text>
        <Text className="text-sm text-muted mt-1">{registered ? "本设备 Token 已注册" : "本设备 Token 未注册"}</Text>
        <Text className="text-xs text-muted mt-3 leading-5">
          拒绝通知不会影响登录、交易和站内通知。生活帮不会在首屏自动弹出权限申请。
        </Text>
        <View className="mt-4 gap-3">
          {permission.status === "denied" && !permission.canAskAgain ? (
            <PrimaryButton title="前往系统设置" onPress={() => void Linking.openSettings()} />
          ) : (
            <PrimaryButton title={registered ? "重新同步本设备" : "开启通知"} onPress={enable} loading={busy} disabled={Platform.OS === "web"} />
          )}
          {registered ? <PrimaryButton title="关闭本设备通知" variant="outline" onPress={disable} loading={busy} /> : null}
        </View>
      </View>

      <View className="bg-surface rounded-2xl border border-border p-4">
        <Text className="text-base font-bold text-foreground">开发连接诊断</Text>
        <Text className="text-xs text-muted mt-2">API：{getApiBaseUrl()}</Text>
        <Text className={`text-sm mt-2 leading-5 ${apiIssue ? "text-error" : "text-primary"}`}>
          {apiIssue ?? "API 地址格式可用于当前平台。实际可用性仍以 /api/ready 为准。"}
        </Text>
        {Platform.OS !== "web" ? (
          <Text className="text-xs text-muted mt-3 leading-5">真机需要与开发电脑处于可互通的局域网，并允许防火墙访问 API 端口。</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function SettingsScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="移动端设置" />
      <AuthGate title="登录后管理通知设置"><SettingsInner /></AuthGate>
    </ScreenContainer>
  );
}
