import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, ErrorState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

function AddressManager() {
  const addresses = trpc.commerce.addresses.useQuery();
  const create = trpc.commerce.createAddress.useMutation();
  const remove = trpc.commerce.deleteAddress.useMutation();
  const [showForm, setShowForm] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (![recipientName, phone, province, city, district, addressLine].every((value) => value.trim())) return setError("请完整填写收件人、电话和地址");
    try {
      await create.mutateAsync({ recipientName: recipientName.trim(), phone: phone.trim(), province: province.trim(), city: city.trim(), district: district.trim(), addressLine: addressLine.trim(), isDefault: !(addresses.data?.length), requestId: `address-create-${Date.now()}` });
      setRecipientName(""); setPhone(""); setProvince(""); setCity(""); setDistrict(""); setAddressLine(""); setShowForm(false); setError(""); await addresses.refetch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
  };
  if (addresses.isLoading) return <LoadingView text="正在加载地址…" />;
  if (addresses.isError) return <ErrorState title="地址加载失败" hint={addresses.error.message} onRetry={() => addresses.refetch()} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <PrimaryButton title={showForm ? "收起新增地址" : "新增收货地址"} variant="outline" onPress={() => setShowForm((value) => !value)} />
      {showForm ? (
        <View className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <FieldLabel label="收件人" required /><AppTextInput value={recipientName} onChangeText={setRecipientName} />
          <FieldLabel label="联系电话" required /><AppTextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <FieldLabel label="省/直辖市" required /><AppTextInput value={province} onChangeText={setProvince} />
          <FieldLabel label="城市" required /><AppTextInput value={city} onChangeText={setCity} />
          <FieldLabel label="区县" required /><AppTextInput value={district} onChangeText={setDistrict} />
          <FieldLabel label="详细地址" required /><AppTextInput value={addressLine} onChangeText={setAddressLine} multiline />
          <View className="mt-3"><PrimaryButton title="保存地址" loading={create.isPending} onPress={() => void submit()} /></View>
        </View>
      ) : null}
      <Text className="mb-3 mt-6 text-lg font-bold text-foreground">我的地址</Text>
      {addresses.data?.length ? addresses.data.map((item) => (
        <View key={item.id} className="mb-3 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-2"><Text className="font-bold text-foreground">{item.recipientName}</Text>{item.isDefault ? <StatusBadge label="默认" tone="green" small /> : null}<Text className="text-sm text-muted">{item.phone}</Text></View>
          <Text className="mt-2 text-sm leading-6 text-foreground">{item.province} {item.city} {item.district} {item.addressLine}</Text>
          <View className="mt-3"><PrimaryButton title="删除" small variant="danger" loading={remove.isPending} onPress={() => remove.mutate({ addressId: item.id, requestId: `address-delete-${item.id}-${Date.now()}` }, { onSuccess: () => void addresses.refetch(), onError: (cause) => setError(cause.message) })} /></View>
        </View>
      )) : <EmptyState title="还没有收货地址" hint="结算商品前需要保存一个地址。" />}
      {error ? <Text className="mt-3 text-sm text-error">{error}</Text> : null}
    </ScrollView>
  );
}

export default function AddressesScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="地址管理" /><AuthGate title="登录后管理地址"><AddressManager /></AuthGate></ScreenContainer>;
}
