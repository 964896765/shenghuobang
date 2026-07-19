import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { role, isAuthenticated } = useRole();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  const unread = trpc.messagesRouter.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 20000,
  });
  const badge = unread.data ?? 0;

  const homeTitle = role === "engineer" || role === "merchant" ? "工作台" : "首页";
  const discoverTitle = role === "engineer" ? "需求大厅" : role === "merchant" ? "附近询价" : "发现";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: homeTitle,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name={role === "user" ? "house.fill" : "briefcase.fill"} color={color} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: discoverTitle,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="safari.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="publish"
        options={{
          title: "发布",
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="plus.circle.fill" color="#F97316" />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "消息",
          tabBarBadge: badge > 0 ? (badge > 99 ? "99+" : badge) : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="message.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我的",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
