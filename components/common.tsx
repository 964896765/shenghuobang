import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { BadgeTone } from "@/lib/labels";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

const toneStyles: Record<BadgeTone, { bg: string; text: string }> = {
  gray: { bg: "#F3F4F6", text: "#6B7280" },
  green: { bg: "#DCFCE7", text: "#15803D" },
  teal: { bg: "#CCFBF1", text: "#0F766E" },
  orange: { bg: "#FFEDD5", text: "#C2410C" },
  yellow: { bg: "#FEF9C3", text: "#A16207" },
  red: { bg: "#FEE2E2", text: "#B91C1C" },
  blue: { bg: "#DBEAFE", text: "#1D4ED8" },
};

export function StatusBadge({ label, tone = "gray", small }: { label: string; tone?: BadgeTone; small?: boolean }) {
  const s = toneStyles[tone];
  return (
    <View style={[badgeStyles.badge, { backgroundColor: s.bg }, small && badgeStyles.badgeSmall]}>
      <Text style={[badgeStyles.text, { color: s.text }, small && badgeStyles.textSmall]}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  badgeSmall: { paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: "600", lineHeight: 16 },
  textSmall: { fontSize: 10, lineHeight: 14 },
});

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  variant = "primary",
  small,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "action" | "outline" | "danger" | "muted";
  small?: boolean;
}) {
  const colors = useColors();
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "action"
        ? "#F97316"
        : variant === "danger"
          ? colors.error
          : variant === "muted"
            ? "#F3F4F6"
            : "transparent";
  const textColor = variant === "outline" ? colors.primary : variant === "muted" ? "#374151" : "#FFFFFF";
  return (
    <Pressable
      onPress={() => {
        if (disabled || loading) return;
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        btnStyles.btn,
        small && btnStyles.btnSmall,
        {
          backgroundColor: bg,
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: colors.primary,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[btnStyles.text, small && btnStyles.textSmall, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const btnStyles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  text: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  textSmall: { fontSize: 13, lineHeight: 18 },
});

export function EmptyState({ title, hint, actionTitle, onAction }: { title: string; hint?: string; actionTitle?: string; onAction?: () => void }) {
  return (
    <View className="items-center py-12 px-6">
      <View className="w-14 h-14 rounded-full bg-surface items-center justify-center mb-3 border border-border">
        <IconSymbol name="cube.box.fill" size={26} color="#9CA3AF" />
      </View>
      <Text className="text-base font-semibold text-foreground mb-1">{title}</Text>
      {hint ? <Text className="text-sm text-muted text-center mb-4 leading-5">{hint}</Text> : null}
      {actionTitle && onAction ? <PrimaryButton title={actionTitle} onPress={onAction} small /> : null}
    </View>
  );
}

export function ErrorState({
  title = "加载失败",
  hint = "请检查网络连接后重试",
  onRetry,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="items-center py-12 px-6">
      <View className="w-14 h-14 rounded-full bg-red-50 items-center justify-center mb-3 border border-red-100">
        <IconSymbol name="exclamationmark.triangle.fill" size={25} color="#DC2626" />
      </View>
      <Text className="text-base font-semibold text-foreground mb-1 text-center">{title}</Text>
      <Text className="text-sm text-muted text-center mb-4 leading-5">{hint}</Text>
      {onRetry ? <PrimaryButton title="重新加载" onPress={onRetry} small variant="outline" /> : null}
    </View>
  );
}

export function SectionHeader({ title, actionTitle, onAction }: { title: string; actionTitle?: string; onAction?: () => void }) {
  return (
    <View className="flex-row items-center justify-between mb-3 mt-1">
      <Text className="text-lg font-bold text-foreground">{title}</Text>
      {actionTitle && onAction ? (
        <Pressable onPress={onAction} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text className="text-sm text-muted">{actionTitle} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AIHintBar({ text }: { text?: string }) {
  return (
    <View className="flex-row items-center bg-primary/10 rounded-lg px-3 py-2 mb-3">
      <IconSymbol name="sparkles" size={16} color="#16A34A" />
      <Text className="text-xs text-foreground ml-2 flex-1 leading-4">
        {text ?? "以下内容由AI辅助整理,请确认后再发布。"}
      </Text>
    </View>
  );
}

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text className="text-sm font-medium text-foreground mb-1.5 mt-3">
      {label}
      {required ? <Text className="text-error"> *</Text> : null}
    </Text>
  );
}

export function AppTextInput(props: React.ComponentProps<typeof TextInput>) {
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor="#9CA3AF"
      returnKeyType="done"
      {...props}
      style={[
        inputStyles.input,
        { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
        props.multiline && inputStyles.multiline,
        props.style,
      ]}
    />
  );
}

const inputStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 20,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
});

export function ChipSelector<T extends string>({
  options,
  value,
  onChange,
  multi,
  values,
  onToggle,
}: {
  options: { value: T; label: string }[];
  value?: T;
  onChange?: (v: T) => void;
  multi?: boolean;
  values?: T[];
  onToggle?: (v: T) => void;
}) {
  const colors = useColors();
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const selected = multi ? (values ?? []).includes(opt.value) : value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => (multi ? onToggle?.(opt.value) : onChange?.(opt.value))}
            style={({ pressed }) => [
              chipStyles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[chipStyles.text, { color: selected ? "#fff" : colors.foreground }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  text: { fontSize: 13, lineHeight: 18 },
});

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={dialogStyles.backdrop}>
        <View style={dialogStyles.card}>
          <Text style={dialogStyles.title}>{title}</Text>
          {message ? <Text style={dialogStyles.message}>{message}</Text> : null}
          <View style={dialogStyles.row}>
            <View style={{ flex: 1 }}>
              <PrimaryButton title={cancelText} onPress={onCancel} variant="muted" />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <PrimaryButton title={confirmText} onPress={onConfirm} variant={danger ? "danger" : "primary"} loading={loading} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dialogStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 },
  title: { fontSize: 17, fontWeight: "700", color: "#191D1B", marginBottom: 8, lineHeight: 24 },
  message: { fontSize: 14, color: "#6B7280", lineHeight: 21, marginBottom: 16 },
  row: { flexDirection: "row", marginTop: 4 },
});

export function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View className="flex-row py-1.5">
      <Text className="text-sm text-muted w-24">{label}</Text>
      <Text className="text-sm text-foreground flex-1 leading-5">{String(value)}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name?: string | null; size?: number }) {
  const initial = (name ?? "用").slice(0, 1);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#D1FAE5",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.42, fontWeight: "600", color: "#047857", lineHeight: size * 0.6 }}>{initial}</Text>
    </View>
  );
}

export function LoadingView({ text = "加载中..." }: { text?: string }) {
  const colors = useColors();
  return (
    <View className="flex-1 items-center justify-center py-16">
      <ActivityIndicator color={colors.primary} size="large" />
      <Text className="text-sm text-muted mt-3">{text}</Text>
    </View>
  );
}

export function StarRating({ value, onChange, size = 28 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <View className="flex-row gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange?.(i)} disabled={!onChange} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <IconSymbol name="star.fill" size={size} color={i <= value ? "#F59E0B" : "#E5E7EB"} />
        </Pressable>
      ))}
    </View>
  );
}
