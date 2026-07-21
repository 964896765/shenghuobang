import { Text, View } from "react-native";

import { EntryGrid } from "@/components/global-navigation";
import { SectionHeader } from "@/components/common";
import { useAppEntryNavigation } from "@/components/app-entry-navigation";
import { PUBLISH_ENTRIES } from "@/shared/navigation/publishEntries";

export function PublishCenter() {
  const navigate = useAppEntryNavigation();
  const business = PUBLISH_ENTRIES.filter((entry) => entry.group === "business");
  const content = PUBLISH_ENTRIES.filter((entry) => entry.group === "content");
  return (
    <View>
      <View className="px-4"><SectionHeader title="业务发布" /></View>
      <EntryGrid entries={business} onPress={navigate} />
      <View className="mt-4 px-4">
        <SectionHeader title="内容创作" />
        <Text className="-mt-2 mb-1 text-xs text-muted">灰色入口已接入统一建设中状态页，不会静默失败。</Text>
      </View>
      <EntryGrid entries={content} onPress={navigate} />
    </View>
  );
}
