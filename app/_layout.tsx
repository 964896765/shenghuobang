import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { RoleProvider } from "@/lib/role-context";
import { PushLifecycle } from "@/components/push-lifecycle";
import * as Auth from "@/lib/_core/auth";
import { clearAuthScopedQueries } from "@/lib/auth-query-cache";
import { getBuildInfo } from "@/lib/build-info";
import { getBootPhase, markBootPhase } from "@/lib/boot-diagnostics";
import { GlobalLocationProvider } from "@/lib/location-context";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function BootMarker({ phase }: { phase: Parameters<typeof markBootPhase>[0] }) {
  useEffect(() => {
    markBootPhase(phase);
  }, [phase]);
  return null;
}

function BootFailureScreen({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();
  const buildInfo = getBuildInfo();
  const currentPhase = getBootPhase();
  const errorCode = `BOOT-${currentPhase.replaceAll(" ", "-").toUpperCase()}`;
  const [checking, setChecking] = useState(false);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);

  async function checkServiceStatus() {
    if (!buildInfo.apiBaseUrl) {
      setHealthMessage("未配置 API 地址");
      return;
    }
    setChecking(true);
    try {
      const response = await fetch(`${buildInfo.apiBaseUrl}/api/health`);
      setHealthMessage(response.ok ? "服务健康检查通过" : `服务返回 ${response.status}`);
    } catch {
      setHealthMessage("当前无法连接服务");
    } finally {
      setChecking(false);
    }
  }

  return (
    <View className="flex-1 bg-white px-6 py-12">
      <View className="mt-16 rounded-3xl border border-red-200 bg-red-50 p-5">
        <Text className="text-2xl font-semibold text-foreground">生活帮启动失败</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">应用在启动阶段遇到异常，已保留非敏感诊断信息，重试前可先检查服务状态。</Text>
        <Text className="mt-4 text-sm text-foreground">错误编号：{errorCode}</Text>
        <Text className="mt-1 text-sm text-foreground">当前阶段：{currentPhase}</Text>
        <Text className="mt-1 text-sm text-foreground">版本：{buildInfo.appVersion} ({buildInfo.versionCode})</Text>
        <Text className="mt-1 text-sm text-foreground">构建：{buildInfo.buildProfile} / {buildInfo.gitCommit.slice(0, 7)}</Text>
        <Text className="mt-1 text-sm text-foreground">摘要：{error instanceof Error ? error.name : "UnknownError"}</Text>
        {healthMessage ? <Text className="mt-3 text-sm text-muted">{healthMessage}</Text> : null}
        <View className="mt-5 gap-3">
          <Pressable className="items-center rounded-2xl bg-primary px-4 py-3" onPress={() => retry()}>
            <Text className="text-sm font-semibold text-white">重试</Text>
          </Pressable>
          <Pressable className="items-center rounded-2xl border border-border px-4 py-3" onPress={checkServiceStatus}>
            <Text className="text-sm font-semibold text-foreground">{checking ? "检查中…" : "检查服务状态"}</Text>
          </Pressable>
          <Pressable className="items-center rounded-2xl border border-border px-4 py-3" onPress={() => router.replace("/login")}>
            <Text className="text-sm font-semibold text-foreground">返回登录</Text>
          </Pressable>
          <Pressable className="items-center rounded-2xl border border-border px-4 py-3" onPress={() => router.replace("/(tabs)")}>
            <Text className="text-sm font-semibold text-foreground">返回首页</Text>
          </Pressable>
          {buildInfo.apiBaseUrl ? (
            <Pressable className="items-center rounded-2xl border border-border px-4 py-3" onPress={() => Linking.openURL(`${buildInfo.apiBaseUrl}/api/health`)}>
              <Text className="text-sm font-semibold text-foreground">打开健康检查</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
        <BootFailureScreen {...props} />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  markBootPhase("root layout");
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const insets = initialInsets;
  const frame = initialFrame;

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  useEffect(
    () => Auth.subscribeAuthChanges(() => clearAuthScopedQueries(queryClient)),
    [queryClient],
  );
  useEffect(() => {
    markBootPhase("query ready");
  }, []);
  useEffect(() => {
    markBootPhase("trpc ready");
  }, [trpcClient]);

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BootMarker phase="theme ready" />
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <BootMarker phase="role provider mounted" />
          <RoleProvider>
          <BootMarker phase="location provider mounted" />
          <GlobalLocationProvider>
          <BootMarker phase="push lifecycle mounted" />
          <PushLifecycle />
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <BootMarker phase="router mounted" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ presentation: "fullScreenModal" }} />
          </Stack>
          <View style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>
            <BootMarker phase="tabs rendered" />
            <ActivityIndicator />
          </View>
          <StatusBar style="auto" />
          </GlobalLocationProvider>
          </RoleProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
