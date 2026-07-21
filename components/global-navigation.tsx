import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useGlobalLocation } from "@/lib/location-context";
import type { AppEntry } from "@/shared/navigation/appNavigation";

export function LocationEntry() {
  const router = useRouter();
  const location = useGlobalLocation();
  const label = location.locationState === "acquiring" || location.permission === "requesting"
    ? "定位中"
    : location.region
      ? location.region
      : location.permission === "permanently_denied" || location.permission === "services_disabled"
        ? "开启位置权限"
        : location.locationState === "failed"
          ? "手动选择"
          : "选择位置";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`位置：${label}`}
      onPress={() => router.push("/location" as never)}
      className="w-[78px] flex-row items-center"
    >
      <IconSymbol name="mappin.circle.fill" size={20} color="#16A34A" />
      <Text numberOfLines={1} className="ml-1 flex-1 text-xs font-semibold text-foreground">{label}</Text>
    </Pressable>
  );
}

export function GlobalSearchBar() {
  const router = useRouter();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="search"
      onPress={() => router.push("/search" as never)}
      className="mx-2 flex-1 flex-row items-center rounded-full border border-border bg-surface px-3 py-2"
    >
      <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
      <TextInput
        editable={false}
        pointerEvents="none"
        placeholder="搜索或问 AI"
        placeholderTextColor={colors.muted}
        className="ml-2 flex-1 text-sm text-foreground"
      />
      <IconSymbol name="sparkles" size={17} color="#F97316" />
    </Pressable>
  );
}

export function ProductScanButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="扫码与产品追溯"
      onPress={() => router.push("/products/passport" as never)}
      className="h-10 w-10 items-center justify-center rounded-full bg-surface"
    >
      <IconSymbol name="camera.fill" size={21} color="#16A34A" />
    </Pressable>
  );
}

export function GlobalHeader() {
  return (
    <View className="flex-row items-center px-4 pb-3 pt-2">
      <LocationEntry />
      <GlobalSearchBar />
      <ProductScanButton />
    </View>
  );
}

export function EntryGrid({ entries, onPress }: { entries: readonly AppEntry[]; onPress: (entry: AppEntry) => void }) {
  return (
    <View className="flex-row flex-wrap px-2">
      {entries.map((entry) => (
        <Pressable
          key={entry.id}
          accessibilityRole="button"
          accessibilityLabel={`${entry.title}：${entry.description}`}
          onPress={() => onPress(entry)}
          className="w-1/4 items-center px-1 py-3"
        >
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <IconSymbol name={entry.icon} size={25} color={entry.enabled ? "#16A34A" : "#9CA3AF"} />
          </View>
          <Text className="mt-2 text-center text-sm font-medium text-foreground">{entry.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}
