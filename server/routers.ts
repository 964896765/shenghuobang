import { z } from "zod";
import crypto from "node:crypto";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";
import { DevelopmentFileScanner } from "./storage/scanner";
import { detectFile, sanitizeFileName, validateMimeAndExtension } from "./storage/file-policy";
import { validateProjectFileSize } from "../shared/project-rules";
import { createProjectFileAccessPath } from "./_core/projectFileAccess";
import { paymentsRouter, refundsRouter, escrowRouter, settlementsRouter, adminFinanceRouter } from "./routers/finance-router";
import { verificationsRouter, adminVerificationsRouter } from "./routers/verification-router";
import { complaintsRouter, adminComplaintsRouter } from "./routers/complaint-router";
import { adminRouter, auditLogsRouter, platformOperationsRouter } from "./routers/admin-router";
import { accountProfileRouter, certificationRouter, identityRouter, organizationRouter, workspaceRouter } from "./routers/identity-organization-router";
import { ideasRouter } from "./routers/ideas-router";
import { prototypeAcceptancesRouter, projectIntentionsRouter } from "./routers/project-acceptance-intention-router";
import { designVersionsRouter, prototypeMilestonesRouter } from "./routers/project-design-prototype-router";
import { productModelsRouter, productUnitsRouter } from "./routers/product-lifecycle-router";

import * as verificationService from "./services/verification-service";
import { listMyCertifications, listMyIdentities, submitIdentityCertification, updateAccountAndPublicProfile } from "./services/identity-service";
import { switchWorkspace } from "./services/workspace-service";
import { publishRealtime, realtimeStats } from "./realtime";
import { nearbyRank, normalizeViewerLocation, roundForStorage, stableNearbySort, type ViewerLocation } from "../shared/location";
import { applyFieldMask, authorizeOrThrow, getAuthorizationService, serializeAuthorized, SENSITIVE_FIELD_NAMES } from "./authorization";

const projectFileScanner = new DevelopmentFileScanner();

function authorizationRequestId(headers: Record<string, unknown>): string | null {
  const value = headers["x-request-id"];
  return typeof value === "string" && value.length <= 64 ? value : null;
}

const nearbyFields = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  region: z.string().trim().min(2).max(64).optional(),
};
const nearbyInputSchema = z.object(nearbyFields).superRefine((value, ctx) => {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) {
    ctx.addIssue({ code: "custom", message: "经纬度必须同时提供" });
  }
});

async function addNearbyMetadata<T>(
  rows: T[],
  viewer: ViewerLocation | undefined,
  ownerId: (row: T) => number,
  fallbackRegion: (row: T) => string | null | undefined,
) {
  if (!viewer) return rows.map((row) => ({ ...row, distanceKm: null, distanceLabel: null }));
  const locations = await db.getLocationPreferencesByUserIds(rows.map(ownerId));
  const locationMap = new Map(locations.map((location) => [location.userId, location]));
  const ranked = rows.map((row, index) => {
    const location = locationMap.get(ownerId(row));
    const nearby = nearbyRank(viewer, location ? {
      latitude: location.approximateLatitude,
      longitude: location.approximateLongitude,
      region: location.regionName ?? location.cityName,
    } : undefined, fallbackRegion(row));
    return { row, index, ...nearby };
  });
  return stableNearbySort(ranked).map(({ row, distanceKm, distanceLabel }) => ({ ...row, distanceKm, distanceLabel }));
}

const listingPayloadSchema = z.object({
  title: z.string().trim().min(2).max(100),
  category: z.string().trim().min(1).max(64).default("其他"),
  brand: z.string().trim().max(64).optional(),
  conditionLevel: z.string().trim().min(1).max(32).default("九成新"),
  functionStatus: z.string().trim().min(1).max(32).default("功能正常"),
  description: z.string().trim().max(2000).optional(),
  swapIntent: z.string().trim().max(255).optional(),
  cityName: z.string().trim().min(2).max(64),
  modes: z.array(z.enum(["fixed_price", "accept_offers", "swap", "giveaway", "recycle"])).min(1).max(5),
  primaryMode: z.enum(["fixed_price", "accept_offers", "swap", "giveaway", "recycle"]),
  price: z.number().int().min(1).nullable().optional(),
  minAcceptPrice: z.number().int().min(1).nullable().optional(),
  giveawayRule: z.enum(["first_come", "apply", "choose"]).nullable().optional(),
});

function assertListingPayload(input: z.infer<typeof listingPayloadSchema>) {
  if (!input.modes.includes(input.primaryMode)) throw new Error("主要方式必须在所选交易方式中");
  if (input.modes.includes("fixed_price") && !input.price) throw new Error("一口价方式需要填写正整数售价");
  if (input.modes.includes("swap") && !input.swapIntent?.trim()) throw new Error("请选择或填写希望交换的物品");
}

function listingImageFileIds(imageUrls: string[] | null | undefined) {
  return (imageUrls ?? [])
    .map((value) => /^file:(\d+)$/.exec(value)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
}

/** AI 需求整理 */
async function aiStructureNeed(title: string, description: string) {
  if (!ENV.aiApiKey) {
    return {
      target: "待确认",
      scenario: description.slice(0, 120) || "待补充使用场景",
      problem: title || description.slice(0, 60),
      expectation: "请补充希望达到的具体效果",
      budgetSuggestion: "待确认",
      recommendedProfession: "由平台根据需求分类匹配",
      riskNotes: "AI服务尚未配置，当前为本地基础整理结果",
    };
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `你是"生活帮"平台的需求整理助手。用户会描述一个生活问题或工程需求,请把它整理为结构化信息。返回JSON:
{
  "target": "使用对象(谁使用/为谁解决)",
  "scenario": "使用场景",
  "problem": "当前问题",
  "expectation": "期望效果",
  "budgetSuggestion": "预算建议(如:500-2000元)",
  "recommendedProfession": "推荐专业方向(如:电气工程师/软件工程师/家电维修)",
  "riskNotes": "风险提示(简短)"
}
用简体中文,每项一两句话,不要编造用户没提到的细节,不确定的写"待确认"。`,
      },
      { role: "user", content: `标题:${title}\n描述:${description}` },
    ],
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return JSON.parse(text) as {
    target?: string;
    scenario?: string;
    problem?: string;
    expectation?: string;
    budgetSuggestion?: string;
    recommendedProfession?: string;
    riskNotes?: string;
  };
}

const structuredDataSchema = z.object({
  target: z.string().optional(),
  scenario: z.string().optional(),
  problem: z.string().optional(),
  expectation: z.string().optional(),
  budgetSuggestion: z.string().optional(),
  recommendedProfession: z.string().optional(),
  riskNotes: z.string().optional(),
});

