import { Pressable, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

type DiscoverHeaderProps = {
  cityLabel: string;
  onPressCity: () => void;
  onPressSearch: () => void;
  onPressCamera: () => void;
};

export function DiscoverHeader({
  cityLabel,
  onPressCity,
  onPressSearch,
  onPressCamera,
}: DiscoverHeaderProps) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`当前城市：${cityLabel}`}
        onPress={onPressCity}
        style={({ pressed }) => [styles.cityButton, { opacity: pressed ? 0.72 : 1 }]}
      >
        <Text numberOfLines={1} style={[styles.cityText, { color: colors.foreground }]}>{cityLabel}</Text>
        <IconSymbol name="chevron.right" size={16} color={colors.muted} />
      </Pressable>

      <Pressable
        accessibilityRole="search"
        accessibilityLabel="搜索内容、商品、服务或问 AI"
        onPress={onPressSearch}
        style={({ pressed }) => [
          styles.searchButton,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.82 : 1 },
        ]}
      >
        <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
        <Text numberOfLines={1} style={[styles.searchText, { color: colors.muted }]}>
          搜索内容、商品、服务或问 AI
        </Text>
        <IconSymbol name="sparkles" size={16} color="#F97316" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开相机菜单"
        onPress={onPressCamera}
        style={({ pressed }) => [
          styles.cameraButton,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <IconSymbol name="camera.fill" size={20} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  cityButton: {
    maxWidth: 92,
    minWidth: 60,
    height: 40,
    paddingRight: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  cityText: {
    maxWidth: 70,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    marginRight: 2,
  },
  searchButton: {
    flex: 1,
    minHeight: 40,
    marginHorizontal: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchText: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
    fontSize: 14,
    lineHeight: 18,
  },
  cameraButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
