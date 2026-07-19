import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { startLogin } from "@/constants/app";
import { useRole } from "@/lib/role-context";
import { PrimaryButton, LoadingView } from "@/components/common";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

/** 包裹需要登录的页面内容;未登录时展示登录引导 */
export function AuthGate({ children, title = "登录后使用" }: { children: React.ReactNode; title?: string }) {
  const { isAuthenticated, authLoading } = useRole();
  if (authLoading) return <LoadingView />;
  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-4">
          <IconSymbol name="person.fill" size={32} color="#16A34A" />
        </View>
        <Text className="text-lg font-bold text-foreground mb-2">{title}</Text>
        <Text className="text-sm text-muted text-center mb-6 leading-5">
          登录后即可发布需求、联系工程师、管理物品与订单。
        </Text>
        <PrimaryButton title="立即登录" onPress={() => startLogin()} />
      </View>
    );
  }
  return <>{children}</>;
}

/** 通用页面头部(返回+标题+右侧动作) */
export function PageHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  const colors = useColors();
  return (
    <View className="flex-row items-center px-2 py-2 bg-background">
      <Pressable
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 8 })}
      >
        <IconSymbol name="chevron.left" size={26} color={colors.foreground} />
      </Pressable>
      <Text className="text-lg font-bold text-foreground flex-1" numberOfLines={1}>
        {title}
      </Text>
      {right}
      <View style={{ width: 8 }} />
    </View>
  );
}