export const appRouter = router({
  system: systemRouter,
  payments: paymentsRouter,
  refunds: refundsRouter,
  escrow: escrowRouter,
  settlements: settlementsRouter,
  verifications: verificationsRouter,
  admin: adminRouter,
  adminVerifications: adminVerificationsRouter,
  adminComplaints: adminComplaintsRouter,
  adminFinance: adminFinanceRouter,
  auditLogs: auditLogsRouter,
  platformOperations: platformOperationsRouter,
  accountProfile: accountProfileRouter,
  identity: identityRouter,
  certification: certificationRouter,
  organization: organizationRouter,
  workspace: workspaceRouter,
  ideas: ideasRouter,
  designVersions: designVersionsRouter,
  prototypeMilestones: prototypeMilestonesRouter,
  prototypeAcceptances: prototypeAcceptancesRouter,
  projectIntentions: projectIntentionsRouter,
  productModels: productModelsRouter,
  productUnits: productUnitsRouter,
  location: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const preference = await db.getLocationPreference(ctx.user.id);
      if (!preference) return null;
      return {
        userId: ctx.user.id,
        cityName: preference.cityName,
        regionName: preference.regionName,
        source: preference.source,
        updatedAt: preference.updatedAt,
      };
    }),
    update: protectedProcedure.input(z.object({
      source: z.enum(["device", "manual"]),
      cityName: z.string().trim().min(2).max(64).optional(),
      regionName: z.string().trim().min(2).max(64).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
    }).superRefine((value, ctx) => {
      if (value.source === "device" && (value.latitude === undefined || value.longitude === undefined)) {
        ctx.addIssue({ code: "custom", message: "设备位置必须包含经纬度" });
      }
      if (value.source === "manual" && !value.cityName && !value.regionName) {
        ctx.addIssue({ code: "custom", message: "请选择城市或地区" });
      }
    })).mutation(async ({ ctx, input }) => {
      await db.saveLocationPreference({
        userId: ctx.user.id,
        actorRole: ctx.user.role,
        source: input.source,
        cityName: input.cityName,
        regionName: input.regionName,
        approximateLatitude: input.latitude === undefined ? undefined : roundForStorage(input.latitude),
        approximateLongitude: input.longitude === undefined ? undefined : roundForStorage(input.longitude),
      });
      return { success: true };
    }),
    clear: protectedProcedure.mutation(async ({ ctx }) => {
      await db.clearLocationPreference(ctx.user.id, ctx.user.role);
      return { success: true };
    }),
  }),
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ 用户资料与身份 ============
  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.ensureProfile(ctx.user.id, { nickname: ctx.user.name ?? undefined });
      const engineer = await db.getEngineerByUserId(ctx.user.id);
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      const [identities, certifications] = await Promise.all([listMyIdentities(ctx.user.id), listMyCertifications(ctx.user.id)]);
      return {
        profile,
        engineer: engineer ? applyFieldMask(engineer, SENSITIVE_FIELD_NAMES) : null,
        merchant: merchant ? applyFieldMask(merchant, SENSITIVE_FIELD_NAMES) : null,
        identities,
        certifications,
        compatibilityMirror: ["profile.currentRole", "profile.engineerStatus", "profile.merchantStatus"],
      };
    }),
    update: protectedProcedure
      .input(
        z.object({
          nickname: z.string().min(1).max(32).optional(),
          bio: z.string().max(500).optional(),
          cityName: z.string().max(32).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await authorizeOrThrow(ctx.user.id, { capabilityCode: "account.profile.update_self", purpose: "legacy_profile_update", requestId: authorizationRequestId(ctx.req.headers) });
        await updateAccountAndPublicProfile(ctx.user.id, input);
        return { success: true, compatibilityMirror: ["nickname", "bio", "cityName"] };
      }),
    switchRole: protectedProcedure
      .input(z.object({ role: z.enum(["user", "engineer", "merchant"]) }))
      .mutation(async ({ ctx, input }) => {
        await authorizeOrThrow(ctx.user.id, { capabilityCode: "identity.switch", purpose: "legacy_workspace_switch", requestId: authorizationRequestId(ctx.req.headers) });
        if (input.role === "user") {
          const switched = await switchWorkspace(ctx.user.id, { workspaceType: "personal" }, authorizationRequestId(ctx.req.headers));
          return { success: true, workspace: switched.preference, compatibilityCurrentRole: "user" as const };
        }
        const identity = (await listMyIdentities(ctx.user.id)).find((item) => item.typeCode === input.role && item.status === "active");
        if (!identity) throw new Error("IDENTITY_INACTIVE");
        const switched = await switchWorkspace(ctx.user.id, { workspaceType: "identity", identityId: identity.id }, authorizationRequestId(ctx.req.headers));
        return { success: true, workspace: switched.preference, compatibilityCurrentRole: input.role };
      }),
    applyEngineer: protectedProcedure
      .input(
        z.object({
          realName: z.string().min(1).max(32),
          professionalTitle: z.string().min(1).max(64),
          primaryCategory: z.string().min(1).max(64),
          yearsOfExperience: z.number().int().min(0).max(60),
          introduction: z.string().max(1000),
          skills: z.array(z.string()).max(20),
          startingPrice: z.number().int().min(0),
          supportsRemote: z.boolean(),
          supportsOnsite: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.submit_self", purpose: "legacy_engineer_application", requestId: authorizationRequestId(ctx.req.headers) });
        const submitted = await submitIdentityCertification(ctx.user.id, {
          identityKind: "engineer",
          certificationKind: "engineer_basic",
          requestId: authorizationRequestId(ctx.req.headers),
          profile: {
            professionalTitle: input.professionalTitle,
            introduction: input.introduction,
            skills: input.skills,
            profileData: { primaryCategory: input.primaryCategory, yearsOfExperience: input.yearsOfExperience, startingPrice: input.startingPrice, supportsRemote: input.supportsRemote, supportsOnsite: input.supportsOnsite },
          },
          application: { realName: input.realName, professionalTitle: input.professionalTitle, primaryCategory: input.primaryCategory, yearsOfExperience: input.yearsOfExperience, introduction: input.introduction, skills: input.skills },
        });
        const id = submitted.certificationId;
        await db.createNotification({
          userId: ctx.user.id,
          category: "system",
          title: "工程师认证已提交",
          content: "申请已进入人工审核，通过前不能提交正式收费报价。",
          refType: "verification",
          refId: id,
        });
        return { success: true, id };
      }),
    applyMerchant: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(64),
          categories: z.array(z.string()).max(10),
          description: z.string().max(500),
          addressText: z.string().max(128).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.submit_self", purpose: "legacy_merchant_application", requestId: authorizationRequestId(ctx.req.headers) });
        const submitted = await submitIdentityCertification(ctx.user.id, {
          identityKind: "merchant",
          certificationKind: "merchant_business_license",
          requestId: authorizationRequestId(ctx.req.headers),
          profile: { displayName: input.name, introduction: input.description, profileData: { categories: input.categories } },
          application: { merchantName: input.name, categories: input.categories, description: input.description, addressText: input.addressText },
        });
        const id = submitted.certificationId;
        await db.createNotification({
          userId: ctx.user.id,
          category: "system",
          title: "商家认证已提交",
          content: "申请已进入人工审核，通过前不能提交回收报价或承接订单。",
          refType: "verification",
          refId: id,
        });
        return { success: true, id };
      }),
  }),

  // ============ 工程师 ============
  engineers: router({
    list: publicProcedure
      .input(z.object({ keyword: z.string().optional(), ...nearbyFields }).optional())
      .query(async ({ input }) => {
        const engineers = await db.listEngineers({ keyword: input?.keyword });
        const profiles = await db.getProfilesByUserIds(engineers.map((e) => e.userId));
        const profileMap = new Map(profiles.map((p) => [p.userId, p]));
        const rows = engineers.map((e) => ({ ...e, nickname: profileMap.get(e.userId)?.nickname ?? e.realName ?? "工程师" }));
        return addNearbyMetadata(rows, normalizeViewerLocation(input), (row) => row.userId, (row) => row.cityName);
      }),
    detail: publicProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
      const engineer = await db.getEngineerByUserId(input.userId);
      if (!engineer) throw new Error("工程师不存在");
      const reviews = await db.listReviewsForUser(input.userId);
      return { engineer: applyFieldMask(engineer, SENSITIVE_FIELD_NAMES) as typeof engineer, reviews };
    }),
    setAccepting: protectedProcedure.input(z.object({ accepting: z.boolean() })).mutation(async ({ ctx, input }) => {
      if (input.accepting) await verificationService.assertEngineerApproved(ctx.user.id);
      await db.upsertEngineer(ctx.user.id, { acceptingOrders: input.accepting });
      return { success: true };
    }),
  }),

  merchants: router({
    list: publicProcedure.query(async () => (await db.listMerchants()).map((merchant) => applyFieldMask(merchant, SENSITIVE_FIELD_NAMES) as typeof merchant)),
  }),

  // ============ 需求 ============
  needs: router({
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(2).max(100),
          originalDescription: z.string().min(5).max(3000),
          needType: z.string().max(32).default("life"),
          cityName: z.string().max(32).optional(),
          visibility: z.enum(["public", "private"]).default("public"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const profile = await db.ensureProfile(ctx.user.id);
        const id = await db.createNeed({
          creatorId: ctx.user.id,
          title: input.title,
          originalDescription: input.originalDescription,
          needType: input.needType,
          cityName: input.cityName ?? profile.cityName ?? "北京",
          visibility: input.visibility,
          status: "draft",
        });
        return { id };
      }),
    aiStructure: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const need = await db.getNeed(input.id);
      if (!need) throw new Error("需求不存在");
      if (need.creatorId !== ctx.user.id) throw new Error("只有创建者可以整理需求");
      const structured = await aiStructureNeed(need.title, need.originalDescription ?? "");
      await db.updateNeed(input.id, { structuredData: structured });
      return structured;
    }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(2).max(100).optional(),
          originalDescription: z.string().max(3000).optional(),
          structuredData: structuredDataSchema.optional(),
          category: z.string().max(64).optional(),
          budgetMin: z.number().int().min(0).nullable().optional(),
          budgetMax: z.number().int().min(0).nullable().optional(),
          expectedDeadline: z.string().max(64).optional(),
          supportsRemote: z.boolean().optional(),
          requiresOnsite: z.boolean().optional(),
          allowComments: z.boolean().optional(),
          allowQuotes: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const need = await db.getNeed(input.id);
        if (!need) throw new Error("需求不存在");
        if (need.creatorId !== ctx.user.id) throw new Error("只有创建者可以编辑需求");
        if (["project_created", "solved", "closed"].includes(need.status)) {
          throw new Error("当前状态的需求不能直接修改");
        }
        const { id, ...data } = input;
        await db.updateNeed(id, data);
        return { success: true };
      }),
    publish: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const need = await db.getNeed(input.id);
      if (!need) throw new Error("需求不存在");
      if (need.creatorId !== ctx.user.id) throw new Error("只有创建者可以发布需求");
      if (need.status !== "draft") throw new Error("只有草稿可以发布");
      await db.updateNeed(input.id, { status: "published", publishedAt: new Date() });
      return { success: true };
    }),
    close: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().max(255).optional() }))
      .mutation(async ({ ctx, input }) => {
        const need = await db.getNeed(input.id);
        if (!need) throw new Error("需求不存在");
        if (need.creatorId !== ctx.user.id) throw new Error("只有创建者可以关闭需求");
        if (["project_created", "solved", "closed"].includes(need.status)) {
          throw new Error("当前状态不能关闭");
        }
        await db.updateNeed(input.id, { status: "closed", closedAt: new Date(), closeReason: input.reason });
        return { success: true };
      }),
    markSolved: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const need = await db.getNeed(input.id);
      if (!need) throw new Error("需求不存在");
      if (need.creatorId !== ctx.user.id) throw new Error("只有创建者可以操作");
      await db.updateNeed(input.id, { status: "solved" });
      return { success: true };
    }),
    list: publicProcedure
      .input(
        z
          .object({
            keyword: z.string().optional(),
            needType: z.string().optional(),
            scope: z.enum(["plaza", "mine"]).default("plaza"),
            ...nearbyFields,
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        if (input?.scope === "mine") {
          if (!ctx.user) return [];
          return db.listNeeds({ creatorId: ctx.user.id, keyword: input?.keyword });
        }
        const rows = await db.listNeeds({
          status: ["published", "collecting_solutions", "selecting_quote", "project_created", "solved"],
          publicOnly: true,
          keyword: input?.keyword,
          needType: input?.needType,
        });
        return addNearbyMetadata(rows, normalizeViewerLocation(input), (row) => row.creatorId, (row) => row.cityName);
      }),
    detail: publicProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const need = await db.getNeed(input.id);
      if (!need) throw new Error("需求不存在");
      const [solutionList, quoteList, comments] = await Promise.all([
        db.listSolutions(input.id),
        db.listQuotes(input.id),
        db.listComments(input.id),
      ]);
      const userIds = [
        need.creatorId,
        ...solutionList.map((s) => s.providerId),
        ...quoteList.map((q) => q.engineerId),
        ...comments.map((c) => c.userId),
      ];
      const profiles = await db.getProfilesByUserIds([...new Set(userIds)]);
      const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, { nickname: p.nickname, avatarUrl: p.avatarUrl }]));
      const supported = ctx.user ? await db.hasSupported(input.id, ctx.user.id) : false;
      return { need, solutions: solutionList, quotes: quoteList, comments, profileMap, supported };
    }),
    support: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const added = await db.toggleSupport(input.id, ctx.user.id);
      return { added };
    }),
    comment: protectedProcedure
      .input(z.object({ id: z.number(), content: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        const need = await db.getNeed(input.id);
        if (!need) throw new Error("需求不存在");
        if (!need.allowComments) throw new Error("该需求不允许评论");
        await db.addComment(input.id, ctx.user.id, input.content);
        return { success: true };
      }),
  }),

  // ============ 方案与报价 ============
  quotes: router({
    detail: protectedProcedure.input(z.object({ quoteId: z.number() })).query(async ({ ctx, input }) => {
      const authorization = await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "quote.view", resourceType: "quote", resourceId: String(input.quoteId), view: "detail",
        requestedFields: ["totalPrice", "deliverables", "exclusions", "paymentTerms"], requestId: authorizationRequestId(ctx.req.headers),
      });
      const quote = await db.getQuote(input.quoteId);
      if (!quote) throw new Error("报价不存在");
      const need = await db.getNeed(quote.needId);
      if (!need) throw new Error("需求不存在");
      const versions = await db.listQuoteVersions(input.quoteId);
      return {
        quote: serializeAuthorized(quote, authorization),
        need: { id: need.id, title: need.title, creatorId: need.creatorId, status: need.status },
        versions,
        myRole: quote.engineerId === ctx.user.id ? ("engineer" as const) : ("owner" as const),
      };
    }),
    submitSolution: protectedProcedure
      .input(
        z.object({
          needId: z.number(),
          understanding: z.string().max(1000).optional(),
          approach: z.string().min(5).max(2000),
          risks: z.string().max(1000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "quote.submit", resourceType: "need", resourceId: String(input.needId), view: "detail",
          requestId: authorizationRequestId(ctx.req.headers), purpose: "submit_solution",
        });
        const need = await db.getNeed(input.needId);
        if (!need) throw new Error("需求不存在");
        if (!["published", "collecting_solutions", "selecting_quote"].includes(need.status)) {
          throw new Error("该需求当前不接受方案");
        }
        const profile = await db.ensureProfile(ctx.user.id);
        await db.createSolution({
          needId: input.needId,
          providerId: ctx.user.id,
          providerType: profile.engineerStatus === "active" ? "engineer" : "user",
          understanding: input.understanding,
          approach: input.approach,
          risks: input.risks,
        });
        if (need.status === "published") {
          await db.updateNeed(input.needId, { status: "collecting_solutions" });
        }
        await db.createNotification({
          userId: need.creatorId,
          category: "need",
          title: "收到新方案",
          content: `你的需求「${need.title}」收到了新的解决方案。`,
          refType: "need",
          refId: need.id,
        });
        return { success: true };
      }),
    submitQuote: protectedProcedure
      .input(
        z.object({
          needId: z.number(),
          understanding: z.string().max(1000).optional(),
          totalPrice: z.number().int().min(1),
          durationDays: z.number().int().min(1).max(365),
          deliverables: z.string().min(2).max(2000),
          exclusions: z.string().max(1000).optional(),
          paymentTerms: z.string().max(255).optional(),
          revisionCount: z.number().int().min(0).max(10).default(2),
          supportDays: z.number().int().min(0).max(365).default(30),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "quote.submit", resourceType: "need", resourceId: String(input.needId), view: "detail",
          requestId: authorizationRequestId(ctx.req.headers), purpose: "submit_quote",
        });
        const need = await db.getNeed(input.needId);
        if (!need) throw new Error("需求不存在");
        if (!need.allowQuotes) throw new Error("该需求不允许报价");
        if (!["published", "collecting_solutions", "selecting_quote"].includes(need.status)) {
          throw new Error("该需求当前不接受报价");
        }
        if (need.creatorId === ctx.user.id) throw new Error("不能给自己的需求报价");
        await db.createQuote({ ...input, engineerId: ctx.user.id });
        if (need.status === "published") {
          await db.updateNeed(input.needId, { status: "collecting_solutions" });
        }
        await db.createNotification({
          userId: need.creatorId,
          category: "need",
          title: "收到新报价",
          content: `你的需求「${need.title}」收到了新报价 ¥${input.totalPrice}。`,
          refType: "need",
          refId: need.id,
        });
        return { success: true };
      }),
    versions: protectedProcedure.input(z.object({ quoteId: z.number() })).query(async ({ ctx, input }) => {
      const authorization = await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "quote.view", resourceType: "quote", resourceId: String(input.quoteId), view: "detail",
        requestedFields: ["totalPrice", "deliverables", "exclusions", "paymentTerms"], requestId: authorizationRequestId(ctx.req.headers),
      });
      const quote = await db.getQuote(input.quoteId);
      if (!quote) throw new Error("报价不存在");
      const need = await db.getNeed(quote.needId);
      if (!need) throw new Error("需求不存在");
      const rows = await db.listQuoteVersions(input.quoteId);
      return rows.map((row) => serializeAuthorized(row, authorization));
    }),
    createVersion: protectedProcedure
      .input(
        z.object({
          quoteId: z.number(),
          understanding: z.string().max(1000).optional(),
          totalPrice: z.number().int().min(1),
          durationDays: z.number().int().min(1).max(365),
          deliverables: z.string().min(2).max(2000),
          exclusions: z.string().max(1000).optional(),
          paymentTerms: z.string().max(255).optional(),
          revisionCount: z.number().int().min(0).max(10).default(2),
          supportDays: z.number().int().min(0).max(365).default(30),
          validDays: z.number().int().min(1).max(90).default(7),
          changeNote: z.string().min(2).max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { quoteId, ...versionData } = input;
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "quote.submit", resourceType: "quote", resourceId: String(quoteId), view: "detail",
          requestId: authorizationRequestId(ctx.req.headers), purpose: "create_quote_version",
        });
        const result = await db.createQuoteVersion(quoteId, ctx.user.id, versionData);
        const quote = await db.getQuote(quoteId);
        if (quote) {
          const need = await db.getNeed(quote.needId);
          if (need) {
            await db.createNotification({
              userId: need.creatorId,
              category: "need",
              title: "报价已更新",
              content: `需求「${need.title}」的工程师报价已更新为 V${result.versionNo}，请重新确认。`,
              refType: "need",
              refId: need.id,
            });
          }
        }
        return result;
      }),
    myQuotes: protectedProcedure.query(async ({ ctx }) => {
      const quoteList = await db.listQuotesByEngineer(ctx.user.id);
      const authorizedQuotes = await Promise.all(quoteList.map(async (quote) => {
        const authorization = await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "quote.view", resourceType: "quote", resourceId: String(quote.id), view: "list",
          requestedFields: ["totalPrice", "deliverables", "exclusions", "paymentTerms"], requestId: authorizationRequestId(ctx.req.headers),
        });
        return serializeAuthorized(quote, authorization);
      }));
      const needIds = [...new Set(quoteList.map((q) => q.needId))];
      const needsData = await Promise.all(needIds.map((id) => db.getNeed(id)));
      const needMap = Object.fromEntries(needsData.filter(Boolean).map((n) => [n!.id, { title: n!.title, status: n!.status }]));
      return { quotes: authorizedQuotes, needMap };
    }),
    accept: protectedProcedure
      .input(z.object({ needId: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "quote.accept", resourceType: "quote", resourceId: String(input.quoteId), view: "detail",
          requestId: authorizationRequestId(ctx.req.headers), purpose: "accept_quote",
        });
        const projectId = await db.acceptQuoteTransaction(input.needId, input.quoteId, ctx.user.id);
        const quote = await db.getQuote(input.quoteId);
        if (quote) {
          await db.createNotification({
            userId: quote.engineerId,
            category: "project",
            title: "报价被接受",
            content: "你的报价已被接受,项目已创建,请确认项目并开始执行。",
            refType: "project",
            refId: projectId,
          });
        }
        return { projectId };
      }),
    reject: protectedProcedure.input(z.object({ quoteId: z.number() })).mutation(async ({ ctx, input }) => {
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "quote.reject", resourceType: "quote", resourceId: String(input.quoteId), view: "detail",
        requestId: authorizationRequestId(ctx.req.headers), purpose: "reject_quote",
      });
      const quote = await db.getQuote(input.quoteId);
      if (!quote) throw new Error("报价不存在");
      const need = await db.getNeed(quote.needId);
      if (!need || need.creatorId !== ctx.user.id) throw new Error("只有需求创建者可以拒绝报价");
      if (!["submitted", "viewed", "negotiating"].includes(quote.status)) throw new Error("该报价已被处理");
      await db.updateQuote(input.quoteId, { status: "rejected" });
      return { success: true };
    }),
  }),

  // ============ 项目 ============
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const projectList = await db.listProjects(ctx.user.id);
      return Promise.all(projectList.map(async (p) => {
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "project.view", projectId: p.id, resourceType: "project", resourceId: String(p.id), view: "list",
          requestId: authorizationRequestId(ctx.req.headers),
        });
        return { ...p, myRole: p.ownerId === ctx.user.id ? "owner" : "engineer" };
      }));
    }),
    detail: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const authorization = await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "project.view", projectId: input.id, resourceType: "project", resourceId: String(input.id), view: "detail",
        requestedFields: ["fileName", "storageKey", "publicUrl"], requestId: authorizationRequestId(ctx.req.headers),
      });
      const project = await db.getProject(input.id);
      if (!project) throw new Error("项目不存在");
      const milestoneList = await db.listMilestones(input.id);
      const [requirements, files, changes, acceptances, projectComplaints, milestoneComplaintGroups, projectOrder, members, memberAccess] = await Promise.all([
        db.listProjectRequirements(input.id),
        db.listProjectFiles(input.id),
        db.listProjectChanges(input.id),
        db.listProjectAcceptances(input.id),
        db.listComplaintsForRelated("project", input.id),
        Promise.all(milestoneList.map((milestone) => db.listComplaintsForRelated("milestone", milestone.id))),
        db.getOrderForReference("project", input.id),
        db.listActiveProjectMembers(input.id),
        db.getProjectMemberAccessView(input.id, ctx.user.id),
      ]);
      const allComplaints = [...projectComplaints, ...milestoneComplaintGroups.flat()].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const profiles = await db.getProfilesByUserIds([project.ownerId, project.engineerId]);
      const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, { nickname: p.nickname }]));
      return {
        project,
        milestones: milestoneList,
        requirements,
        files: files.map((file) => serializeAuthorized(file, authorization)),
        changes,
        acceptances,
        complaints: allComplaints,
        orderId: projectOrder?.id ?? null,
        profileMap,
        members,
        myMembershipId: memberAccess?.membershipId ?? null,
        myRoleCodes: memberAccess?.roleCodes ?? [],
        myCapabilityCodes: memberAccess?.capabilityCodes ?? [],
        myRole: project.ownerId === ctx.user.id ? ("owner" as const) : ("engineer" as const),
      };
    }),
    confirm: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "project.requirement.edit", projectId: input.id, resourceType: "project", resourceId: String(input.id),
        requestId: authorizationRequestId(ctx.req.headers), purpose: "confirm_project",
      });
      const project = await db.getProject(input.id);
      if (!project) throw new Error("项目不存在");
      const result = await db.confirmProjectAgreementTransaction(input.id, ctx.user.id);
      const otherId = project.ownerId === ctx.user.id ? project.engineerId : project.ownerId;
      await db.createNotification({
        userId: otherId,
        category: "project",
        title: result.allConfirmed ? "项目协议已确认" : "等待你确认项目协议",
        content: result.allConfirmed
          ? `项目「${project.title}」双方已确认正式需求与合作条款，等待需求方付款。`
          : `项目「${project.title}」的另一方已确认合作条款，请进入项目确认。`,
        refType: "project",
        refId: project.id,
      });
      return result;
    }),
    pay: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const project = await db.getProject(input.id);
      if (!project) throw new Error("项目不存在");
      if (project.ownerId !== ctx.user.id) throw new Error("只有项目所有者可以支付");
      throw new Error("直接修改项目状态的模拟支付已停用，请通过支付单和沙箱支付确认流程完成付款");
    }),
    uploadFile: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          milestoneId: z.number().optional(),
          fileGroupId: z.string().max(64).optional(),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().max(128).optional(),
          base64Data: z.string().min(1),
          category: z.enum(["requirement", "design", "delivery", "test", "agreement", "other"]).default("other"),
          description: z.string().max(1000).optional(),
          formalSubmission: z.boolean().default(false),
          confidentialityLevel: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"]).default("INTERNAL"),
          ndaRequired: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const authorization = await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "project.file.upload", projectId: input.projectId, resourceType: "project", resourceId: String(input.projectId),
          requestedFields: ["fileName", "storageKey", "publicUrl"], requestId: authorizationRequestId(ctx.req.headers), purpose: "upload_project_file",
        });
        const project = await db.getProject(input.projectId);
        if (!project) throw new Error("项目不存在");
        if (input.milestoneId) {
          const milestone = await db.getMilestone(input.milestoneId);
          if (!milestone || milestone.projectId !== project.id) throw new Error("里程碑不属于当前项目");
        }
        const payload = input.base64Data.includes(",") ? input.base64Data.split(",").pop() ?? "" : input.base64Data;
        const buffer = Buffer.from(payload, "base64");
        validateProjectFileSize(buffer.byteLength);
        if (await db.countStoredFiles(ctx.user.id, "project", project.id) >= ENV.maxFilesPerEntity) throw new Error("项目文件数量已达上限");
        const safeName = sanitizeFileName(input.fileName);
        const detected = detectFile(buffer);
        const mimeType = input.mimeType ?? detected.mimeType;
        validateMimeAndExtension(safeName, mimeType, detected);
        const scan = await projectFileScanner.scan(buffer, safeName, detected.mimeType);
        if (scan.status === "rejected") throw new Error(scan.reason ?? "文件安全检查未通过");
        const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
        if (await db.findStoredFileByOwnerAndHash(ctx.user.id, sha256)) throw new Error("相同文件已上传");
        const stored = await storagePut(`projects/${project.id}/${crypto.randomUUID()}-${safeName}`, buffer, mimeType);
        const storedFileId = await db.createStoredFile({
          ownerId: ctx.user.id,
          provider: stored.provider,
          storageKey: stored.key,
          originalName: safeName,
          mimeType,
          sizeBytes: buffer.byteLength,
          sha256,
          privacyLevel: "high_sensitive",
          virusScanStatus: scan.status,
          status: "available",
          relatedEntityType: "project",
          relatedEntityId: project.id,
        });
        await db.addFileAccessLog({ fileId: storedFileId, userId: ctx.user.id, action: "upload", relatedEntityType: "project", relatedEntityId: project.id });
        const result = await db.createProjectFile({
          projectId: project.id,
          milestoneId: input.milestoneId,
          fileGroupId: input.fileGroupId ?? crypto.randomUUID(),
          fileName: safeName,
          storageKey: stored.key,
          publicUrl: undefined,
          mimeType,
          sizeBytes: buffer.byteLength,
          category: input.category,
          description: input.description,
          formalSubmission: input.formalSubmission,
          confidentialityLevel: input.confidentialityLevel,
          ndaRequired: input.ndaRequired,
          uploadedBy: ctx.user.id,
        });
        return serializeAuthorized(result, authorization);
      }),
    fileAccessUrl: protectedProcedure.input(z.object({ fileId: z.number() })).query(async ({ ctx, input }) => {
      const file = await db.getProjectFile(input.fileId);
      if (!file || file.status === "disabled") throw new Error("文件不存在");
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "project.file.download", projectId: file.projectId, resourceType: "project_file", resourceId: String(file.id),
        expectedResourceVersion: file.accessPolicyVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "issue_project_file_link",
      });
      return { path: createProjectFileAccessPath(file.id, ctx.user.id, file.accessPolicyVersion, 60), expiresInSeconds: 60 };
    }),
    disableFile: protectedProcedure.input(z.object({ fileId: z.number() })).mutation(async ({ ctx, input }) => {
      const file = await db.getProjectFile(input.fileId);
      if (!file) throw new Error("文件不存在");
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "project.file.disable", projectId: file.projectId, resourceType: "project_file", resourceId: String(file.id),
        expectedResourceVersion: file.accessPolicyVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "disable_project_file",
      });
      await db.disableProjectFile(input.fileId, ctx.user.id);
      return { success: true };
    }),
    submitMilestone: protectedProcedure
      .input(z.object({ milestoneId: z.number(), deliveryNote: z.string().min(2).max(2000), fileIds: z.array(z.number()).max(20).optional() }))
      .mutation(async ({ ctx, input }) => {
        const target = await db.getMilestone(input.milestoneId);
        if (!target) throw new Error("里程碑不存在");
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "project.milestone.submit", projectId: target.projectId, resourceType: "milestone", resourceId: String(target.id),
          expectedResourceVersion: target.authorizationVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "submit_milestone",
        });
        if (input.fileIds?.length) {
          for (const fileId of input.fileIds) {
            const file = await db.getProjectFile(fileId);
            if (!file || file.uploadedBy !== ctx.user.id) throw new Error("交付文件不存在或无权使用");
            if (file.milestoneId && file.milestoneId !== input.milestoneId) throw new Error("交付文件里程碑不匹配");
          }
        }
        const { project, milestone } = await db.submitMilestoneTransaction(input.milestoneId, ctx.user.id, input.deliveryNote);
        await db.createNotification({
          userId: project.ownerId,
          category: "project",
          title: "交付待验收",
          content: `项目「${project.title}」的里程碑「${milestone.title}」已提交交付,请验收。`,
          refType: "project",
          refId: project.id,
        });
        return { success: true };
      }),
    acceptMilestone: protectedProcedure
      .input(z.object({ milestoneId: z.number(), comment: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const target = await db.getMilestone(input.milestoneId);
        if (!target) throw new Error("里程碑不存在");
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "project.milestone.accept", projectId: target.projectId, resourceType: "milestone", resourceId: String(target.id),
          expectedResourceVersion: target.authorizationVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "accept_milestone",
        });
        const result = await db.acceptMilestoneTransaction(input.milestoneId, ctx.user.id, input.comment);
        if (result.completed) {
          await db.createNotification({
            userId: result.project.engineerId,
            category: "project",
            title: "项目已完成",
            content: `项目「${result.project.title}」全部里程碑验收通过，阶段结算申请已创建，等待财务审核释放托管。`,
            refType: "project",
            refId: result.project.id,
          });
        } else {
          await db.createNotification({
            userId: result.project.engineerId,
            category: "project",
            title: "里程碑验收通过",
            content: `「${result.milestone.title}」验收通过，阶段结算申请已创建，下一阶段已激活。`,
            refType: "project",
            refId: result.project.id,
          });
        }
        return { success: true, completed: result.completed };
      }),
    requestRevision: protectedProcedure
      .input(z.object({ milestoneId: z.number(), reason: z.string().min(2).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const target = await db.getMilestone(input.milestoneId);
        if (!target) throw new Error("里程碑不存在");
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "project.milestone.request_revision", projectId: target.projectId, resourceType: "milestone", resourceId: String(target.id),
          expectedResourceVersion: target.authorizationVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "request_milestone_revision",
        });
        const { project, milestone } = await db.requestMilestoneRevisionTransaction(input.milestoneId, ctx.user.id, input.reason);
        await db.createNotification({
          userId: project.engineerId,
          category: "project",
          title: "需要修改",
          content: `里程碑「${milestone.title}」被要求修改:${input.reason}`,
          refType: "project",
          refId: project.id,
        });
        return { success: true };
      }),
    createChange: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          title: z.string().min(2).max(100),
          changeContent: z.string().min(2).max(3000),
          reason: z.string().max(1000).optional(),
          amountDelta: z.number().int().min(-10000000).max(10000000).default(0),
          scheduleDeltaDays: z.number().int().min(-365).max(365).default(0),
          deliverableImpact: z.string().max(1000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "project.change.propose", projectId: input.projectId, resourceType: "project", resourceId: String(input.projectId),
          requestId: authorizationRequestId(ctx.req.headers), purpose: "propose_project_change",
        });
        const project = await db.getProject(input.projectId);
        if (!project) throw new Error("项目不存在");
        if (!["in_progress", "waiting_acceptance", "revision", "paused"].includes(project.status)) throw new Error("当前项目状态不能发起变更");
        const id = await db.createProjectChange({ ...input, requesterId: ctx.user.id, status: "pending_confirmation" });
        const otherId = project.ownerId === ctx.user.id ? project.engineerId : project.ownerId;
        await db.createNotification({
          userId: otherId,
          category: "project",
          title: "收到项目变更申请",
          content: `项目「${project.title}」收到变更申请「${input.title}」，请确认费用和工期影响。`,
          refType: "project",
          refId: project.id,
        });
        return { id };
      }),
    respondChange: protectedProcedure
      .input(z.object({ changeId: z.number(), approve: z.boolean(), responseNote: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const change = await db.getProjectChange(input.changeId);
        if (!change) throw new Error("变更不存在");
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: input.approve ? "project.change.approve" : "project.change.propose", projectId: change.projectId,
          resourceType: "project_change", resourceId: String(change.id), requestId: authorizationRequestId(ctx.req.headers), purpose: "respond_project_change",
        });
        const result = await db.respondProjectChangeTransaction(input.changeId, ctx.user.id, input.approve, input.responseNote);
        return result;
      }),
    withdrawChange: protectedProcedure.input(z.object({ changeId: z.number() })).mutation(async ({ ctx, input }) => {
      const change = await db.getProjectChange(input.changeId);
      if (!change) throw new Error("变更不存在");
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "project.change.propose", projectId: change.projectId, resourceType: "project_change", resourceId: String(change.id),
        requestId: authorizationRequestId(ctx.req.headers), purpose: "withdraw_project_change",
      });
      await db.withdrawProjectChange(input.changeId, ctx.user.id);
      return { success: true };
    }),
  }),

  complaints: complaintsRouter,

  // ============ 物品生命周期 ============
  items: router({
    mine: protectedProcedure.query(async ({ ctx }) => db.listItemsByOwner(ctx.user.id)),
    lifecycle: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => db.getItemLifecycle(input.id, ctx.user.id)),
    addService: protectedProcedure.input(z.object({ itemId: z.number(), serviceType: z.enum(["repair", "maintenance", "inspection", "refurbishment", "upgrade"]), description: z.string().min(2).max(2000), amount: z.number().int().min(0).optional() })).mutation(async ({ ctx, input }) => {
      const id = await db.addItemServiceRecord({ itemId: input.itemId, serviceType: input.serviceType, description: input.description, amount: input.amount }, ctx.user.id);
      return { id };
    }),
  }),

  // ============ 旧物 ============
  listings: router({
    create: protectedProcedure
      .input(listingPayloadSchema.partial({ cityName: true, swapIntent: true }))
      .mutation(async ({ ctx, input }) => {
        assertListingPayload({ ...input, cityName: input.cityName ?? "北京" });
        const profile = await db.ensureProfile(ctx.user.id);
        const id = await db.createListing({
          sellerId: ctx.user.id,
          ...input,
          cityName: input.cityName ?? profile.cityName ?? "北京",
          status: "published",
          itemStatus: "listed",
        });
        return { id };
      }),
    createDraft: protectedProcedure.input(listingPayloadSchema).mutation(async ({ ctx, input }) => {
      const id = await db.createListing({
        sellerId: ctx.user.id,
        ...input,
        status: "draft",
        itemStatus: "idle",
        imageUrls: [],
      });
      return { id };
    }),
    save: protectedProcedure.input(listingPayloadSchema.extend({
      id: z.number().int().positive(),
      imageFileIds: z.array(z.number().int().positive()).max(6).default([]),
      publish: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const { id, imageFileIds, publish, ...data } = input;
      if (publish) assertListingPayload(data);
      return db.saveListingTransaction({ listingId: id, sellerId: ctx.user.id, data, imageFileIds, publish });
    }),
    list: publicProcedure
      .input(z.object({ keyword: z.string().optional(), mode: z.string().optional(), scope: z.enum(["market", "mine"]).default("market"), ...nearbyFields }).optional())
      .query(async ({ ctx, input }) => {
        if (input?.scope === "mine") {
          if (!ctx.user) return [];
          return db.listListings({ sellerId: ctx.user.id, keyword: input?.keyword });
        }
        const rows = await db.listListings({ status: ["published", "reserved", "completed"], keyword: input?.keyword, mode: input?.mode });
        return addNearbyMetadata(rows, normalizeViewerLocation(input), (row) => row.sellerId, (row) => row.cityName);
      }),
    detail: publicProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const listing = await db.getListing(input.id);
      if (!listing || listing.status === "deleted") throw new Error("物品不存在或已删除");
      if (["draft", "closed"].includes(listing.status) && listing.sellerId !== ctx.user?.id) {
        throw new Error("物品已下架或尚未发布");
      }
      const offerList = await db.listOffers(input.id);
      const applications = await db.listGiveawayApplications(input.id);
      const userIds = [listing.sellerId, ...offerList.map((o) => o.buyerId), ...applications.map((a) => a.applicantId)];
      const profiles = await db.getProfilesByUserIds([...new Set(userIds)]);
      const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, { nickname: p.nickname }]));
      return { listing, offers: offerList, applications, profileMap };
    }),
    close: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.closeListingTransaction(input.id, ctx.user.id);
      return { success: true };
    }),
    reopen: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const listing = await db.getListing(input.id);
      if (!listing || listing.status === "deleted") throw new Error("物品发布不存在");
      if (listing.sellerId !== ctx.user.id) throw new Error("只能上架自己的物品");
      if (listing.status !== "closed") throw new Error("当前状态不能重新上架");
      const modes = (listing.modes ?? [listing.primaryMode]) as z.infer<typeof listingPayloadSchema>["modes"];
      const data = {
        title: listing.title,
        category: listing.category ?? "其他",
        brand: listing.brand ?? undefined,
        conditionLevel: listing.conditionLevel ?? "九成新",
        functionStatus: listing.functionStatus ?? "功能正常",
        description: listing.description ?? undefined,
        swapIntent: listing.swapIntent ?? undefined,
        cityName: listing.cityName ?? "北京",
        modes,
        primaryMode: listing.primaryMode as z.infer<typeof listingPayloadSchema>["primaryMode"],
        price: listing.price,
        minAcceptPrice: listing.minAcceptPrice,
        giveawayRule: listing.giveawayRule as z.infer<typeof listingPayloadSchema>["giveawayRule"],
      };
      assertListingPayload(data);
      return db.saveListingTransaction({ listingId: listing.id, sellerId: ctx.user.id, data, imageFileIds: listingImageFileIds(listing.imageUrls), publish: true });
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      return db.deleteListingTransaction(input.id, ctx.user.id);
    }),
    buyNow: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const result = await db.buyListingNowTransaction(input.id, ctx.user.id);
      await db.createNotification({
        userId: result.sellerId,
        category: "order",
        title: "物品已被拍下",
        content: `「${result.title}」已被拍下,等待买家付款。`,
        refType: "order",
        refId: result.orderId,
      });
      publishRealtime({ type: "order.updated", userId: result.sellerId, payload: { orderId: result.orderId, status: "pending_payment" } });
      return { orderId: result.orderId };
    }),
    makeOffer: protectedProcedure
      .input(z.object({ id: z.number(), amount: z.number().int().min(1), message: z.string().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        const listing = await db.getListing(input.id);
        if (!listing) throw new Error("物品不存在");
        if (listing.status !== "published") throw new Error("该物品当前不接受报价");
        if (listing.sellerId === ctx.user.id) throw new Error("不能给自己的物品报价");
        if (!(listing.modes ?? []).includes("accept_offers")) throw new Error("该物品不接受报价");
        await db.createOffer({ listingId: input.id, buyerId: ctx.user.id, amount: input.amount, message: input.message });
        await db.createNotification({
          userId: listing.sellerId,
          category: "order",
          title: "收到出价",
          content: `「${listing.title}」收到出价 ¥${input.amount}。`,
          refType: "listing",
          refId: listing.id,
        });
        return { success: true };
      }),
    acceptOffer: protectedProcedure
      .input(z.object({ listingId: z.number(), offerId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const orderId = await db.acceptOfferTransaction(input.listingId, input.offerId, ctx.user.id);
        const offerList = await db.listOffers(input.listingId);
        const accepted = offerList.find((o) => o.id === input.offerId);
        if (accepted) {
          await db.createNotification({
            userId: accepted.buyerId,
            category: "order",
            title: "出价被接受",
            content: "你的出价已被卖家接受,请尽快完成支付。",
            refType: "order",
            refId: orderId,
          });
        }
        return { orderId };
      }),
    applyGiveaway: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        const listing = await db.getListing(input.id);
        if (!listing) throw new Error("物品不存在");
        if (listing.status !== "published") throw new Error("该物品当前不可申请");
        if (listing.sellerId === ctx.user.id) throw new Error("不能申请自己的物品");
        if (!(listing.modes ?? []).includes("giveaway")) throw new Error("该物品不是赠送物品");
        await db.createGiveawayApplication({ listingId: input.id, applicantId: ctx.user.id, reason: input.reason });
        await db.createNotification({
          userId: listing.sellerId,
          category: "order",
          title: "收到领取申请",
          content: `「${listing.title}」收到新的领取申请。`,
          refType: "listing",
          refId: listing.id,
        });
        return { success: true };
      }),
    selectGiveaway: protectedProcedure
      .input(z.object({ listingId: z.number(), applicationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const orderId = await db.selectGiveawayApplication(input.listingId, input.applicationId, ctx.user.id);
        return { orderId };
    }),
  }),

  // ============ 物品置换 ============
  swaps: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const requests = await db.listSwapRequestsForUser(ctx.user.id);
      const listingList = await db.getListingsByIds(requests.flatMap((request) => [request.targetListingId, request.offeredListingId]));
      const listingMap = Object.fromEntries(listingList.map((listing) => [listing.id, listing]));
      return requests.map((request) => ({
        ...request,
        myRole: request.requesterId === ctx.user.id ? ("requester" as const) : ("owner" as const),
        targetListing: listingMap[request.targetListingId],
        offeredListing: listingMap[request.offeredListingId],
      }));
    }),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const request = await db.getSwapRequest(input.id);
      if (!request) throw new Error("置换请求不存在");
      if (request.requesterId !== ctx.user.id && request.ownerId !== ctx.user.id) throw new Error("你不是该置换的参与方");
      const listingList = await db.getListingsByIds([request.targetListingId, request.offeredListingId]);
      const listingMap = Object.fromEntries(listingList.map((listing) => [listing.id, listing]));
      const profiles = await db.getProfilesByUserIds([request.requesterId, request.ownerId]);
      const profileMap = Object.fromEntries(profiles.map((profile) => [profile.userId, { nickname: profile.nickname }]));
      return {
        request,
        targetListing: listingMap[request.targetListingId],
        offeredListing: listingMap[request.offeredListingId],
        profileMap,
        myRole: request.requesterId === ctx.user.id ? ("requester" as const) : ("owner" as const),
      };
    }),
    create: protectedProcedure.input(z.object({
      targetListingId: z.number().int().positive(),
      offeredListingId: z.number().int().positive(),
    })).mutation(async ({ ctx, input }) => {
      const result = await db.createSwapRequestTransaction({ ...input, requesterId: ctx.user.id });
      if (!result.duplicate) {
        await db.createNotification({
          userId: result.request.ownerId,
          category: "order",
          title: "收到新的置换请求",
          content: `有人想用《${result.offered.title}》置换《${result.target.title}》。`,
          refType: "swap",
          refId: result.request.id,
          dedupeKey: `swap:${result.request.id}:created`,
        });
      }
      return { id: result.request.id, duplicate: result.duplicate };
    }),
    respond: protectedProcedure.input(z.object({ id: z.number().int().positive(), accept: z.boolean() })).mutation(async ({ ctx, input }) => {
      const result = await db.respondSwapRequestTransaction({ requestId: input.id, ownerId: ctx.user.id, accept: input.accept });
      if (!result.duplicate) {
        await db.createNotification({
          userId: result.request.requesterId,
          category: "order",
          title: input.accept ? "置换请求已接受" : "置换请求未被接受",
          content: input.accept ? "请进入置换详情，与对方分别确认后完成置换。" : "你可以选择其他物品重新发起置换。",
          refType: "swap",
          refId: result.request.id,
          dedupeKey: `swap:${result.request.id}:${input.accept ? "accepted" : "rejected"}`,
        });
      }
      return { success: true, duplicate: result.duplicate };
    }),
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await db.cancelSwapRequestTransaction(input.id, ctx.user.id);
      if (!result.duplicate) {
        const otherId = result.request.requesterId === ctx.user.id ? result.request.ownerId : result.request.requesterId;
        await db.createNotification({
          userId: otherId,
          category: "order",
          title: "置换已取消",
          content: "对方取消了本次置换，相关物品已恢复为可交易状态。",
          refType: "swap",
          refId: result.request.id,
          dedupeKey: `swap:${result.request.id}:cancelled`,
        });
      }
      return { success: true, duplicate: result.duplicate };
    }),
    confirm: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await db.confirmSwapRequestTransaction(input.id, ctx.user.id);
      if (!result.duplicate) {
        const otherId = result.request.requesterId === ctx.user.id ? result.request.ownerId : result.request.requesterId;
        await db.createNotification({
          userId: otherId,
          category: "order",
          title: result.completed ? "置换已完成" : "对方已确认置换",
          content: result.completed ? "双方物品所有权已完成更新。" : "请核对交付情况并完成你的确认。",
          refType: "swap",
          refId: result.request.id,
          dedupeKey: `swap:${result.request.id}:${result.completed ? "completed" : `confirmed:${ctx.user.id}`}`,
        });
      }
      return { success: true, completed: result.completed, duplicate: result.duplicate };
    }),
  }),

  // ============ 回收 ============
  recycling: router({
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(2).max(100),
          category: z.string().max(64).default("家电"),
          conditionDesc: z.string().max(1000).optional(),
          expectedPrice: z.number().int().min(0).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const profile = await db.ensureProfile(ctx.user.id);
        const id = await db.createRecyclingRequest({
          userId: ctx.user.id,
          ...input,
          cityName: profile.cityName ?? "北京",
        });
        return { id };
      }),
    myRequests: protectedProcedure.query(async ({ ctx }) => db.listRecyclingRequests({ userId: ctx.user.id })),
    openRequests: protectedProcedure.input(nearbyInputSchema.optional()).query(async ({ input }) => {
      const rows = await db.listRecyclingRequests({ openForQuotes: true });
      return addNearbyMetadata(rows, normalizeViewerLocation(input), (row) => row.userId, (row) => row.cityName);
    }),
    detail: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const request = await db.getRecyclingRequest(input.id);
      if (!request) throw new Error("询价单不存在");
      const quoteList = await db.listRecyclingQuotes(input.id);
      const order = await db.getOrderForReference("recycling", input.id);
      return { request, quotes: quoteList, order, isOwner: request.userId === ctx.user.id };
    }),
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await db.cancelRecyclingRequestTransaction(input.id, ctx.user.id);
      if (!result.duplicate) {
        await Promise.all(result.merchantUserIds.map((merchantUserId) => db.createNotification({
          userId: merchantUserId,
          category: "order",
          title: "回收询价已取消",
          content: `回收询价《${result.request.title}》已由用户取消。`,
          refType: "recycling",
          refId: result.request.id,
          dedupeKey: `recycling:${result.request.id}:cancelled:${merchantUserId}`,
        })));
      }
      return { success: true, duplicate: result.duplicate };
    }),
    submitQuote: protectedProcedure
      .input(
        z.object({
          requestId: z.number(),
          amount: z.number().int().min(1),
          note: z.string().max(200).optional(),
          pickupTime: z.string().max(64).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await verificationService.assertMerchantApproved(ctx.user.id);
        const profile = await db.ensureProfile(ctx.user.id);
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        const request = await db.getRecyclingRequest(input.requestId);
        if (!request) throw new Error("询价单不存在");
        if (!["quoting", "quoted"].includes(request.status)) throw new Error("该询价单已结束");
        const created = await db.createRecyclingQuoteTransaction({
          requestId: input.requestId,
          merchantUserId: ctx.user.id,
          merchantName: merchant?.name ?? profile.nickname ?? "回收商家",
          amount: input.amount,
          note: input.note,
          pickupTime: input.pickupTime,
        });
        if (!created.duplicate) {
          await db.createNotification({
            userId: request.userId,
            category: "order",
            title: "收到回收报价",
            content: `你的回收询价「${request.title}」收到报价 ¥${input.amount}。`,
            refType: "recycling",
            refId: request.id,
            dedupeKey: `recycling:${request.id}:quote:${created.id}`,
          });
        }
        return { success: true, duplicate: created.duplicate };
      }),
    declineQuote: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), quoteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await db.declineRecyclingQuoteTransaction(input.requestId, input.quoteId, ctx.user.id);
      if (!result.duplicate) {
        await db.createNotification({
          userId: result.quote.merchantUserId,
          category: "order",
          title: "回收报价未被选择",
          content: "用户暂不考虑本次回收报价。",
          refType: "recycling",
          refId: input.requestId,
          dedupeKey: `recycling:${input.requestId}:quote:${input.quoteId}:declined`,
        });
      }
      return { success: true, duplicate: result.duplicate };
    }),
    selectQuote: protectedProcedure
      .input(z.object({ requestId: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const orderId = await db.selectRecyclingQuoteTransaction(input.requestId, input.quoteId, ctx.user.id);
        const quoteList = await db.listRecyclingQuotes(input.requestId);
        const selected = quoteList.find((q) => q.id === input.quoteId);
        if (selected) {
          await db.createNotification({
            userId: selected.merchantUserId,
            category: "order",
            title: "回收报价被选择",
            content: "你的回收报价已被选择,请安排上门检测与取件。",
            refType: "order",
            refId: orderId,
          });
        }
        return { orderId };
      }),
  }),

  // ============ 订单 ============
  orders: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const orderList = await db.listOrders(ctx.user.id);
      return orderList.map((o) => ({ ...o, myRole: o.buyerId === ctx.user.id ? "buyer" : "seller" }));
    }),
    detail: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const order = await db.getOrder(input.id);
      if (!order) throw new Error("订单不存在");
      if (order.buyerId !== ctx.user.id && order.sellerId !== ctx.user.id) throw new Error("你不是该订单参与方");
      const logs = await db.listOrderLogs(input.id);
      const profiles = await db.getProfilesByUserIds([order.buyerId, order.sellerId]);
      const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, { nickname: p.nickname }]));
      return { order, logs, profileMap, myRole: order.buyerId === ctx.user.id ? ("buyer" as const) : ("seller" as const) };
    }),
    pay: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const order = await db.getOrder(input.id);
      if (!order) throw new Error("订单不存在");
      if (order.buyerId !== ctx.user.id) throw new Error("只有买家可以支付");
      throw new Error("直接修改订单状态的模拟支付已停用，请通过支付单和沙箱支付确认流程完成付款");
    }),
    cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const order = await db.cancelOrderTransaction(input.id, ctx.user.id);
      publishRealtime({ type: "order.updated", userId: order.buyerId === ctx.user.id ? order.sellerId : order.buyerId, payload: { orderId: order.id, status: "cancelled" } });
      return { success: true };
    }),
    confirmDelivery: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const order = await db.getOrder(input.id);
      if (!order) throw new Error("订单不存在");
      if (order.sellerId !== ctx.user.id) throw new Error("只有卖家可以确认交付");
      if (!["pending_delivery", "pending_confirmation"].includes(order.status)) throw new Error("当前状态不能确认交付");
      await db.updateOrder(input.id, { status: "pending_acceptance" });
      await db.addOrderLog(input.id, order.status, "pending_acceptance", "卖家已交付,等待买家确认");
      await db.createNotification({
        userId: order.buyerId,
        category: "order",
        title: "等待确认收货",
        content: `订单「${order.title}」已交付,请确认收货。`,
        refType: "order",
        refId: order.id,
      });
      return { success: true };
    }),
    confirmReceipt: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const order = await db.completeOrderTransaction(input.id, ctx.user.id);
      await db.addCreditEvent({
        userId: order.sellerId,
        eventType: "order_completed",
        scoreChange: 2,
        reason: "订单顺利完成",
        refType: "order",
        refId: order.id,
      });
      await db.createNotification({
        userId: order.sellerId,
        category: "order",
        title: "订单已完成",
        content: `订单「${order.title}」已由买家确认完成。`,
        refType: "order",
        refId: order.id,
      });
      publishRealtime({ type: "order.updated", userId: order.sellerId, payload: { orderId: order.id, status: "completed" } });
      return { success: true };
    }),
    review: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          overallRating: z.number().int().min(1).max(5),
          dimensions: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
          content: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const order = await db.getOrder(input.id);
        if (!order) throw new Error("订单不存在");
        if (order.status !== "completed") throw new Error("订单完成后才能评价");
        const isBuyer = order.buyerId === ctx.user.id;
        const isSeller = order.sellerId === ctx.user.id;
        if (!isBuyer && !isSeller) throw new Error("你不是该订单参与方");
        if (isBuyer && order.buyerReviewed) throw new Error("你已评价过该订单");
        if (isSeller && order.sellerReviewed) throw new Error("你已评价过该订单");
        const revieweeId = isBuyer ? order.sellerId : order.buyerId;
        await db.createReview({
          orderId: order.id,
          reviewerId: ctx.user.id,
          revieweeId,
          overallRating: input.overallRating,
          dimensions: input.dimensions,
          content: input.content,
        });
        await db.updateOrder(order.id, isBuyer ? { buyerReviewed: true } : { sellerReviewed: true });
        await db.addCreditEvent({
          userId: revieweeId,
          eventType: "review_received",
          scoreChange: input.overallRating >= 4 ? 1 : input.overallRating <= 2 ? -2 : 0,
          reason: `收到${input.overallRating}星评价`,
          refType: "order",
          refId: order.id,
        });
        return { success: true };
      }),
  }),

  // ============ 消息与通知 ============
  messagesRouter: router({
    conversations: protectedProcedure.query(async ({ ctx }) => {
      const convs = await db.listConversations(ctx.user.id);
      const authorization = getAuthorizationService();
      const visible = (await Promise.all(convs.map(async (conversation) => ({
        conversation,
        allowed: (await authorization.authorize({
          accountId: ctx.user.id, capabilityCode: "message.read", projectId: conversation.refType === "project" ? conversation.refId : null,
          resourceType: "conversation", resourceId: String(conversation.id), expectedResourceVersion: conversation.authorizationVersion,
          requestId: authorizationRequestId(ctx.req.headers), view: "list",
        })).allowed,
      })))).filter((item) => item.allowed).map((item) => item.conversation);
      const otherIds = visible.map((c) => (c.userAId === ctx.user.id ? c.userBId : c.userAId));
      const profiles = await db.getProfilesByUserIds([...new Set(otherIds)]);
      const profileMap = new Map(profiles.map((p) => [p.userId, p]));
      const unreadMap = await db.unreadConversationCounts(ctx.user.id, visible.map((conversation) => conversation.id));
      return visible.map((c) => {
        const otherId = c.userAId === ctx.user.id ? c.userBId : c.userAId;
        return { ...c, otherId, otherNickname: profileMap.get(otherId)?.nickname ?? "用户", unreadCount: unreadMap.get(c.id) ?? 0 };
      });
    }),
    start: protectedProcedure
      .input(z.object({ targetUserId: z.number(), refType: z.string().optional(), refId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.targetUserId === ctx.user.id) throw new Error("不能和自己聊天");
        if (input.refType === "project" && input.refId) await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "message.start", projectId: input.refId, resourceType: "project", resourceId: String(input.refId), requestId: authorizationRequestId(ctx.req.headers), purpose: "start_project_conversation",
        });
        const conv = await db.getOrCreateConversation(ctx.user.id, input.targetUserId, input.refType, input.refId);
        return { conversationId: conv.id };
      }),
    messages: protectedProcedure.input(z.object({ conversationId: z.number(), cursor: z.number().int().positive().optional(), limit: z.number().int().min(10).max(100).default(50) })).query(async ({ ctx, input }) => {
      const conv = await db.getConversation(input.conversationId);
      if (!conv || (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id)) throw new Error("会话不存在");
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "message.read", projectId: conv.refType === "project" ? conv.refId : null, resourceType: "conversation", resourceId: String(conv.id),
        expectedResourceVersion: conv.authorizationVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "read_messages",
      });
      const rows = await db.listMessages(input.conversationId, input.cursor, input.limit + 1);
      const hasMore = rows.length > input.limit;
      const msgs = hasMore ? rows.slice(1) : rows;
      const otherId = conv.userAId === ctx.user.id ? conv.userBId : conv.userAId;
      const profiles = await db.getProfilesByUserIds([otherId]);
      return { messages: msgs, nextCursor: hasMore ? msgs[0]?.id : undefined, otherNickname: profiles[0]?.nickname ?? "用户", otherId };
    }),
    send: protectedProcedure
      .input(z.object({ conversationId: z.number(), clientMessageId: z.string().min(8).max(128), content: z.string().min(1).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const conv = await db.getConversation(input.conversationId);
        if (!conv || (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id)) throw new Error("会话不存在");
        await authorizeOrThrow(ctx.user.id, {
          capabilityCode: "message.send", projectId: conv.refType === "project" ? conv.refId : null, resourceType: "conversation", resourceId: String(conv.id),
          expectedResourceVersion: conv.authorizationVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "send_message",
        });
        const result = await db.sendMessage(input.conversationId, ctx.user.id, input.clientMessageId, input.content);
        if (result.created) publishRealtime({ type: "message.created", conversationId: input.conversationId, payload: result.message });
        return { success: true, messageId: result.message.id, clientMessageId: result.message.clientMessageId, duplicate: !result.created };
      }),
    notifications: protectedProcedure.query(async ({ ctx }) => db.listNotifications(ctx.user.id)),
    unreadCount: protectedProcedure.query(async ({ ctx }) => db.unreadNotificationCount(ctx.user.id)),
    markRead: protectedProcedure.input(z.object({ id: z.number().optional() }).optional()).mutation(async ({ ctx, input }) => {
      await db.markNotificationsRead(ctx.user.id, input?.id);
      return { success: true };
    }),
    markConversationRead: protectedProcedure.input(z.object({ conversationId: z.number() })).mutation(async ({ ctx, input }) => {
      const conv = await db.getConversation(input.conversationId);
      if (!conv || (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id)) throw new Error("会话不存在");
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "message.read", projectId: conv.refType === "project" ? conv.refId : null, resourceType: "conversation", resourceId: String(conv.id),
        expectedResourceVersion: conv.authorizationVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "mark_conversation_read",
      });
      await db.markConversationRead(input.conversationId, ctx.user.id);
      publishRealtime({ type: "message.read", conversationId: input.conversationId, payload: { userId: ctx.user.id } });
      return { success: true };
    }),
    receipts: protectedProcedure.input(z.object({ conversationId: z.number() })).query(async ({ ctx, input }) => {
      const conv = await db.getConversation(input.conversationId);
      if (!conv || (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id)) throw new Error("会话不存在");
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "message.read", projectId: conv.refType === "project" ? conv.refId : null, resourceType: "conversation", resourceId: String(conv.id),
        expectedResourceVersion: conv.authorizationVersion, requestId: authorizationRequestId(ctx.req.headers), purpose: "read_message_receipts",
      });
      return db.getMessageReceipts(input.conversationId);
    }),
    registerPushToken: protectedProcedure.input(z.object({ platform: z.enum(["ios", "android", "web"]), token: z.string().min(8).max(512), deviceId: z.string().max(128).optional() })).mutation(async ({ ctx, input }) => {
      await db.registerPushToken({ userId: ctx.user.id, ...input, active: true, lastSeenAt: new Date() });
      return { success: true };
    }),
    unregisterPushToken: protectedProcedure.input(z.object({ token: z.string().min(8).max(512).optional(), deviceId: z.string().min(8).max(128).optional() }).refine((input) => input.token || input.deviceId, "缺少设备标识")).mutation(async ({ ctx, input }) => {
      const deactivated = await db.deactivatePushToken(ctx.user.id, input, "用户关闭本设备通知");
      return { success: true, deactivated };
    }),
  }),

  // ============ 信用 ============
  credits: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.ensureProfile(ctx.user.id);
      const events = await db.listCreditEvents(ctx.user.id);
      const reviewList = await db.listReviewsForUser(ctx.user.id);
      return { creditScore: profile.creditScore, events, reviews: reviewList };
    }),
  }),

  realtimeAdmin: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.audit.read", purpose: "realtime_admin_stats", requestId: authorizationRequestId(ctx.req.headers) });
      return realtimeStats();
    }),
  }),

  // ============ 首页聚合 ============
  home: router({
    feed: publicProcedure.input(nearbyInputSchema.optional()).query(async ({ input }) => {
      const [needList, engineerList, listingList] = await Promise.all([
        db.listNeeds({ status: ["published", "collecting_solutions", "selecting_quote"], publicOnly: true, limit: 5 }),
        db.listEngineers(),
        db.listListings({ status: ["published"], limit: 6 }),
      ]);
      const engineerUserIds = engineerList.slice(0, 5).map((e) => e.userId);
      const profiles = await db.getProfilesByUserIds(engineerUserIds);
      const profileMap = new Map(profiles.map((p) => [p.userId, p]));
      const engineerRows = engineerList.slice(0, 5).map((e) => ({
          ...e,
          nickname: profileMap.get(e.userId)?.nickname ?? e.realName ?? "工程师",
        }));
      const viewer = normalizeViewerLocation(input);
      return {
        needs: await addNearbyMetadata(needList, viewer, (row) => row.creatorId, (row) => row.cityName),
        engineers: await addNearbyMetadata(engineerRows, viewer, (row) => row.userId, (row) => row.cityName),
        listings: await addNearbyMetadata(listingList, viewer, (row) => row.sellerId, (row) => row.cityName),
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
