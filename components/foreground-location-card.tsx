import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { AppTextInput, PrimaryButton } from "@/components/common";
import { useForegroundLocation } from "@/hooks/use-foreground-location";

export function ForegroundLocationCard({ compact = false, controller: location }: { compact?: boolean; controller: ReturnType<typeof useForegroundLocation> }) {
  const [manualRegion, setManualRegion] = useState(location.region ?? "");
  const [showManual, setShowManual] = useState(false);
  const [manualError, setManualError] = useState<string>();

  useEffect(() => {
    if (location.region) setManualRegion(location.region);
  }, [location.region]);

  const explainAndRequest = () => Alert.alert(
    "使用前台位置",
    "生活帮仅在你主动使用附近功能时获取一次位置，用于距离排序。不会后台持续定位，也不会向其他用户公开精确经纬度。",
    [
      { text: "暂不使用", style: "cancel" },
      { text: "继续", onPress: () => void location.request() },
    ],
  );

  const statusText = location.locationState === "success"
    ? `已按当前位置排序${location.region ? ` · ${location.region}` : ""}`
    : location.locationState === "manual"
      ? `手动地区 · ${location.region}`
      : location.permission === "services_disabled"
        ? "系统定位服务已关闭"
        : location.permission === "permanently_denied"
          ? "位置权限已永久拒绝"
          : location.permission === "denied"
            ? "位置权限已拒绝"
            : "可选：按附近距离排序";

  return (
    <View className={compact ? "mx-4 mb-2 rounded-xl border border-border bg-surface p-3" : "mx-4 mb-3 rounded-2xl border border-border bg-surface p-4"}>
      <Text className="text-sm font-semibold text-foreground">{statusText}</Text>
      <Text className="text-xs text-muted mt-1">位置失败不会影响浏览；无坐标内容继续按原排序展示。</Text>
      {location.error ? <Text className="text-xs text-error mt-2">{location.error}</Text> : null}
      <View className="flex-row flex-wrap gap-2 mt-3">
        <PrimaryButton
          small
          title={location.permission === "granted" ? "重新定位" : "启用附近定位"}
          loading={location.permission === "requesting" || location.locationState === "acquiring"}
          onPress={location.permission === "granted" ? () => void location.retry() : explainAndRequest}
        />
        <PrimaryButton small variant="outline" title="手动地区" onPress={() => setShowManual((value) => !value)} />
        {location.permission === "permanently_denied" || location.permission === "services_disabled" ? (
          <PrimaryButton small variant="outline" title="打开系统设置" onPress={() => void location.openSettings()} />
        ) : null}
      </View>
      {showManual ? (
        <View className="mt-3">
          <AppTextInput placeholder="例如：北京市海淀区" value={manualRegion} onChangeText={setManualRegion} />
          {manualError ? <Text className="text-xs text-error mt-1">{manualError}</Text> : null}
          <View className="mt-2">
            <Pressable onPress={() => void location.useManualRegion(manualRegion).then(() => {
              setManualError(undefined);
              setShowManual(false);
            }).catch((cause) => setManualError(cause instanceof Error ? cause.message : "保存失败"))}>
              <Text className="text-sm font-semibold text-primary">使用该地区</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
