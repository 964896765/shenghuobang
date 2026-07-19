import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBadge, Avatar } from "@/components/common";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ListingImage } from "@/components/listing-images";
import { listingImageUrl } from "@/lib/listing-images";
import {
  NEED_STATUS,
  LISTING_STATUS,
  needTypeLabel,
  modeLabel,
  formatTime,
} from "@/lib/labels";

type NeedLike = {
  id: number;
  title: string;
  needType: string;
  status: string;
  cityName: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  supportCount: number;
  createdAt: Date | string;
  visibility?: string;
  distanceLabel?: string | null;
};

export function NeedCard({ need }: { need: NeedLike }) {
  const router = useRouter();
  const st = NEED_STATUS[need.status] ?? { label: need.status, tone: "gray" as const };
  const isPrivate = need.visibility === "private";
  const budget =
    need.budgetMin || need.budgetMax
      ? `预算 ¥${need.budgetMin ?? 0}${need.budgetMax ? ` - ¥${need.budgetMax}` : "起"}`
      : "预算待定";
  return (
    <Pressable
      onPress={() => router.push(`/needs/${need.id}` as any)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
        <View className="flex-row items-center justify-between mb-2">
          <StatusBadge label={st.label} tone={st.tone} small />
          <Text className="text-xs text-muted">{formatTime(need.createdAt)}</Text>
        </View>
        <Text className="text-base font-semibold text-foreground mb-2 leading-6" numberOfLines={2}>
          {isPrivate ? "[保密需求] " : ""}
          {need.title}
        </Text>
        <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1">
          <Text className="text-xs text-accent font-medium">{needTypeLabel(need.needType)}</Text>
          <Text className="text-xs text-muted">{budget}</Text>
          <View className="flex-row items-center">
            <IconSymbol name="mappin.circle.fill" size={12} color="#9CA3AF" />
            <Text className="text-xs text-muted ml-0.5">{need.cityName ?? "不限"}</Text>
          </View>
          {need.distanceLabel ? <Text className="text-xs text-primary font-medium">{need.distanceLabel}</Text> : null}
          {need.supportCount > 0 ? (
            <View className="flex-row items-center">
              <IconSymbol name="hand.thumbsup.fill" size={12} color="#9CA3AF" />
              <Text className="text-xs text-muted ml-0.5">{need.supportCount}人也需要</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

type EngineerLike = {
  userId: number;
  nickname?: string | null;
  realName?: string | null;
  professionalTitle: string | null;
  primaryCategory: string | null;
  skills?: string[] | null;
  rating: number;
  startingPrice: number | null;
  verificationLevel: string;
  completedProjects: number | null;
  cityName?: string | null;
  distanceLabel?: string | null;
};

export function EngineerCard({ engineer }: { engineer: EngineerLike }) {
  const router = useRouter();
  const name = engineer.nickname ?? engineer.realName ?? "工程师";
  return (
    <Pressable
      onPress={() => router.push(`/engineers/${engineer.userId}` as any)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
        <View className="flex-row items-center">
          <Avatar name={name} size={44} />
          <View className="flex-1 ml-3">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-semibold text-foreground">{name}</Text>
              {engineer.verificationLevel !== "none" ? (
                <View className="flex-row items-center">
                  <IconSymbol name="checkmark.seal.fill" size={14} color="#0D9488" />
                  <Text className="text-xs text-accent ml-0.5">
                    {engineer.verificationLevel === "professional" ? "专业认证" : "基础认证"}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>
              {engineer.professionalTitle ?? engineer.primaryCategory ?? ""}
            </Text>
          </View>
          <View className="items-end">
            <View className="flex-row items-center">
              <IconSymbol name="star.fill" size={13} color="#F59E0B" />
              <Text className="text-sm font-semibold text-foreground ml-0.5">{(engineer.rating / 10).toFixed(1)}</Text>
            </View>
            <Text className="text-xs text-muted mt-0.5">
              {engineer.startingPrice ? `¥${engineer.startingPrice}起` : "价格面议"}
            </Text>
            {engineer.distanceLabel ? <Text className="text-xs text-primary mt-0.5">{engineer.distanceLabel}</Text> : null}
          </View>
        </View>
        {(engineer.skills ?? []).length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5 mt-2.5">
            {(engineer.skills ?? []).slice(0, 4).map((s) => (
              <View key={s} className="bg-background rounded-md px-2 py-0.5">
                <Text className="text-xs text-muted">{s}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

type ListingLike = {
  id: number;
  title: string;
  category: string | null;
  conditionLevel: string | null;
  price: number | null;
  primaryMode: string;
  status: string;
  cityName: string | null;
  createdAt: Date | string;
  imageUrls?: string[] | null;
  distanceLabel?: string | null;
};

export function ListingCard({ listing, onPress }: { listing: ListingLike; onPress?: () => void }) {
  const router = useRouter();
  const st = LISTING_STATUS[listing.status] ?? { label: listing.status, tone: "gray" as const };
  const priceText =
    listing.primaryMode === "giveaway"
      ? "免费赠送"
      : listing.primaryMode === "recycle"
        ? "回收询价"
        : listing.price
          ? `¥${listing.price}`
          : "可议价";
  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/listings/${listing.id}` as any))}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
        <View className="flex-row gap-3">
          <ListingImage uri={listing.imageUrls?.[0] ? listingImageUrl(listing.imageUrls[0]) : undefined} className="w-24 h-24 rounded-xl" />
          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-1.5">
              <StatusBadge label={st.label} tone={st.tone} small />
              <Text className="text-xs text-muted">{formatTime(listing.createdAt)}</Text>
            </View>
            <Text className="text-base font-semibold text-foreground leading-6" numberOfLines={2}>
              {listing.title}
            </Text>
            <View className="flex-row items-center flex-wrap gap-x-2 mt-1">
              <Text className="text-xs text-muted">{listing.category}</Text>
              <Text className="text-xs text-muted">·</Text>
              <Text className="text-xs text-muted">{listing.conditionLevel}</Text>
              <Text className="text-xs text-muted">·</Text>
              <Text className="text-xs text-accent">{modeLabel(listing.primaryMode)}</Text>
            </View>
            <Text
              className={listing.primaryMode === "giveaway" ? "text-base font-bold text-primary mt-2" : "text-base font-bold text-action mt-2"}
            >
              {priceText}
            </Text>
            {listing.distanceLabel ? <Text className="text-xs text-primary mt-1">{listing.distanceLabel}</Text> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
