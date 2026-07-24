import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { PageHeader } from "@/components/auth-gate";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { getBuildInfo } from "@/lib/build-info";

const FAQS = [
  {
    q: "如何发布需求?",
    a: "点击首页底部中央「发布」按钮,选择「我遇到了问题」,按4步向导填写需求描述,AI会帮你整理结构化信息,确认后发布到需求广场。",
  },
  {
    q: "工程师如何接单?",
    a: "先在「我的」页申请工程师认证,认证通过后切换到工程师身份,在「需求大厅」浏览需求,提交方案和报价,等待用户选择。",
  },
  {
    q: "如何处理闲置物品?",
    a: "点击「发布」→「我想发布物品」,填写物品信息,选择流转方式(一口价/接受报价/免费赠送/商家回收等),发布后等待买家联系。",
  },
  {
    q: "付款安全吗?",
    a: "平台采用资金托管模式,买家付款后资金由平台托管,确认收货后才结算给卖方。如有纠纷可发起投诉,平台介入处理。",
  },
  {
    q: "如何申诉信用扣分?",
    a: "在「信用中心」查看信用记录,点击具体记录可发起申诉,平台将在3个工作日内处理。",
  },
  {
    q: "商家如何接收回收询价?",
    a: "在「我的」页申请商家入驻,入驻后切换到商家身份,在「附近询价」查看用户发布的回收需求,提交报价后等待用户选择。",
  },
];

const COMPLAINT_TYPES = [
  "虚假信息", "欺诈行为", "不履约", "物品与描述不符",
  "恶意刷单", "骚扰辱骂", "侵权内容", "其他",
];

export default function HelpScreen() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const buildInfo = getBuildInfo();

  return (
    <ScreenContainer>
      <PageHeader title="帮助与反馈" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <View className="bg-primary/5 rounded-2xl p-4 border border-primary/20 mb-4">
          <Text className="text-sm font-semibold text-foreground mb-1">联系客服</Text>
          <Text className="text-sm text-muted leading-5">
            工作时间(周一至周五 9:00-18:00)可通过消息中心联系平台客服,或发送邮件至 support@shenghuobang.com。
          </Text>
        </View>

        <Text className="text-base font-semibold text-foreground mb-2">常见问题</Text>
        {FAQS.map((faq, i) => (
          <Pressable key={i} onPress={() => setExpanded(expanded === i ? null : i)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <View className="bg-surface rounded-xl border border-border mb-2 overflow-hidden">
              <View className="flex-row items-center justify-between p-4">
                <Text className="text-sm font-medium text-foreground flex-1 mr-2">{faq.q}</Text>
                <IconSymbol name={expanded === i ? "chevron.up" : "chevron.down"} size={16} color="#9CA3AF" />
              </View>
              {expanded === i ? (
                <View className="px-4 pb-4 border-t border-border">
                  <Text className="text-sm text-muted leading-5 mt-3">{faq.a}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}

        <Text className="text-base font-semibold text-foreground mt-4 mb-2">投诉类型说明</Text>
        <View className="bg-surface rounded-xl border border-border p-4">
          <View className="flex-row flex-wrap gap-2">
            {COMPLAINT_TYPES.map((t) => (
              <View key={t} className="bg-background border border-border rounded-full px-3 py-1">
                <Text className="text-xs text-muted">{t}</Text>
              </View>
            ))}
          </View>
          <Text className="text-xs text-muted mt-3 leading-4">
            如需投诉,请在相关订单/项目详情页点击「投诉」按钮,提交证据材料,平台将在3个工作日内处理。
          </Text>
        </View>

        <View className="bg-surface rounded-xl border border-border p-4 mt-3">
          <Text className="text-sm font-semibold text-foreground mb-1">关于生活帮</Text>
          <Text className="text-sm text-muted leading-5">
            生活帮连接需求、创意、协作、生产、交易、维修、捐赠、回收与可信追溯,当前提供 V4 Alpha 可运行产品雏形。
          </Text>
          <Text className="text-xs text-muted mt-2">版本 {buildInfo.appVersion} / 包版本 {buildInfo.packageVersion}</Text>
          <Text className="text-xs text-muted mt-1">versionCode {buildInfo.versionCode} · profile {buildInfo.buildProfile} · channel {buildInfo.releaseChannel}</Text>
          <Text className="text-xs text-muted mt-1">commit {buildInfo.gitCommit.slice(0, 7)} · API {buildInfo.apiBaseUrl || "未配置"}</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
