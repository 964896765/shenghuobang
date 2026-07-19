import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, Avatar, ChipSelector, EmptyState, ErrorState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { StableIdeaRequestIds, effectiveInvitationStatus, ideaErrorMessage } from "@/lib/idea-app-contract";
import {
  IDEA_INVITATION_LABELS,
  type IdeaCollaboratorSearchItem,
} from "@/lib/idea-app";
import { trpc } from "@/lib/trpc";

const roles = [{ value: "designer", label: "设计师" }, { value: "engineer", label: "工程师" }, { value: "viewer", label: "受邀查看者" }] as const;

type SentInvitationRow = {
  id: number;
  requestedRole: "designer" | "engineer" | "viewer";
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  expiresAt: Date | string;
};

function mergeSearchItems(current: readonly IdeaCollaboratorSearchItem[], next: readonly IdeaCollaboratorSearchItem[]) {
  const merged = new Map(current.map((item) => [item.invitationTargetToken, item]));
  next.forEach((item) => merged.set(item.invitationTargetToken, item));
  return [...merged.values()];
}

function InviteForm() {
  const { ideaId: rawIdeaId } = useLocalSearchParams<{ ideaId: string }>();
  const ideaId = Number(rawIdeaId);
  const utils = trpc.useUtils();
  const requests = useRef(new StableIdeaRequestIds()).current;
  const [role, setRole] = useState<"designer" | "engineer" | "viewer">("designer");
  const [query, setQuery] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [message, setMessage] = useState("");
  const [ndaRequired, setNdaRequired] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState("168");
  const [error, setError] = useState("");
  const [selectedToken, setSelectedToken] = useState("");
  const [additional, setAdditional] = useState<IdeaCollaboratorSearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const mutation = trpc.ideas.inviteCollaborator.useMutation();
  const sentInvitations = trpc.ideas.listInvitations.useQuery({ direction: "sent", ideaId, limit: 50 }, { enabled: Number.isSafeInteger(ideaId) && ideaId > 0 });
  const normalizedQuery = query.trim();
  const normalizedCityCode = cityCode.trim();
  const normalizedCategoryCode = categoryCode.trim();
  const canSearch = normalizedQuery.length >= 2;
  const search = trpc.ideas.searchCollaborators.useQuery({
    ideaId,
    query: normalizedQuery,
    requestedRole: role,
    cityCode: normalizedCityCode || undefined,
    categoryCode: normalizedCategoryCode || undefined,
    limit: 10,
  }, {
    enabled: Number.isSafeInteger(ideaId) && ideaId > 0 && canSearch,
  });

  useEffect(() => {
    setAdditional([]);
    setNextCursor(null);
    setSelectedToken("");
  }, [normalizedQuery, normalizedCityCode, normalizedCategoryCode, role]);

  useEffect(() => {
    setNextCursor(search.data?.nextCursor ?? null);
  }, [search.data?.nextCursor]);

  const rows = useMemo(
    () => mergeSearchItems(search.data?.items ?? [], additional),
    [search.data?.items, additional],
  );
  const selectedCandidate = rows.find((item) => item.invitationTargetToken === selectedToken) ?? null;

  const submit = async () => {
    if (mutation.isPending) return;
    const hours = Number(expiresInHours);
    if (!selectedToken) return setError("请先从搜索结果中选择一位协作者。");
    if (!Number.isSafeInteger(hours) || hours <= 0) return setError("请输入有效的邀请有效小时数。");
    const key = `invite-${ideaId}-${role}-${selectedToken.slice(0, 18)}`;
    try {
      await mutation.mutateAsync({
        ideaId,
        invitationTargetToken: selectedToken,
        requestedRole: role,
        message: message.trim() || undefined,
        ndaRequired,
        expiresAt: new Date(Date.now() + Math.min(hours, 24 * 30) * 3_600_000),
        requestId: requests.get(key),
      });
      requests.complete(key);
      setError("");
      setSelectedToken("");
      setMessage("");
      await Promise.all([
        utils.ideas.listInvitations.invalidate({ direction: "sent", ideaId, limit: 50 }),
        utils.ideas.searchCollaborators.invalidate(),
      ]);
    } catch (cause) { setError(ideaErrorMessage(cause)); }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore || !canSearch) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await utils.client.ideas.searchCollaborators.query({
        ideaId,
        query: normalizedQuery,
        requestedRole: role,
        cityCode: normalizedCityCode || undefined,
        categoryCode: normalizedCategoryCode || undefined,
        limit: 10,
        cursor: nextCursor,
      });
      setAdditional((current) => mergeSearchItems(current, page.items));
      setNextCursor(page.nextCursor ?? null);
    } catch (cause) {
      setError(ideaErrorMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-4">
          <Text className="text-sm text-foreground leading-5">
            只搜索公开业务身份资料。候选 token 仅保存在当前页面内存中，10 分钟内有效，且绑定当前账号、当前创意和当前协作角色。
          </Text>
        </View>
        <View className="bg-surface border border-border rounded-2xl p-4">
          <FieldLabel label="搜索协作者" required />
          <AppTextInput value={query} onChangeText={setQuery} maxLength={50} placeholder="至少输入 2 个字符，不支持手机号、邮箱或证件号" />
          <FieldLabel label="协作角色" required />
          <ChipSelector options={[...roles]} value={role} onChange={setRole} />
          <FieldLabel label="城市编码（可选）" />
          <AppTextInput value={cityCode} onChangeText={setCityCode} maxLength={32} placeholder="如：beijing" />
          <FieldLabel label="分类编码（可选）" />
          <AppTextInput value={categoryCode} onChangeText={setCategoryCode} maxLength={64} placeholder="如：industrial-design" />
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-semibold text-foreground">候选协作者</Text>
          <Text className="text-xs text-muted mt-1">只显示 active 账号、active 身份和公开资料；工程师与设计师会实时核验身份类型与认证状态。</Text>
          {!canSearch ? (
            <EmptyState title="输入至少 2 个字符开始搜索" hint="支持姓名、头衔、技能、分类和城市关键词。" />
          ) : search.isLoading ? (
            <LoadingView text="正在搜索公开协作者…" />
          ) : search.isError ? (
            <ErrorState title="无法搜索协作者" hint={ideaErrorMessage(search.error)} onRetry={() => search.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="没有匹配的公开协作者" hint="换个关键词，或调整城市和分类筛选。" />
          ) : (
            <>
              {rows.map((candidate) => {
                const selected = candidate.invitationTargetToken === selectedToken;
                return (
                  <Pressable
                    key={candidate.invitationTargetToken}
                    onPress={() => {
                      setSelectedToken(candidate.invitationTargetToken);
                      setError("");
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
                  >
                    <View className={selected ? "bg-primary/5 border border-primary rounded-2xl p-4 mt-3" : "bg-background border border-border rounded-2xl p-4 mt-3"}>
                      <View className="flex-row items-start gap-3">
                        <Avatar name={candidate.displayName} size={44} />
                        <View className="flex-1">
                          <View className="flex-row items-center justify-between gap-2">
                            <Text className="text-base font-semibold text-foreground flex-1">{candidate.displayName}</Text>
                            {candidate.certificationBadge ? <StatusBadge label={candidate.certificationBadge} tone="green" small /> : null}
                          </View>
                          <Text className="text-sm text-muted mt-1">{candidate.identityType}{candidate.professionalTitle ? ` · ${candidate.professionalTitle}` : ""}</Text>
                          {candidate.publicCategory ? <Text className="text-xs text-muted mt-2">分类：{candidate.publicCategory}</Text> : null}
                          {candidate.cityName ? <Text className="text-xs text-muted mt-1">城市：{candidate.cityName}</Text> : null}
                          {candidate.publicSkills?.length ? <Text className="text-xs text-primary mt-2">{candidate.publicSkills.join(" · ")}</Text> : null}
                          {selected ? <Text className="text-xs text-primary mt-2">已选中，发送邀请时不会暴露账号 ID 或身份 ID。</Text> : null}
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
              {nextCursor ? (
                <View className="mt-4">
                  <PrimaryButton title={loadingMore ? "加载中…" : "加载更多候选"} variant="outline" loading={loadingMore} disabled={loadingMore} onPress={loadMore} />
                </View>
              ) : null}
            </>
          )}
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-semibold text-foreground">邀请设置</Text>
          {selectedCandidate ? (
            <View className="bg-primary/5 border border-primary/20 rounded-2xl p-3 mt-3">
              <Text className="text-sm font-semibold text-foreground">当前已选：{selectedCandidate.displayName}</Text>
              <Text className="text-xs text-muted mt-1">{selectedCandidate.identityType}{selectedCandidate.professionalTitle ? ` · ${selectedCandidate.professionalTitle}` : ""}</Text>
            </View>
          ) : (
            <Text className="text-sm text-muted mt-3">请先从上方候选中选择一位协作者。</Text>
          )}
          <FieldLabel label="邀请消息" />
          <AppTextInput value={message} onChangeText={setMessage} maxLength={1000} multiline placeholder="说明希望对方参与的工作" />
          <FieldLabel label="有效小时数（最多 720）" />
          <AppTextInput value={expiresInHours} onChangeText={setExpiresInHours} keyboardType="number-pad" />
          <View className="mt-3"><PrimaryButton title={ndaRequired ? "需要 NDA：是" : "需要 NDA：否"} variant="outline" onPress={() => setNdaRequired((value) => !value)} /></View>
          {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
          <View className="mt-4"><PrimaryButton title="发送协作邀请" loading={mutation.isPending} disabled={mutation.isPending || !selectedToken} onPress={submit} /></View>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-semibold text-foreground">已发出的邀请</Text>
          {sentInvitations.isLoading ? (
            <LoadingView text="正在刷新邀请状态…" />
          ) : sentInvitations.isError ? (
            <ErrorState title="无法加载已发出邀请" hint={ideaErrorMessage(sentInvitations.error)} onRetry={() => sentInvitations.refetch()} />
          ) : !(sentInvitations.data?.length) ? (
            <EmptyState title="当前创意还没有发出邀请" />
          ) : (
            <View className="mt-3">
              {(sentInvitations.data as SentInvitationRow[]).slice(0, 6).map((item) => {
                const status = effectiveInvitationStatus(item.status, item.expiresAt);
                return (
                  <View key={item.id} className="bg-background border border-border rounded-2xl p-3 mb-3">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="text-sm text-foreground">角色：{item.requestedRole}</Text>
                      <StatusBadge label={IDEA_INVITATION_LABELS[status]} tone={status === "accepted" ? "green" : status === "pending" ? "blue" : status === "expired" ? "red" : "gray"} small />
                    </View>
                    <Text className="text-xs text-muted mt-2">有效期至 {new Date(item.expiresAt).toLocaleString()}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function InviteCollaboratorScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="邀请协作者" /><AuthGate title="登录后邀请协作者"><InviteForm /></AuthGate></ScreenContainer>;
}
