import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { parseProductLookup } from "@/shared/product-lookup";

export default function ProductPassportLookupScreen() {
  const router = useRouter();
  const [publicCode, setPublicCode] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [error, setError] = useState("");
  const lookup = trpc.productUnits.resolveLookup.useMutation({
    onSuccess: ({ publicCode: code }) => router.push(`/products/passport/${encodeURIComponent(code)}` as never),
    onError: () => setError("没有找到可公开查询的产品单元，请核对公开码或序列号。"),
  });
  const openLookup = (value: string) => {
    const normalized = parseProductLookup(value);
    if (!normalized) return;
    setError("");
    lookup.mutate({ value: normalized });
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="查询产品护照" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4">
          <Text className="text-lg font-bold text-foreground">一物一码，查看可信生命周期</Text>
          <Text className="text-sm text-muted leading-6 mt-2">
            输入产品标签、分享链接或二维码中的公开码。公开页面只展示允许公开的事件，不会泄露所有者、内部来源或序列号。
          </Text>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-sm font-semibold text-foreground">公开码、条码或二维码内容</Text>
          <TextInput
            value={publicCode}
            onChangeText={setPublicCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="可粘贴公开码、护照链接或二维码 JSON"
            placeholderTextColor="#94A3B8"
            className="border border-border rounded-xl px-4 py-3 text-foreground bg-background mt-2"
            accessibilityLabel="产品单件公开码"
          />
          <View className="mt-4">
            <PrimaryButton
              title="查看公开护照"
              disabled={!publicCode.trim()}
              loading={lookup.isPending}
              onPress={() => openLookup(publicCode)}
            />
          </View>
          <Text className="text-sm font-semibold text-foreground mt-5">产品序列号</Text>
          <TextInput value={serialNumber} onChangeText={setSerialNumber} autoCapitalize="characters" autoCorrect={false} placeholder="手动输入产品序列号" placeholderTextColor="#94A3B8" className="border border-border rounded-xl px-4 py-3 text-foreground bg-background mt-2" accessibilityLabel="产品序列号" />
          <View className="mt-4"><PrimaryButton variant="outline" title="按序列号查询" disabled={!serialNumber.trim()} loading={lookup.isPending} onPress={() => openLookup(serialNumber)} /></View>
          {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-bold text-foreground">公开护照包含什么</Text>
          <Text className="text-sm text-muted leading-6 mt-2">
            产品型号、公开状态、信任等级、生产时间，以及标记为公开的生产、维修、流转和回收事件。页面同时验证事件哈希链完整性。
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
