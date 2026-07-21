import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useRole } from "@/lib/role-context";
import { startLogin } from "@/constants/app";

const PUBLISH_GROUPS = [
  {
    title: "需求与创意",
    description: "从问题、想法或专业目标出发，进入协作和项目链路。",
    entries: [
      {
        icon: "lightbulb.fill",
        title: "发布创意",
        desc: "保存草稿，设置公开、私密或 NDA 协作",
        route: "/ideas/edit",
        color: "#7C3AED",
      },
      {
        icon: "chart.bar.fill",
        title: "发起新品筹措",
        desc: "从本人需求或创意验证真实支持意向，不收取资金",
        route: "/funding/new",
        color: "#DC2626",
      },
      {
        icon: "questionmark.circle.fill",
        title: "我遇到了问题",
        desc: "描述生活中的问题，整理成清晰需求",
        route: "/needs/create?type=life",
        color: "#16A34A",
      },
      {
        icon: "lightbulb.fill",
        title: "我有一个产品想法",
        desc: "把想法变成可实现、可协作的产品需求",
        route: "/needs/create?type=product",
        color: "#F59E0B",
      },
      {
        icon: "briefcase.fill",
        title: "我需要专业服务",
        desc: "工程设计、软件开发、技术咨询等",
        route: "/needs/create?type=engineering",
        color: "#0D9488",
      },
    ],
  },
  {
    title: "物品与循环",
    description: "发布物品、赠送闲置，或发起维修和回收。",
    entries: [
      {
        icon: "tag.fill",
        title: "我想发布物品",
        desc: "一口价出售、接受报价或发起置换",
        route: "/listings/create",
        color: "#F97316",
      },
      {
        icon: "arrow.3.trianglepath",
        title: "我需要维修或回收",
        desc: "发布维修需求或让商家上门回收旧物",
        route: "/recycling/create",
        color: "#2563EB",
      },
      {
        icon: "gift.fill",
        title: "我想帮助别人",
        desc: "免费赠送物品，让闲置重新发挥价值",
        route: "/listings/create?mode=giveaway",
        color: "#DB2777",
      },
    ],
  },
] as const;

export default function PublishScreen() {
  const router = useRouter();
  const { isAuthenticated } = useRole();

  const go = (route: string) => {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    router.push(route as never);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="px-4 pt-3 pb-2">
          <Text className="text-2xl font-bold text-foreground">发布</Text>
          <Text className="text-sm text-muted mt-1">从生活问题、产品创意到物品循环，选择真实业务入口继续。</Text>
        </View>
        {PUBLISH_GROUPS.map((group) => (
          <View key={group.title} className="px-4 mt-3">
            <Text className="text-lg font-bold text-foreground">{group.title}</Text>
            <Text className="text-xs text-muted mt-1 mb-3">{group.description}</Text>
            {group.entries.map((entry) => (
              <Pressable key={entry.title} onPress={() => go(entry.route)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View className="flex-row items-center bg-surface rounded-2xl p-4 mb-3 border border-border">
                  <View style={[styles.icon, { backgroundColor: `${entry.color}18` }]}>
                    <IconSymbol name={entry.icon as never} size={24} color={entry.color} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="text-base font-semibold text-foreground">{entry.title}</Text>
                    <Text className="text-xs text-muted mt-0.5 leading-4">{entry.desc}</Text>
                  </View>
                  <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
