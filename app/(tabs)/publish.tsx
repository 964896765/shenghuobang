import { ScrollView, Text, View } from "react-native";

import { PublishCenter } from "@/components/publish-center";
import { ScreenContainer } from "@/components/screen-container";

export default function PublishScreen() {
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View className="px-4 pb-4 pt-3">
          <Text className="text-2xl font-bold text-foreground">发布</Text>
          <Text className="mt-1 text-sm text-muted">业务发布与内容创作共用唯一发布中心。</Text>
        </View>
        <PublishCenter />
      </ScrollView>
    </ScreenContainer>
  );
}
