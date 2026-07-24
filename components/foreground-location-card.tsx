import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { AppTextInput, PrimaryButton, StatusBadge } from "@/components/common";
import { useForegroundLocation } from "@/hooks/use-foreground-location";
import { formatLocationPreferenceError } from "@/shared/location";

export function ForegroundLocationCard({ compact = false, controller: location }: { compact?: boolean; controller: ReturnType<typeof useForegroundLocation> }) {
  const [manualRegion, setManualRegion] = useState(location.region ?? "");
  const [showManual, setShowManual] = useState(false);
  const [manualError, setManualError] = useState<string>();

  useEffect(() => { if (location.region) setManualRegion(location.region); }, [location.region]);

  const busy = location.permission === "requesting" || location.locationState === "acquiring";
  const state = busy ? "定位中" : location.region ? `当前城市：${location.region}` : location.locationState === "failed" ? "定位失败" : "尚未选择位置";
  const openSystemSettings = location.permission === "permanently_denied" || location.permission === "services_disabled";
  const explainAndRequest = () => Alert.alert(
    "使用前台位置",
    "生活帮仅在你主动使用附近功能时获取一次位置，用于距离排序，不会在后台持续定位。",
    [
      { text: "暂不使用", style: "cancel" },
      { text: "继续", onPress: () => void location.request() },
    ],
  );

  return (
    <View className={compact ? "mx-4 mb-2 rounded-xl border border-border bg-surface p-3" : "mx-4 mb-3 rounded-2xl border border-border bg-surface p-4"}>
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-foreground">{state}</Text>
        <StatusBadge label={location.locationState === "success" ? "设备定位" : location.locationState === "manual" ? "手动选择" : "未定位"} tone={location.region ? "green" : "gray"} small />
      </View>
      <Text className="mt-2 text-xs leading-5 text-muted">仅在你主动操作时获取前台位置；附近频道复用此状态，不会重复申请权限。</Text>
      {location.error ? <Text className="mt-2 text-xs text-error">{location.error}</Text> : null}
      <View className="mt-3 flex-row flex-wrap gap-2">
        <PrimaryButton small title={location.permission === "granted" ? "重新定位" : "开启位置权限"} loading={busy} onPress={location.permission === "granted" ? () => void location.retry() : explainAndRequest} />
        <PrimaryButton small variant="outline" title="手动选择" onPress={() => setShowManual((value) => !value)} />
        {openSystemSettings ? <PrimaryButton small variant="outline" title="系统设置" onPress={() => void location.openSettings()} /> : null}
      </View>
      {showManual ? (
        <View className="mt-3">
          <AppTextInput placeholder="输入城市或地区，例如：杭州市" value={manualRegion} onChangeText={setManualRegion} />
          {manualError ? <Text className="mt-1 text-xs text-error">{manualError}</Text> : null}
          <Pressable className="mt-3" onPress={() => void location.useManualRegion(manualRegion).then(() => { setManualError(undefined); setShowManual(false); }).catch((cause) => setManualError(formatLocationPreferenceError(cause)))}>
            <Text className="font-semibold text-primary">使用该城市</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
