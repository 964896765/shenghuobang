import React, { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate } from "@/components/auth-gate";
import { useRole, type AppRole } from "@/lib/role-context";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { Avatar, StatusBadge, ConfirmDialog } from "@/components/common";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { creditLevel } from "@/lib/labels";

function MenuRow({ icon, label, onPress, color = "#16A34A" }: { icon: string; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <View className="flex-row items-center px-4 py-3.5">
        <View style={[styles.menuIcon, { backgroundColor: `${color}14` }]}>
          <IconSymbol name={icon as any} size={18} color={color} />
        </View>
        <Text className="text-base text-foreground flex-1 ml-3">{label}</Text>
        <IconSymbol name="chevron.right" size={18} color="#C4C9C6" />
      </View>
    </Pressable>
  );
}

function ProfileInner() {
  const router = useRouter();
  const { role, profile, refetchProfile } = useRole();
  const { logout } = useAuth();
  const utils = trpc.useUtils();
  const certificationQuery = trpc.certification.mine.useQuery();
  const workspaceQuery = trpc.workspace.listAvailable.useQuery();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const switchRole = trpc.profile.switchRole.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.profile.invalidate(), utils.workspace.invalidate(), utils.identity.invalidate(), utils.certification.invalidate(), utils.organization.invalidate(), utils.auth.invalidate(), utils.admin.invalidate()]);
      refetchProfile();
    },
    onError: (e) => {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(e.message);
      } else {
        Alert.alert("暂时无法切换", e.message);
      }
    },
  });

  const credit = creditLevel(profile?.creditScore ?? 100);
  const engineerActive = certificationQuery.data?.some((item) => item.typeCode === "engineer_basic" && item.status === "approved" && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())) ?? false;
  const merchantActive = certificationQuery.data?.some((item) => item.typeCode === "merchant_business_license" && item.status === "approved" && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())) ?? false;
  const platformWorkspaceAvailable = workspaceQuery.data?.available.some((item) => item.workspaceType === "platform" && item.available) ?? false;

  const roleOptions: { value: AppRole; label: string; available: boolean }[] = [
    { value: "user", label: "普通用户", available: true },
    { value: "engineer", label: "工程师", available: engineerActive },
    { value: "merchant", label: "商家", available: merchantActive },
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      {/* 头部 */}
      <View className="flex-row items-center px-4 pt-4 pb-3">
        <Avatar name={profile?.nickname} size={60} />
        <View className="flex-1 ml-3">
          <Text className="text-xl font-bold text-foreground">{profile?.nickname ?? "生活帮用户"}</Text>
          <View className="flex-row items-center gap-2 mt-1.5">
            <StatusBadge label={credit.label} tone={credit.tone} small />
            <Text className="text-xs text-muted">{profile?.cityName ?? "北京"}</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push("/profile-edit" as any)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 6 })}>
          <IconSymbol name="pencil" size={20} color="#6B7280" />
        </Pressable>
      </View>

      {/* 身份切换 */}
      <View className="mx-4 bg-surface rounded-2xl border border-border p-4 mb-3">
        <Text className="text-sm font-semibold text-foreground mb-2.5">当前身份</Text>
        <View className="flex-row gap-2">
          {roleOptions.map((r) => {
            const selected = role === r.value;
            return (
              <Pressable
                key={r.value}
                onPress={() => {
                  if (selected) return;
                  if (!r.available) {
                    router.push((r.value === "engineer" ? "/engineer-apply" : "/merchant-apply") as any);
                    return;
                  }
                  switchRole.mutate({ role: r.value });
                }}
                style={({ pressed }) => [
                  styles.roleChip,
                  selected && styles.roleChipActive,
                  { opacity: pressed ? 0.75 : r.available || selected ? 1 : 0.6 },
                ]}
              >
                <Text className={selected ? "text-white text-sm font-medium" : "text-foreground text-sm"}>
                  {r.label}
                  {!r.available && r.value !== "user" ? "(未认证)" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {role === "user" && !engineerActive ? (
          <Text className="text-xs text-muted mt-2.5">成为认证工程师,接单赚取收入 → 点击上方“工程师”申请</Text>
        ) : null}
      </View>

      {/* 我的内容 */}
      <View className="mx-4 bg-surface rounded-2xl border border-border mb-3">
        <MenuRow icon="lightbulb.fill" label="我的创意" onPress={() => router.push("/ideas/mine" as any)} color="#7C3AED" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="person.2.fill" label="协作邀请" onPress={() => router.push("/ideas/invitations" as any)} color="#7C3AED" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="doc.text.fill" label="我的需求" onPress={() => router.push("/my-needs" as any)} />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="folder.fill" label="我的项目" onPress={() => router.push("/projects" as any)} color="#0D9488" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="bookmark.fill" label="我的项目意向" onPress={() => router.push("/projects/my-intentions" as any)} color="#2563EB" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="cube.box.fill" label="我的物品档案" onPress={() => router.push("/my-items" as any)} color="#F97316" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="tag.fill" label="我的发布" onPress={() => router.push("/my-listings" as any)} color="#F97316" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="arrow.3.trianglepath" label="我的置换" onPress={() => router.push("/swaps" as any)} color="#0D9488" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="cart.fill" label="我的订单" onPress={() => router.push("/orders" as any)} color="#2563EB" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="arrow.3.trianglepath" label="我的回收询价" onPress={() => router.push("/my-recycling" as any)} color="#7C3AED" />
      </View>

      {/* 服务与信用 */}
      <View className="mx-4 bg-surface rounded-2xl border border-border mb-3">
        <MenuRow icon="person.crop.circle.fill" label="身份与工作台" onPress={() => router.push("/workspaces" as any)} color="#2563EB" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="person.3.fill" label="我的组织" onPress={() => router.push("/organizations" as any)} color="#7C3AED" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="checkmark.shield.fill" label="认证中心" onPress={() => router.push("/verifications" as any)} color="#0D9488" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="shield.fill" label="信用与评价" onPress={() => router.push("/credits" as any)} />
        <View className="h-px bg-border mx-4" />
        {!engineerActive ? (
          <>
            <MenuRow icon="wrench.fill" label="申请成为工程师" onPress={() => router.push("/engineer-apply" as any)} color="#0D9488" />
            <View className="h-px bg-border mx-4" />
          </>
        ) : null}
        {!merchantActive ? (
          <>
            <MenuRow icon="storefront.fill" label="申请商家入驻" onPress={() => router.push("/merchant-apply" as any)} color="#F97316" />
            <View className="h-px bg-border mx-4" />
          </>
        ) : null}
        <MenuRow icon="exclamationmark.bubble.fill" label="投诉与争议" onPress={() => router.push("/complaints" as any)} color="#DC2626" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="questionmark.circle.fill" label="帮助与客服" onPress={() => router.push("/help" as any)} color="#6B7280" />
        <View className="h-px bg-border mx-4" />
        <MenuRow icon="bell.fill" label="通知与开发连接" onPress={() => router.push("/settings" as any)} color="#2563EB" />
        {platformWorkspaceAvailable ? (
          <>
            <View className="h-px bg-border mx-4" />
            <MenuRow icon="lock.shield.fill" label="管理工作台" onPress={() => router.push("/admin" as any)} color="#7C3AED" />
          </>
        ) : null}
      </View>

      {/* 退出 */}
      <View className="mx-4 bg-surface rounded-2xl border border-border">
        <MenuRow icon="arrow.right.square.fill" label="退出登录" color="#EF4444" onPress={() => setLogoutVisible(true)} />
      </View>

      <ConfirmDialog
        visible={logoutVisible}
        title="退出登录"
        message="退出后需要重新登录才能继续使用。确认退出吗?"
        confirmText="退出登录"
        danger
        onCancel={() => setLogoutVisible(false)}
        onConfirm={async () => {
          setLogoutVisible(false);
          await logout();
        }}
      />
    </ScrollView>
  );
}

export default function ProfileScreen() {
  return (
    <ScreenContainer>
      <AuthGate title="登录后管理你的生活帮">
        <ProfileInner />
      </AuthGate>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E9E6",
    backgroundColor: "#F6F8F6",
  },
  roleChipActive: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
});
