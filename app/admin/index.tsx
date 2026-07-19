import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, LoadingView, PrimaryButton } from "@/components/common";
import { trpc } from "@/lib/trpc";

export default function AdminHomeScreen() {
  const router = useRouter();
  const menu = trpc.admin.menu.useQuery();
  if (menu.isLoading) return <ScreenContainer><LoadingView /></ScreenContainer>;
  if (!menu.data) return <ScreenContainer><EmptyState title="无管理端访问权限" /></ScreenContainer>;
  const permissions = new Set(menu.data.permissions);
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="管理工作台" />
      <AuthGate title="管理员登录后访问">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
          <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
            <Text className="text-lg font-bold text-foreground">当前角色：{menu.data.role}</Text>
            <Text className="text-sm text-muted mt-2">菜单和每个操作均由后端权限校验；高风险操作还需要二次确认。</Text>
          </View>
          {permissions.has("verification.read") ? <View className="mb-3"><PrimaryButton title="认证审核" onPress={() => router.push("/admin/verifications" as never)} /></View> : null}
          {permissions.has("complaint.read") ? <View className="mb-3"><PrimaryButton title="投诉处理" onPress={() => router.push("/admin/complaints" as never)} /></View> : null}
          {permissions.has("finance.read") ? <View className="mb-3"><PrimaryButton title="退款、托管与结算" onPress={() => router.push("/admin/finance" as never)} /></View> : null}
          {permissions.has("audit.read") ? <>
            <View className="mb-3"><PrimaryButton title="审计日志" variant="outline" onPress={() => router.push("/admin/audit-logs" as never)} /></View>
            <View className="mb-3"><PrimaryButton title="文件与通知运行审计" variant="outline" onPress={() => router.push("/admin/platform-operations" as never)} /></View>
          </> : null}
        </ScrollView>
      </AuthGate>
    </ScreenContainer>
  );
}
