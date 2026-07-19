import React, { useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";

import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  MAX_LISTING_IMAGES,
  type ListingImageDraft,
  validateListingImage,
} from "@/lib/listing-images";
import { mediaPermissionGuidance } from "@/lib/media-permissions";

function imageMimeType(name: string, provided?: string | null) {
  if (provided) return provided.toLowerCase();
  const extension = name.split(".").pop()?.toLowerCase();
  return extension === "png" ? "image/png"
    : extension === "webp" ? "image/webp"
      : extension === "gif" ? "image/gif"
        : "image/jpeg";
}

async function showPermissionGuidance(permission: ImagePicker.MediaLibraryPermissionResponse, onError: (message: string) => void) {
  const guidance = mediaPermissionGuidance(permission);
  if (guidance.allowed) return true;
  onError(guidance.message);
  if (Platform.OS !== "web") {
    Alert.alert("需要相册权限", guidance.message, [
      { text: "暂不开启", style: "cancel" },
      ...(guidance.shouldOpenSettings ? [{ text: "前往系统设置", onPress: () => void Linking.openSettings() }] : []),
    ]);
  }
  return false;
}

export function ListingImage({ uri, className }: { uri?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View className={`${className ?? ""} bg-surface border border-border items-center justify-center`}>
        <IconSymbol name="camera.fill" size={24} color="#9CA3AF" />
        <Text className="text-[10px] text-muted mt-1">暂无图片</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      className={className}
      contentFit="cover"
      transition={150}
      onError={() => setFailed(true)}
      accessibilityLabel="物品图片"
    />
  );
}

export function ListingImagePicker({
  images,
  onChange,
  disabled,
  onError,
}: {
  images: ListingImageDraft[];
  onChange: (images: ListingImageDraft[]) => void;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const pickImages = async () => {
    try {
      onError("");
      const remaining = MAX_LISTING_IMAGES - images.length;
      if (remaining <= 0) throw new Error(`每件物品最多上传 ${MAX_LISTING_IMAGES} 张图片`);

      const assets: { uri: string; name: string; mimeType: string; size: number }[] = [];
      if (Platform.OS === "web") {
        const result = await DocumentPicker.getDocumentAsync({
          type: [...new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])],
          copyToCacheDirectory: true,
          multiple: true,
        });
        if (result.canceled) return;
        for (const asset of result.assets) {
          assets.push({ uri: asset.uri, name: asset.name, mimeType: imageMimeType(asset.name, asset.mimeType), size: asset.size ?? 0 });
        }
      } else {
        let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!permission.granted) permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!(await showPermissionGuidance(permission, onError))) return;
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: remaining,
          quality: 1,
        });
        if (result.canceled) return;
        for (const [index, asset] of result.assets.entries()) {
          const name = asset.fileName ?? `listing-${Date.now()}-${index}.jpg`;
          const info = asset.fileSize ? null : await FileSystem.getInfoAsync(asset.uri);
          const size = asset.fileSize ?? (info?.exists && "size" in info ? Number(info.size) : 0);
          assets.push({ uri: asset.uri, name, mimeType: imageMimeType(name, asset.mimeType), size });
        }
      }

      const selected: ListingImageDraft[] = [];
      for (const asset of assets.slice(0, remaining)) {
        const validationError = validateListingImage(asset);
        if (validationError) throw new Error(`${asset.name}：${validationError}`);
        selected.push({
          key: `local-${Date.now()}-${selected.length}-${asset.name}`,
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType!,
          size: asset.size!,
        });
      }
      onChange([...images, ...selected]);
      if (assets.length > remaining) onError(`每件物品最多上传 ${MAX_LISTING_IMAGES} 张，已保留本次选择的前 ${remaining} 张`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "选择图片失败，请重试");
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
        {images.map((image, index) => (
          <View key={image.key} className="w-24">
            <ListingImage uri={image.uri} className="w-24 h-24 rounded-xl" />
            <View className="flex-row justify-between mt-1">
              <Pressable disabled={disabled || index === 0} onPress={() => move(index, -1)} className="p-1">
                <IconSymbol name="chevron.left" size={15} color={index === 0 ? "#D1D5DB" : "#6B7280"} />
              </Pressable>
              <Pressable disabled={disabled} onPress={() => onChange(images.filter((item) => item.key !== image.key))} className="p-1">
                <IconSymbol name="trash.fill" size={15} color="#DC2626" />
              </Pressable>
              <Pressable disabled={disabled || index === images.length - 1} onPress={() => move(index, 1)} className="p-1">
                <IconSymbol name="chevron.right" size={15} color={index === images.length - 1 ? "#D1D5DB" : "#6B7280"} />
              </Pressable>
            </View>
          </View>
        ))}
        {images.length < MAX_LISTING_IMAGES ? (
          <Pressable disabled={disabled} onPress={pickImages} style={({ pressed }) => ({ opacity: pressed ? 0.7 : disabled ? 0.45 : 1 })}>
            <View className="w-24 h-24 rounded-xl bg-surface border border-dashed border-border items-center justify-center">
              <IconSymbol name="plus" size={22} color="#16A34A" />
              <Text className="text-xs text-primary mt-1">添加图片</Text>
            </View>
          </Pressable>
        ) : null}
      </ScrollView>
      <Text className="text-xs text-muted mt-1">最多 6 张，支持 JPG/PNG/WebP/GIF，单张不超过 8MB；可调整顺序。</Text>
    </View>
  );
}
