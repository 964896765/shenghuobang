import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertFundingCampaignTransition,
  FundingCampaignServiceError,
} from "../server/services/funding-campaign-service";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V4 新品筹措状态机", () => {
  it("允许草稿、审核、公开与终态的合法迁移", () => {
    expect(() => assertFundingCampaignTransition("draft", "reviewing")).not.toThrow();
    expect(() => assertFundingCampaignTransition("reviewing", "draft")).not.toThrow();
    expect(() => assertFundingCampaignTransition("draft", "active")).not.toThrow();
    expect(() => assertFundingCampaignTransition("active", "succeeded")).not.toThrow();
    expect(() => assertFundingCampaignTransition("active", "failed")).not.toThrow();
    expect(() => assertFundingCampaignTransition("active", "cancelled")).not.toThrow();
    expect(() => assertFundingCampaignTransition("active", "closed")).not.toThrow();
  });

  it("拒绝公开活动回退为草稿或终态恢复", () => {
    expect(() => assertFundingCampaignTransition("active", "draft")).toThrow("RESOURCE_STATE_FORBIDDEN");
    expect(() => assertFundingCampaignTransition("succeeded", "active")).toThrow("RESOURCE_STATE_FORBIDDEN");
    try {
      assertFundingCampaignTransition("failed", "draft");
    } catch (cause) {
      expect(cause).toBeInstanceOf(FundingCampaignServiceError);
      expect((cause as FundingCampaignServiceError).code).toBe("RESOURCE_STATE_FORBIDDEN");
    }
  });

  it("将同状态请求视为可幂等重放的空操作", () => {
    expect(() => assertFundingCampaignTransition("active", "active")).not.toThrow();
  });
});

describe("V4 新品筹措存储与安全合约", () => {
  it("迁移包含活动、支持意向、追加事件与关键唯一约束", () => {
    const migration = source("drizzle/0034_v4_funding_campaigns.sql");
    expect(migration).toContain("CREATE TABLE `funding_campaigns`");
    expect(migration).toContain("CREATE TABLE `funding_pledges`");
    expect(migration).toContain("CREATE TABLE `funding_campaign_events`");
    expect(migration).toContain("CONSTRAINT `funding_campaigns_active_source_uq` UNIQUE");
    expect(migration).toContain("CONSTRAINT `funding_campaigns_created_request_uq` UNIQUE");
    expect(migration).toContain("CONSTRAINT `funding_pledges_active_dedupe_uq` UNIQUE");
    expect(migration).toContain("CONSTRAINT `funding_campaign_events_request_uq` UNIQUE");
    expect(migration).toContain("CONSTRAINT `funding_campaign_events_campaign_sequence_uq` UNIQUE");
    expect(migration).toContain("'funding_campaign'");
  });

  it("支持意向只记录数量和说明，不建立支付、价格或投资字段", () => {
    const migration = source("drizzle/0034_v4_funding_campaigns.sql");
    const pledgeTable = migration.slice(
      migration.indexOf("CREATE TABLE `funding_pledges`"),
      migration.indexOf("CREATE INDEX `funding_pledges_supporter_status_idx`"),
    );
    expect(pledgeTable).toContain("`quantity` int NOT NULL DEFAULT 1");
    expect(pledgeTable).toContain("`note` text");
    expect(pledgeTable).not.toMatch(/`(?:amount|price|paymentId|investmentId)`/);
  });

  it("筹措事件只有追加写入路径，不允许静默更新或删除历史", () => {
    const service = source("server/services/funding-campaign-service.ts");
    const appendStart = service.indexOf("async function appendCampaignEvent");
    const appendEnd = service.indexOf("async function recalculatePledgeTotals");
    const appendSource = service.slice(appendStart, appendEnd);
    expect(appendSource).toContain("tx.insert(fundingCampaignEvents)");
    expect(appendSource).not.toContain("tx.update(fundingCampaignEvents)");
    expect(appendSource).not.toContain("tx.delete(fundingCampaignEvents)");
  });

  it("公开活动视图不暴露所有者、内部来源主键或授权版本", () => {
    const service = source("server/services/funding-campaign-service.ts");
    const publicStart = service.indexOf("function campaignPublicView");
    const publicEnd = service.indexOf("type FundingDatabase");
    const publicView = service.slice(publicStart, publicEnd);
    expect(publicView).toContain("disclaimer");
    expect(publicView).not.toContain("ownerAccountId");
    expect(publicView).not.toContain("sourceId");
    expect(publicView).not.toContain("authorizationVersion");
    expect(publicView).not.toContain("createdRequestId");
    expect(publicView).not.toContain("lastRequestId");

    const registerStart = service.indexOf("async registerPledge");
    const withdrawStart = service.indexOf("async withdrawPledge");
    const registerSource = service.slice(registerStart, withdrawStart);
    expect(registerSource).toContain("campaign: campaignPublicView");
    expect(registerSource).not.toContain("campaign: campaignOwnerView");
  });

  it("筹措能力和资源事实接入中央授权，主路由区分活动与支持意向", () => {
    const migration = source("drizzle/0034_v4_funding_campaigns.sql");
    const authorization = source("server/authorization/drizzle-data-source.ts");
    const appRouter = source("server/routers.ts");
    expect(migration).toContain("funding.campaign.publish");
    expect(migration).toContain("funding.pledge.register");
    expect(migration).toContain("funding.pledge.view_self");
    expect(authorization).toContain('request.resourceType === "funding_campaign"');
    expect(authorization).toContain('request.resourceType === "funding_pledge"');
    expect(appRouter).toContain("fundingCampaigns: fundingCampaignsRouter");
    expect(appRouter).toContain("fundingPledges: fundingPledgesRouter");
  });
});

describe("V4 新品筹措真实 App 闭环", () => {
  it("公共发布、发现和我的页面都进入统一筹措路由", () => {
    const publish = source("app/(tabs)/publish.tsx");
    const discover = source("app/(tabs)/discover.tsx");
    const profile = source("app/(tabs)/profile.tsx");
    const discoverTabs = source("lib/discover-tabs.ts");
    expect(publish).toContain("/funding/new");
    expect(discover).toContain("fundingCampaigns.publicList.useQuery");
    expect(discover).toContain("/funding/${item.publicCode}");
    expect(profile).toContain("/funding/mine");
    expect(discoverTabs).toContain('procedure: "fundingCampaigns.publicList"');
  });

  it("创建、公开详情和管理页面调用真实 API 且以公开码登记意向", () => {
    const createPage = source("app/funding/new.tsx");
    const publicPage = source("app/funding/[publicCode].tsx");
    const managePage = source("app/funding/manage/[id].tsx");
    expect(createPage).toContain("fundingCampaigns.create.useMutation");
    expect(createPage).toContain("fundingCampaigns.publish.useMutation");
    expect(publicPage).toContain("fundingCampaigns.publicDetail.useQuery");
    expect(publicPage).toContain("fundingPledges.register.useMutation");
    expect(publicPage).toContain("publicCode");
    expect(managePage).toContain("fundingCampaigns.update.useMutation");
    expect(managePage).toContain("fundingCampaigns.close.useMutation");
  });
});
