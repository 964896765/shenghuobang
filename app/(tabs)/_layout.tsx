import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabIcon } from "@/components/bottom-tab-bar";
import { HapticTab } from "@/components/haptic-tab";
import { useColors } from "@/hooks/use-colors";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import { APP_TABS } from "@/shared/navigation/appNavigation";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useRole();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const unread = trpc.messagesRouter.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 20_000,
  });
  const badge = unread.data ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: 56 + bottomPadding,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      {APP_TABS.map((entry) => (
        <Tabs.Screen
          key={entry.id}
          name={entry.name}
          options={{
            title: entry.title,
            tabBarBadge: entry.id === "messages" && badge > 0 ? (badge > 99 ? "99+" : badge) : undefined,
            tabBarIcon: ({ color }) => <BottomTabIcon entry={entry} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
