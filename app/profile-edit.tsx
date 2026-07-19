import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/lib/role-context";
import { AppTextInput, FieldLabel, LoadingView, PrimaryButton } from "@/components/common";

const CITIES = ["北京", "上海", "广州", "深圳", "成都", "杭州", "武汉", "南京", "西安", "重庆", "其他"];

function ProfileEditInner() {
  const router = useRouter();
  const { refetchProfile } = useRole();
  const profileQuery = trpc.profile.me.useQuery();
  const updateMut = trpc.profile.update.useMutation({
    onSuccess: () => {
      refetchProfile();
      router.back();
    },
    onError: (e) => setError(e.message),
  });

  const [nickname, setNickname] = useState("");
  const [cityName, setCityName] = useState("北京");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const p = profileQuery.data?.profile;
    if (p) {
      setNickname(p.nickname ?? "");
      setCityName(p.cityName ?? "北京");
      setBio((p as any).bio ?? "");
    }
  }, [profileQuery.data]);

  if (profileQuery.isLoading) return <LoadingView />;

  const handleSave = () => {
    setError("");
    if (!nickname.trim()) return setError("请填写昵称");
    updateMut.mutate({ nickname: nickname.trim(), cityName, bio: bio.trim() || undefined });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <FieldLabel label="昵称" required />
        <AppTextInput placeholder="你的昵称" value={nickname} onChangeText={setNickname} maxLength={32} />

        <FieldLabel label="所在城市" required />
        <View className="flex-row flex-wrap gap-2 mt-1">
          {CITIES.map((c) => {
            const selected = cityName === c;
            return (
              <React.Fragment key={c}>
                <View
                  style={{ opacity: 1 }}
                  className={selected ? "bg-primary rounded-full px-3.5 py-1.5" : "bg-surface border border-border rounded-full px-3.5 py-1.5"}
                >
                  <Text
                    className={selected ? "text-white text-sm" : "text-foreground text-sm"}
                    onPress={() => setCityName(c)}
                  >
                    {c}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>

        <FieldLabel label="个人简介(选填)" />
        <AppTextInput
          placeholder="介绍一下自己"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={200}
        />

        {error ? <Text className="text-sm text-error mt-2">{error}</Text> : null}

        <View className="mt-5">
          <PrimaryButton title="保存" onPress={handleSave} loading={updateMut.isPending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function ProfileEditScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="编辑资料" />
      <AuthGate title="登录后编辑资料">
        <ProfileEditInner />
      </AuthGate>
    </ScreenContainer>
  );
}
