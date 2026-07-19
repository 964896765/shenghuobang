import { ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView } from "@/components/common";
import { trpc } from "@/lib/trpc";

export default function PlatformOperationsScreen() {
  const files = trpc.platformOperations.fileAccess.useQuery({ limit: 100 });
  const failures = trpc.platformOperations.notificationFailures.useQuery({ limit: 100 });
  if (files.isLoading || failures.isLoading) return <ScreenContainer><LoadingView /></ScreenContainer>;
  if (files.isError || failures.isError) {
    const error = files.error ?? failures.error;
    const accessDenied = error?.data?.code === "FORBIDDEN"
      || error?.message.includes("无权")
      || error?.message.includes("permission")
      || false;
    return <ScreenContainer><PageHeader title="平台运行审计" /><AuthGate title="管理员登录后访问"><ErrorState
      title={accessDenied ? "无权访问" : "平台运行数据加载失败"}
      hint={error?.message ?? "请检查网络连接后重试"}
      onRetry={() => { void files.refetch(); void failures.refetch(); }}
    /></AuthGate></ScreenContainer>;
  }
  return <ScreenContainer><PageHeader title="平台运行审计" /><AuthGate title="管理员登录后访问"><ScrollView contentContainerStyle={{ padding:16, paddingBottom:40 }}>
    <Section title="高敏文件访问记录" empty="暂无文件访问记录">
      {(files.data ?? []).map((row) => <View key={row.id} className="border-b border-border py-2"><Text className="text-sm font-medium text-foreground">{row.originalName} · {row.action}</Text><Text className="text-xs text-muted mt-1">用户#{row.userId} · {row.privacyLevel} · {row.createdAt.toLocaleString()}</Text></View>)}
    </Section>
    <Section title="通知发送失败" empty="暂无通知发送失败">
      {(failures.data ?? []).map((row) => <View key={row.id} className="border-b border-border py-2"><Text className="text-sm font-medium text-foreground">通知#{row.notificationId} · {row.provider}</Text><Text className="text-xs text-muted mt-1">{row.errorMessage || "未知错误"} · {row.createdAt.toLocaleString()}</Text></View>)}
    </Section>
  </ScrollView></AuthGate></ScreenContainer>;
}
function Section({ title, empty, children }: { title:string; empty:string; children:React.ReactNode }) {
  const hasChildren=Array.isArray(children) ? children.length>0 : Boolean(children);
  return <View className="bg-surface border border-border rounded-2xl p-4 mb-3"><Text className="text-base font-semibold text-foreground mb-2">{title}</Text>{hasChildren ? children : <EmptyState title={empty} />}</View>;
}
