import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PermissionDeniedState, StickyActionBar } from "@/components/trust-ui";

export default function ComingSoonScreen() {
  const router = useRouter();
  const { feature = "该功能", state } = useLocalSearchParams<{ feature?: string; state?: string }>();
  const denied = state === "permission_denied";
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title={denied ? "无权限访问" : "功能状态"} />
      {denied ? <View className="flex-1 justify-center"><PermissionDeniedState onSwitchWorkspace={() => router.push("/workspaces" as never)} /></View> : <View className="flex-1 items-center justify-center px-8">
        <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary/10"><IconSymbol name={denied ? "lock.fill" : "hammer.fill"} size={38} color="#16A34A" /></View>
        <Text className="mt-5 text-2xl font-bold text-foreground">{feature}</Text>
        <View className="mt-3"><StatusBadge label={denied ? "当前身份无权限" : "建设中"} tone={denied ? "red" : "orange"} /></View>
        <Text className="mt-4 text-center text-sm leading-6 text-muted">{denied ? "当前身份或组织上下文不具备所需能力。可切换工作台后重试；最终授权仍由服务端决定。" : "入口、返回路径和状态已经接通，业务页面尚未上线。你可以返回上一页继续使用其他功能。"}</Text>
        <View className="mt-6 w-full"><PrimaryButton title="返回上一页" onPress={() => router.canGoBack() ? router.back() : router.replace("/" as never)} /></View>
      </View>}
      <StickyActionBar><PrimaryButton title="返回首页" variant="outline" onPress={() => router.replace("/" as never)} /></StickyActionBar>
    </ScreenContainer>
  );
}
