import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

function Cart() {
  const router = useRouter();
  const cart = trpc.commerce.cart.useQuery();
  const addresses = trpc.commerce.addresses.useQuery();
  const update = trpc.commerce.updateCartItem.useMutation();
  const remove = trpc.commerce.removeCartItem.useMutation();
  const checkout = trpc.commerce.checkout.useMutation();
  const [addressId, setAddressId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const refresh = async () => { await cart.refetch(); };
  if (cart.isLoading || addresses.isLoading) return <LoadingView text="正在加载购物车…" />;
  if (cart.isError) return <ErrorState title="购物车加载失败" hint={cart.error.message} onRetry={() => cart.refetch()} />;
  const selectedAddressId = addressId ?? addresses.data?.find((item) => item.isDefault)?.id ?? addresses.data?.[0]?.id;
  const submit = async () => {
    if (!selectedAddressId) return router.push("/addresses" as never);
    try {
      const result = await checkout.mutateAsync({ addressId: selectedAddressId, requestId: `checkout-${cart.data?.cartId}-${Date.now()}` });
      router.replace(`/orders/${result.orderId}` as never);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "结算失败"); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {cart.data?.items.length ? cart.data.items.map(({ cartItem, sku, listing, modelPublicCode }) => (
        <View key={cartItem.id} className="mb-3 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between"><StatusBadge label={sku.status === "active" ? `库存 ${sku.stock}` : "不可购买"} tone={sku.status === "active" ? "green" : "red"} small /><Text className="text-xs text-muted">{listing.title}</Text></View>
          <Text className="mt-2 text-lg font-bold text-foreground">{sku.title}</Text>
          <Text className="mt-1 text-lg font-bold text-action">¥{sku.price} × {cartItem.quantity}</Text>
          {modelPublicCode ? <Pressable onPress={() => router.push(`/products/${modelPublicCode}` as never)}><Text className="mt-2 text-xs text-primary">查看关联产品</Text></Pressable> : null}
          <View className="mt-3 flex-row items-center gap-2">
            <PrimaryButton title="−" small variant="muted" disabled={cartItem.quantity <= 1} onPress={() => update.mutate({ itemId: cartItem.id, quantity: Math.max(1, cartItem.quantity - 1), requestId: `cart-update-${cartItem.id}-${Date.now()}` }, { onSuccess: () => void refresh(), onError: (cause) => setError(cause.message) })} />
            <Text className="font-bold text-foreground">{cartItem.quantity}</Text>
            <PrimaryButton title="+" small variant="muted" disabled={cartItem.quantity >= sku.stock} onPress={() => update.mutate({ itemId: cartItem.id, quantity: cartItem.quantity + 1, requestId: `cart-update-${cartItem.id}-${Date.now()}` }, { onSuccess: () => void refresh(), onError: (cause) => setError(cause.message) })} />
            <View className="flex-1" /><PrimaryButton title="删除" small variant="danger" onPress={() => remove.mutate({ itemId: cartItem.id, requestId: `cart-remove-${cartItem.id}-${Date.now()}` }, { onSuccess: () => void refresh(), onError: (cause) => setError(cause.message) })} />
          </View>
        </View>
      )) : <EmptyState title="购物车是空的" hint="从关联产品的商品页选择 SKU 加入购物车。" actionTitle="去商城" onAction={() => router.push("/products" as never)} />}

      {cart.data?.items.length ? (
        <View className="mt-3 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between"><Text className="text-lg font-bold text-foreground">配送地址</Text><Pressable onPress={() => router.push("/addresses" as never)}><Text className="text-sm text-primary">管理地址</Text></Pressable></View>
          {addresses.data?.length ? addresses.data.map((item) => (
            <Pressable key={item.id} onPress={() => setAddressId(item.id)} className={`mt-2 rounded-xl border p-3 ${selectedAddressId === item.id ? "border-primary bg-primary/10" : "border-border"}`}>
              <Text className="font-semibold text-foreground">{item.recipientName} {item.phone}</Text><Text className="mt-1 text-xs text-muted">{item.province}{item.city}{item.district}{item.addressLine}</Text>
            </Pressable>
          )) : <EmptyState title="还没有地址" actionTitle="新增地址" onAction={() => router.push("/addresses" as never)} />}
          <View className="mt-5 flex-row items-center justify-between"><View><Text className="text-sm text-muted">共 {cart.data.totalQuantity} 件</Text><Text className="text-2xl font-bold text-action">¥{cart.data.totalAmount}</Text></View><PrimaryButton title="创建订单" variant="action" loading={checkout.isPending} onPress={() => void submit()} /></View>
        </View>
      ) : null}
      {error ? <Text className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-error">{error}</Text> : null}
    </ScrollView>
  );
}

export default function CartScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="购物车" /><AuthGate title="登录后使用购物车"><Cart /></AuthGate></ScreenContainer>;
}
