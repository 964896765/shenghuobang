import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ErrorState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

function SkuManager() {
  const params = useLocalSearchParams<{ id?: string }>();
  const listingId = Number(params.id);
  const detail = trpc.commerce.listingDetail.useQuery({ listingId }, { enabled: Number.isSafeInteger(listingId) && listingId > 0 });
  const utils = trpc.useUtils();
  const link = trpc.commerce.linkListingProduct.useMutation();
  const createSku = trpc.commerce.createSku.useMutation();
  const updateSku = trpc.commerce.updateSku.useMutation();
  const [productModelId, setProductModelId] = useState("");
  const [productUnitId, setProductUnitId] = useState("");
  const [skuCode, setSkuCode] = useState("");
  const [title, setTitle] = useState("");
  const [attributes, setAttributes] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => { await Promise.all([detail.refetch(), utils.listings.detail.invalidate({ id: listingId })]); };
  const linkProduct = async () => {
    const modelId = Number(productModelId);
    const unitId = productUnitId.trim() ? Number(productUnitId) : undefined;
    if (!Number.isSafeInteger(modelId) || modelId <= 0 || (unitId !== undefined && (!Number.isSafeInteger(unitId) || unitId <= 0))) return setError("请输入有效产品型号 ID；单件产品 ID 可选");
    try {
      await link.mutateAsync({ listingId, productModelId: modelId, productUnitId: unitId, requestId: `listing-link-${listingId}-${Date.now()}` });
      setMessage("产品关联已保存"); setError(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "关联失败"); }
  };
  const addSku = async () => {
    const parsedPrice = Number(price); const parsedStock = Number(stock);
    if (!skuCode.trim() || !title.trim() || !Number.isSafeInteger(parsedPrice) || parsedPrice <= 0 || !Number.isSafeInteger(parsedStock) || parsedStock < 0) return setError("请完整填写 SKU 编码、名称、整元价格和库存");
    const parsedAttributes = Object.fromEntries(attributes.split(/[,，]/).map((entry) => entry.split(/[:：]/).map((part) => part.trim())).filter((entry) => entry.length === 2 && entry[0] && entry[1]));
    try {
      await createSku.mutateAsync({ listingId, skuCode: skuCode.trim(), title: title.trim(), attributes: parsedAttributes, price: parsedPrice, stock: parsedStock, requestId: `sku-create-${listingId}-${Date.now()}` });
      setSkuCode(""); setTitle(""); setAttributes(""); setPrice(""); setStock(""); setMessage("SKU 已创建"); setError(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建失败"); }
  };

  if (detail.isLoading) return <LoadingView />;
  if (detail.isError || !detail.data) return <ErrorState title="无法管理商品" hint={detail.error?.message} onRetry={() => detail.refetch()} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View className="rounded-2xl border border-border bg-surface p-4">
        <Text className="text-lg font-bold text-foreground">关联产品目录与护照</Text>
        <Text className="mt-1 text-xs leading-5 text-muted">服务端会验证产品可访问性；关联单件产品时必须是当前账号持有的同型号产品。</Text>
        <FieldLabel label="产品型号 ID" required /><AppTextInput value={productModelId} onChangeText={setProductModelId} keyboardType="number-pad" placeholder="例如 3" />
        <FieldLabel label="单件产品 ID（可选）" /><AppTextInput value={productUnitId} onChangeText={setProductUnitId} keyboardType="number-pad" placeholder="关联后商品可进入该产品护照" />
        <View className="mt-3"><PrimaryButton title="保存产品关联" onPress={() => void linkProduct()} loading={link.isPending} /></View>
        {detail.data.modelPublicCode ? <Text className="mt-3 text-sm text-primary">当前关联：{detail.data.productName} · {detail.data.modelPublicCode}{detail.data.unitPublicCode ? ` · ${detail.data.unitPublicCode}` : ""}</Text> : null}
      </View>
      <View className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <Text className="text-lg font-bold text-foreground">新增 SKU</Text>
        <FieldLabel label="SKU 编码" required /><AppTextInput value={skuCode} onChangeText={setSkuCode} placeholder="例如 BLACK-STD" />
        <FieldLabel label="规格名称" required /><AppTextInput value={title} onChangeText={setTitle} placeholder="例如 黑色标准版" />
        <FieldLabel label="属性" /><AppTextInput value={attributes} onChangeText={setAttributes} placeholder="颜色:黑色, 尺寸:标准" />
        <FieldLabel label="价格（整元）" required /><AppTextInput value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="299" />
        <FieldLabel label="库存" required /><AppTextInput value={stock} onChangeText={setStock} keyboardType="number-pad" placeholder="10" />
        <View className="mt-3"><PrimaryButton title="创建 SKU" onPress={() => void addSku()} loading={createSku.isPending} /></View>
      </View>
      <Text className="mb-3 mt-6 text-lg font-bold text-foreground">现有 SKU</Text>
      {detail.data.skus.map((sku) => (
        <View key={sku.id} className="mb-3 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between"><Text className="font-bold text-foreground">{sku.title}</Text><StatusBadge label={sku.status} tone={sku.status === "active" ? "green" : "gray"} /></View>
          <Text className="mt-2 text-lg font-bold text-action">¥{sku.price} · 库存 {sku.stock}</Text>
          <Text className="mt-1 text-xs text-muted">{sku.skuCode} · {Object.entries(sku.attributes).map(([key, value]) => `${key}:${value}`).join(" · ")}</Text>
          <View className="mt-3 flex-row gap-2">
            <PrimaryButton title={sku.status === "inactive" ? "上架" : "下架"} small variant="outline" loading={updateSku.isPending} onPress={() => updateSku.mutate({ skuId: sku.id, status: sku.status === "inactive" ? "active" : "inactive", requestId: `sku-status-${sku.id}-${Date.now()}` }, { onSuccess: () => void refresh(), onError: (cause) => setError(cause.message) })} />
          </View>
        </View>
      ))}
      {error ? <Text className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-error">{error}</Text> : null}
      {message ? <Text className="mt-3 text-center text-sm text-primary">{message}</Text> : null}
    </ScrollView>
  );
}

export default function ListingSkuScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="商品与 SKU" /><AuthGate title="登录后管理商品"><SkuManager /></AuthGate></ScreenContainer>;
}
