import { ScrollView, Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { ForegroundLocationCard } from "@/components/foreground-location-card";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useGlobalLocation } from "@/lib/location-context";

export default function LocationScreen() {
  const location = useGlobalLocation();
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="位置与隐私" />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <ForegroundLocationCard controller={location} />
        <View className="mx-4 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center"><IconSymbol name="shield.fill" size={20} color="#16A34A" /><Text className="ml-2 font-semibold text-foreground">位置使用说明</Text></View>
          <Text className="mt-3 text-sm leading-6 text-muted">首页左上角是全 App 唯一全局位置入口。发现、商城、维修、捐赠和回收只读取当前城市、附近距离和服务范围，不再提供独立定位按钮。</Text>
          <Text className="mt-2 text-sm leading-6 text-muted">拒绝权限后仍可手动选择城市；永久拒绝或系统定位关闭时，可从这里打开系统设置。</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
