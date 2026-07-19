import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppTextInput, FieldLabel, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Api from "@/lib/_core/api";

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const normalizedPhone = phone.trim();
    if (!/^\+?[0-9]{6,20}$/.test(normalizedPhone)) {
      setError("请输入正确的手机号");
      return;
    }
    if (password.length < 8) {
      setError("密码至少需要8位");
      return;
    }

    try {
      setLoading(true);
      setError("");
      if (mode === "login") {
        await Api.login(normalizedPhone, password);
      } else {
        await Api.register(normalizedPhone, password, name);
      }
      router.replace("/" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View className="flex-1 px-6 pt-8 pb-10 justify-center">
            <Pressable onPress={() => router.back()} className="absolute left-5 top-4 p-2 z-10">
              <IconSymbol name="chevron.left" size={26} color="#374151" />
            </Pressable>

            <View className="items-center mb-8">
              <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4">
                <IconSymbol name="leaf.fill" size={32} color="#FFFFFF" />
              </View>
              <Text className="text-3xl font-bold text-foreground">生活帮</Text>
              <Text className="text-sm text-muted mt-2">从生活问题，到真正可用的解决方案</Text>
            </View>

            <View className="bg-surface rounded-2xl border border-border p-5">
              <Text className="text-xl font-bold text-foreground mb-1">
                {mode === "login" ? "登录账号" : "创建账号"}
              </Text>
              <Text className="text-sm text-muted mb-3">
                {mode === "login" ? "使用手机号和密码登录" : "注册后即可发布需求和管理项目"}
              </Text>

              {mode === "register" ? (
                <>
                  <FieldLabel label="昵称" />
                  <AppTextInput value={name} onChangeText={setName} placeholder="怎么称呼你" maxLength={32} />
                </>
              ) : null}

              <FieldLabel label="手机号" required />
              <AppTextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="请输入手机号"
                keyboardType="phone-pad"
                autoCapitalize="none"
              />

              <FieldLabel label="密码" required />
              <AppTextInput
                value={password}
                onChangeText={setPassword}
                placeholder="至少8位密码"
                secureTextEntry
                autoCapitalize="none"
                onSubmitEditing={submit}
              />

              {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

              <View className="mt-5">
                <PrimaryButton
                  title={mode === "login" ? "登录" : "注册并登录"}
                  onPress={submit}
                  loading={loading}
                />
              </View>

              <Pressable
                onPress={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="items-center py-4"
              >
                <Text className="text-sm text-primary">
                  {mode === "login" ? "还没有账号？立即注册" : "已经有账号？返回登录"}
                </Text>
              </Pressable>
            </View>

            <Text className="text-xs text-muted text-center mt-5 leading-5">
              登录即表示你同意《用户协议》和《隐私政策》。正式上线前需接入短信验证码与实名认证服务。
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
