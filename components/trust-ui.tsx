import { Text, View } from "react-native";
import type { ReactNode } from "react";

import { LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { IconSymbol } from "@/components/ui/icon-symbol";

export function IdentityBadge({ label }: { label: string }) {
  return <StatusBadge label={label} tone="blue" small />;
}

export function TrustBadge({ label = "可信记录" }: { label?: string }) {
  return <StatusBadge label={label} tone="green" small />;
}

export function SourceLabel({ children }: { children: string }) {
  return <Text className="text-xs text-muted">来源：{children}</Text>;
}

export function LoadingState({ text }: { text?: string }) {
  return <LoadingView text={text} />;
}

export function PermissionDeniedState({ onSwitchWorkspace }: { onSwitchWorkspace: () => void }) {
  return (
    <View className="items-center px-8 py-12">
      <IconSymbol name="lock.fill" size={42} color="#DC2626" />
      <Text className="mt-4 text-xl font-bold text-foreground">当前身份无权限</Text>
      <Text className="mt-2 text-center text-sm leading-6 text-muted">可切换身份或组织上下文后重试，最终授权由服务端判断。</Text>
      <View className="mt-5"><PrimaryButton title="切换工作台" onPress={onSwitchWorkspace} /></View>
    </View>
  );
}

export function StickyActionBar({ children }: { children: ReactNode }) {
  return <View className="border-t border-border bg-background px-4 pb-4 pt-3">{children}</View>;
}
