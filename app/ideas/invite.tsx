import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ChipSelector, FieldLabel, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { StableIdeaRequestIds, ideaErrorMessage } from "@/lib/idea-app";
import { trpc } from "@/lib/trpc";

const roles = [{ value: "designer", label: "设计师" }, { value: "engineer", label: "工程师" }, { value: "viewer", label: "受邀查看者" }] as const;

function InviteForm() {
  const router = useRouter();
  const { ideaId: rawIdeaId } = useLocalSearchParams<{ ideaId: string }>();
  const ideaId = Number(rawIdeaId);
  const utils = trpc.useUtils();
  const requests = useRef(new StableIdeaRequestIds()).current;
  const [accountId, setAccountId] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [role, setRole] = useState<"designer" | "engineer" | "viewer">("designer");
  const [message, setMessage] = useState("");
  const [ndaRequired, setNdaRequired] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState("168");
  const [error, setError] = useState("");
  const mutation = trpc.ideas.inviteCollaborator.useMutation();

  const submit = async () => {
    if (mutation.isPending) return;
    const targetAccountId = Number(accountId);
    const targetIdentityId = Number(identityId);
    const hours = Number(expiresInHours);
    if (![targetAccountId, targetIdentityId, hours].every((value) => Number.isSafeInteger(value) && value > 0)) return setError("请输入有效的账号 ID、业务身份 ID 和有效小时数。");
    const key = `invite-${ideaId}-${targetAccountId}-${targetIdentityId}-${role}`;
    try {
      await mutation.mutateAsync({ ideaId, invitedAccountId: targetAccountId, invitedIdentityId: targetIdentityId, requestedRole: role, message: message.trim() || undefined, ndaRequired, expiresAt: new Date(Date.now() + Math.min(hours, 24 * 30) * 3_600_000), requestId: requests.get(key) });
      requests.complete(key);
      await utils.ideas.listInvitations.invalidate();
      router.replace("/ideas/invitations" as never);
    } catch (cause) { setError(ideaErrorMessage(cause)); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-4"><Text className="text-sm text-foreground leading-5">账号和身份来自对方真实业务身份。服务端会再次核验归属、状态、身份类型和认证；`currentRole` 不参与授权。</Text></View>
        <View className="bg-surface border border-border rounded-2xl p-4">
          <FieldLabel label="受邀账号 ID" required /><AppTextInput value={accountId} onChangeText={setAccountId} keyboardType="number-pad" placeholder="对方账号 ID" />
          <FieldLabel label="对方有效业务身份 ID" required /><AppTextInput value={identityId} onChangeText={setIdentityId} keyboardType="number-pad" placeholder="由对方身份页提供的 ID" />
          <FieldLabel label="协作角色" required /><ChipSelector options={[...roles]} value={role} onChange={setRole} />
          <FieldLabel label="邀请消息" /><AppTextInput value={message} onChangeText={setMessage} maxLength={1000} multiline placeholder="说明希望对方参与的工作" />
          <FieldLabel label="有效小时数（最多 720）" /><AppTextInput value={expiresInHours} onChangeText={setExpiresInHours} keyboardType="number-pad" />
          <View className="mt-3"><PrimaryButton title={ndaRequired ? "需要 NDA：是" : "需要 NDA：否"} variant="outline" onPress={() => setNdaRequired((value) => !value)} /></View>
          {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
          <View className="mt-4"><PrimaryButton title="发送协作邀请" loading={mutation.isPending} disabled={mutation.isPending} onPress={submit} /></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function InviteCollaboratorScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="邀请协作者" /><AuthGate title="登录后邀请协作者"><InviteForm /></AuthGate></ScreenContainer>;
}
