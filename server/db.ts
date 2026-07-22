import { and, asc, desc, eq, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { addScheduleDays, applyProjectAmountDelta, canCreateQuoteVersion, projectAgreementStatus } from "../shared/project-rules";
import {
  InsertUser,
  users,
  userProfiles,
  userLocationPreferences,
  engineerProfiles,
  merchantProfiles,
  needs,
  needSupports,
  needComments,
  solutions,
  quotes,
  quoteVersions,
  projects,
  milestones,
  projectRequirements,
  projectFiles,
  projectChanges,
  projectAcceptances,
  projectMemberships,
  projectMembershipRoles,
  projectRoleCapabilities,
  projectRoles,
  complaints,
  complaintEvidence,
  listings,
  items,
  itemMedia,
  itemDefects,
  itemAccessories,
  itemOwnershipHistory,
  itemServiceHistory,
  itemStatusLogs,
  listingModes,
  offers,
  giveawayApplications,
  recyclingRequests,
  recyclingQuotes,
  orders,
  orderStatusLogs,
  swapRequests,
  conversations,
  messages,
  notifications,
  messageReceipts,
  notificationDeliveries,
  devicePushTokens,
  storedFiles,
  contentPosts,
  fileAccessLogs,
  auditLogs,
  reviews,
  creditEvents,
  orderLineItems,
  settlements,
  settlementItems,
} from "../drizzle/schema";
import { normalizeMoney } from "./domain/money";
import { emitRealtimeEvent } from "./event-bus";
import { getPushProvider } from "./notifications/registry";
import { logger } from "./_core/logger";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  return db;
}

export async function addAuditLog(data: typeof auditLogs.$inferInsert) {
  const db = await requireDb();
  await db.insert(auditLogs).values(data);
}

export async function getLocationPreference(userId: number) {
  const database = await requireDb();
  const rows = await database.select().from(userLocationPreferences)
    .where(eq(userLocationPreferences.userId, userId)).limit(1);
  return rows[0];
}

export async function getLocationPreferencesByUserIds(userIds: number[]) {
  if (userIds.length === 0) return [];
  const database = await requireDb();
  return database.select().from(userLocationPreferences)
    .where(inArray(userLocationPreferences.userId, [...new Set(userIds)]));
}

export async function saveLocationPreference(input: {
  userId: number;
  cityName?: string;
  regionName?: string;
  approximateLatitude?: number;
  approximateLongitude?: number;
  source: "device" | "manual";
  actorRole: string;
}) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const existing = await tx.select().from(userLocationPreferences)
      .where(eq(userLocationPreferences.userId, input.userId)).for("update").limit(1);
    const values = {
      cityName: input.cityName,
      regionName: input.regionName,
      approximateLatitude: input.source === "device" ? input.approximateLatitude?.toFixed(2) : null,
      approximateLongitude: input.source === "device" ? input.approximateLongitude?.toFixed(2) : null,
      source: input.source,
    };
    if (existing[0]) {
      await tx.update(userLocationPreferences).set(values)
        .where(eq(userLocationPreferences.userId, input.userId));
    } else {
      await tx.insert(userLocationPreferences).values({ userId: input.userId, ...values });
    }
    await tx.insert(auditLogs).values({
      actorId: input.userId,
      actorRole: input.actorRole,
      action: "location.preference.update",
      resourceType: "user_location_preference",
      resourceId: String(input.userId),
      result: "success",
      riskLevel: "sensitive",
      detail: { source: input.source, cityName: input.cityName, regionName: input.regionName },
    });
  });
}

export async function clearLocationPreference(userId: number, actorRole: string) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    await tx.delete(userLocationPreferences).where(eq(userLocationPreferences.userId, userId));
    await tx.insert(auditLogs).values({
      actorId: userId,
      actorRole,
      action: "location.preference.clear",
      resourceType: "user_location_preference",
      resourceId: String(userId),
      result: "success",
      riskLevel: "sensitive",
      detail: { reason: "user_requested" },
    });
  });
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return result[0];
}

export async function createLocalUser(input: {
  phone: string;
  passwordHash: string;
  name?: string | null;
}) {
  const db = await requireDb();
  const openId = `local:${input.phone}`;
  const result = await db.insert(users).values({
    openId,
    phone: input.phone,
    passwordHash: input.passwordHash,
    name: input.name ?? null,
    loginMethod: "phone_password",
    accountStatus: "active",
    lastSignedIn: new Date(),
  });
  const userId = Number(result[0].insertId);
  await db.insert(userProfiles).values({
    userId,
    nickname: input.name ?? `用户${input.phone.slice(-4)}`,
  });
  return getUserById(userId);
}

export async function touchUserSignedIn(id: number) {
  const db = await requireDb();
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// ============ 用户资料 ============
export async function getProfile(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return rows[0];
}

export async function ensureProfile(userId: number, defaults?: { nickname?: string }) {
  const db = await requireDb();
  const existing = await getProfile(userId);
  if (existing) return existing;
  await db.insert(userProfiles).values({ userId, nickname: defaults?.nickname ?? null });
  return (await getProfile(userId))!;
}

export async function updateProfile(userId: number, data: Partial<typeof userProfiles.$inferInsert>) {
  const db = await requireDb();
  await db.update(userProfiles).set(data).where(eq(userProfiles.userId, userId));
}

export async function getProfilesByUserIds(userIds: number[]) {
  if (userIds.length === 0) return [];
  const db = await requireDb();
  return db.select().from(userProfiles).where(inArray(userProfiles.userId, userIds));
}

export async function listActiveProjectMembers(projectId: number) {
  const db = await requireDb();
  const rows = await db.select({
    membershipId: projectMemberships.id,
    accountId: projectMemberships.accountId,
    businessIdentityId: projectMemberships.businessIdentityId,
    confidentialityClearance: projectMemberships.confidentialityClearance,
    joinedAt: projectMemberships.joinedAt,
    userName: users.name,
    nickname: userProfiles.nickname,
    avatarUrl: userProfiles.avatarUrl,
    cityName: userProfiles.cityName,
    roleCode: projectMembershipRoles.roleCode,
    roleName: projectRoles.name,
  }).from(projectMemberships)
    .innerJoin(users, eq(users.id, projectMemberships.accountId))
    .leftJoin(userProfiles, eq(userProfiles.userId, projectMemberships.accountId))
    .leftJoin(
      projectMembershipRoles,
      and(
        eq(projectMembershipRoles.projectId, projectMemberships.projectId),
        eq(projectMembershipRoles.projectMembershipId, projectMemberships.id),
        eq(projectMembershipRoles.status, "active"),
      ),
    )
    .leftJoin(
      projectRoles,
      and(
        eq(projectRoles.code, projectMembershipRoles.roleCode),
        eq(projectRoles.status, "active"),
      ),
    )
    .where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.status, "active")))
    .orderBy(asc(projectMemberships.joinedAt), asc(projectMemberships.id));
  const members = new Map<number, {
    membershipId: number;
    accountId: number;
    businessIdentityId: number | null;
    displayName: string;
    avatarUrl: string | null;
    cityName: string | null;
    confidentialityClearance: string;
    joinedAt: Date;
    roleCodes: string[];
    roleNames: string[];
  }>();
  for (const row of rows) {
    const existing = members.get(row.membershipId);
    const displayName = row.nickname?.trim() || row.userName?.trim() || `成员#${row.accountId}`;
    if (existing) {
      if (row.roleCode && !existing.roleCodes.includes(row.roleCode)) existing.roleCodes.push(row.roleCode);
      if (row.roleName && !existing.roleNames.includes(row.roleName)) existing.roleNames.push(row.roleName);
      continue;
    }
    members.set(row.membershipId, {
      membershipId: row.membershipId,
      accountId: row.accountId,
      businessIdentityId: row.businessIdentityId,
      displayName,
      avatarUrl: row.avatarUrl,
      cityName: row.cityName,
      confidentialityClearance: row.confidentialityClearance,
      joinedAt: row.joinedAt,
      roleCodes: row.roleCode ? [row.roleCode] : [],
      roleNames: row.roleName ? [row.roleName] : [],
    });
  }
  return [...members.values()];
}

export async function getProjectMemberAccessView(projectId: number, accountId: number) {
  const db = await requireDb();
  const rows = await db.select({
    membershipId: projectMemberships.id,
    roleCode: projectMembershipRoles.roleCode,
    capabilityCode: projectRoleCapabilities.capabilityCode,
  }).from(projectMemberships)
    .leftJoin(
      projectMembershipRoles,
      and(
        eq(projectMembershipRoles.projectId, projectMemberships.projectId),
        eq(projectMembershipRoles.projectMembershipId, projectMemberships.id),
        eq(projectMembershipRoles.status, "active"),
      ),
    )
    .leftJoin(
      projectRoleCapabilities,
      and(
        eq(projectRoleCapabilities.roleCode, projectMembershipRoles.roleCode),
        eq(projectRoleCapabilities.status, "active"),
      ),
    )
    .where(and(
      eq(projectMemberships.projectId, projectId),
      eq(projectMemberships.accountId, accountId),
      eq(projectMemberships.status, "active"),
    ));
  if (rows.length === 0) return null;
  return {
    membershipId: rows[0].membershipId,
    roleCodes: [...new Set(rows.map((row) => row.roleCode).filter((value): value is string => Boolean(value)))],
    capabilityCodes: [...new Set(rows.map((row) => row.capabilityCode).filter((value): value is string => Boolean(value)))],
  };
}

// ============ 工程师 ============
export async function getEngineerByUserId(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(engineerProfiles).where(eq(engineerProfiles.userId, userId)).limit(1);
  return rows[0];
}

export async function listEngineers(opts?: { keyword?: string }) {
  const db = await requireDb();
  if (opts?.keyword) {
    const kw = `%${opts.keyword}%`;
    return db
      .select()
      .from(engineerProfiles)
      .where(
        or(
          like(engineerProfiles.professionalTitle, kw),
          like(engineerProfiles.introduction, kw),
          like(engineerProfiles.primaryCategory, kw),
        ),
      )
      .orderBy(desc(engineerProfiles.rating))
      .limit(50);
  }
  return db.select().from(engineerProfiles).orderBy(desc(engineerProfiles.rating)).limit(50);
}

export async function upsertEngineer(userId: number, data: Partial<typeof engineerProfiles.$inferInsert>) {
  const db = await requireDb();
  const existing = await getEngineerByUserId(userId);
  if (existing) {
    await db.update(engineerProfiles).set(data).where(eq(engineerProfiles.userId, userId));
  } else {
    await db.insert(engineerProfiles).values({ userId, ...data });
  }
}

// ============ 商家 ============
export async function getMerchantByUserId(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, userId)).limit(1);
  return rows[0];
}

export async function listMerchants() {
  const db = await requireDb();
  return db.select().from(merchantProfiles).orderBy(desc(merchantProfiles.rating)).limit(50);
}

export async function upsertMerchant(userId: number, data: Partial<typeof merchantProfiles.$inferInsert> & { name: string }) {
  const db = await requireDb();
  const existing = await getMerchantByUserId(userId);
  if (existing) {
    await db.update(merchantProfiles).set(data).where(eq(merchantProfiles.userId, userId));
  } else {
    await db.insert(merchantProfiles).values({ userId, ...data });
  }
}

// ============ 需求 ============
export async function createNeed(data: typeof needs.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(needs).values(data);
  return Number(result[0].insertId);
}

export async function getNeed(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(needs).where(eq(needs.id, id)).limit(1);
  return rows[0];
}

export async function updateNeed(id: number, data: Partial<typeof needs.$inferInsert>) {
  const db = await requireDb();
  await db.update(needs).set(data).where(eq(needs.id, id));
}

export async function listNeeds(opts: {
  status?: string[];
  creatorId?: number;
  keyword?: string;
  needType?: string;
  publicOnly?: boolean;
  limit?: number;
}) {
  const db = await requireDb();
  const conds = [];
  if (opts.status && opts.status.length > 0) conds.push(inArray(needs.status, opts.status as any));
  if (opts.creatorId) conds.push(eq(needs.creatorId, opts.creatorId));
  if (opts.needType) conds.push(eq(needs.needType, opts.needType));
  if (opts.publicOnly) conds.push(eq(needs.visibility, "public"));
  if (opts.keyword) {
    const kw = `%${opts.keyword}%`;
    conds.push(or(like(needs.title, kw), like(needs.originalDescription, kw))!);
  }
  return db
    .select()
    .from(needs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(needs.createdAt))
    .limit(opts.limit ?? 50);
}

export async function toggleSupport(needId: number, userId: number) {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(needSupports)
    .where(and(eq(needSupports.needId, needId), eq(needSupports.userId, userId)))
    .limit(1);
  if (existing.length > 0) {
    await db.delete(needSupports).where(eq(needSupports.id, existing[0].id));
    await db.update(needs).set({ supportCount: sql`GREATEST(${needs.supportCount} - 1, 0)` }).where(eq(needs.id, needId));
    return false;
  }
  await db.insert(needSupports).values({ needId, userId });
  await db.update(needs).set({ supportCount: sql`${needs.supportCount} + 1` }).where(eq(needs.id, needId));
  return true;
}

export async function hasSupported(needId: number, userId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(needSupports)
    .where(and(eq(needSupports.needId, needId), eq(needSupports.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function listComments(needId: number) {
  const db = await requireDb();
  return db.select().from(needComments).where(eq(needComments.needId, needId)).orderBy(desc(needComments.createdAt)).limit(100);
}

export async function addComment(needId: number, userId: number, content: string) {
  const db = await requireDb();
  await db.insert(needComments).values({ needId, userId, content });
}

// ============ 方案 ============
export async function listSolutions(needId: number) {
  const db = await requireDb();
  return db.select().from(solutions).where(eq(solutions.needId, needId)).orderBy(desc(solutions.createdAt));
}

export async function createSolution(data: typeof solutions.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(solutions).values(data);
  return Number(result[0].insertId);
}

// ============ 报价 ============
export async function listQuotes(needId: number) {
  const db = await requireDb();
  return db.select().from(quotes).where(eq(quotes.needId, needId)).orderBy(desc(quotes.createdAt));
}

export async function listQuotesByEngineer(engineerId: number) {
  const db = await requireDb();
  return db.select().from(quotes).where(eq(quotes.engineerId, engineerId)).orderBy(desc(quotes.createdAt)).limit(50);
}

export async function getQuote(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  return rows[0];
}

export async function createQuote(data: typeof quotes.$inferInsert & { understanding?: string | null }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const validDays = data.validDays ?? 7;
    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
    const { understanding, ...quoteData } = data;
    const quoteResult = await tx.insert(quotes).values({ ...quoteData, expiresAt });
    const quoteId = Number(quoteResult[0].insertId);
    const versionResult = await tx.insert(quoteVersions).values({
      quoteId,
      versionNo: 1,
      totalPrice: data.totalPrice,
      durationDays: data.durationDays,
      understanding: understanding ?? null,
      deliverables: data.deliverables,
      exclusions: data.exclusions ?? null,
      paymentTerms: data.paymentTerms ?? null,
      revisionCount: data.revisionCount ?? 2,
      supportDays: data.supportDays ?? 30,
      validDays,
      changeNote: "首次提交",
      createdBy: data.engineerId,
    });
    const versionId = Number(versionResult[0].insertId);
    await tx.update(quotes).set({ currentVersionId: versionId }).where(eq(quotes.id, quoteId));
    return quoteId;
  });
}

export async function updateQuote(id: number, data: Partial<typeof quotes.$inferInsert>) {
  const db = await requireDb();
  await db.update(quotes).set(data).where(eq(quotes.id, id));
}

export async function listQuoteVersions(quoteId: number) {
  const db = await requireDb();
  return db.select().from(quoteVersions).where(eq(quoteVersions.quoteId, quoteId)).orderBy(desc(quoteVersions.versionNo));
}

export async function createQuoteVersion(
  quoteId: number,
  engineerId: number,
  data: {
    totalPrice: number;
    durationDays: number;
    understanding?: string;
    deliverables: string;
    exclusions?: string;
    paymentTerms?: string;
    revisionCount: number;
    supportDays: number;
    validDays: number;
    changeNote: string;
  },
) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const quoteRows = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update").limit(1);
    const quote = quoteRows[0];
    if (!quote) throw new Error("报价不存在");
    if (quote.engineerId !== engineerId) throw new Error("只有报价工程师可以创建新版本");
    if (!canCreateQuoteVersion(quote.status)) throw new Error("当前报价状态不能修改");
    const versionRows = await tx.select({ maxVersion: sql<number>`coalesce(max(${quoteVersions.versionNo}), 0)` }).from(quoteVersions).where(eq(quoteVersions.quoteId, quoteId));
    const nextVersion = Number(versionRows[0]?.maxVersion ?? 0) + 1;
    const versionResult = await tx.insert(quoteVersions).values({
      quoteId,
      versionNo: nextVersion,
      totalPrice: data.totalPrice,
      durationDays: data.durationDays,
      understanding: data.understanding,
      deliverables: data.deliverables,
      exclusions: data.exclusions,
      paymentTerms: data.paymentTerms,
      revisionCount: data.revisionCount,
      supportDays: data.supportDays,
      validDays: data.validDays,
      changeNote: data.changeNote,
      createdBy: engineerId,
    });
    const versionId = Number(versionResult[0].insertId);
    await tx.update(quotes).set({
      currentVersionId: versionId,
      totalPrice: data.totalPrice,
      durationDays: data.durationDays,
      deliverables: data.deliverables,
      exclusions: data.exclusions,
      paymentTerms: data.paymentTerms,
      revisionCount: data.revisionCount,
      supportDays: data.supportDays,
      validDays: data.validDays,
      expiresAt: new Date(Date.now() + data.validDays * 24 * 60 * 60 * 1000),
      status: "submitted",
    }).where(eq(quotes.id, quoteId));
    return { versionId, versionNo: nextVersion };
  });
}

/**
 * 接受报价核心事务:标记accepted、其他not_selected、创建项目与默认里程碑、更新需求状态。
 */
export async function acceptQuoteTransaction(needId: number, quoteId: number, ownerId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const needRows = await tx.select().from(needs).where(eq(needs.id, needId)).for("update").limit(1);
    const need = needRows[0];
    if (!need) throw new Error("需求不存在");
    if (need.creatorId !== ownerId) throw new Error("只有需求创建者可以接受报价");
    if (!["published", "collecting_solutions", "selecting_quote"].includes(need.status)) {
      throw new Error("当前需求状态不允许接受报价");
    }
    const quoteRows = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update").limit(1);
    const quote = quoteRows[0];
    if (!quote || quote.needId !== needId) throw new Error("报价不存在");
    if (!["submitted", "viewed", "negotiating"].includes(quote.status)) {
      throw new Error("该报价已被处理,无法接受");
    }

    await tx.update(quotes).set({ status: "accepted" }).where(eq(quotes.id, quoteId));
    await tx
      .update(quotes)
      .set({ status: "not_selected" })
      .where(
        and(
          eq(quotes.needId, needId),
          inArray(quotes.status, ["submitted", "viewed", "negotiating"]),
          sql`${quotes.id} != ${quoteId}`,
        ),
      );

    const projectResult = await tx.insert(projects).values({
      needId,
      quoteId,
      ownerId,
      engineerId: quote.engineerId,
      title: need.title,
      totalAmount: quote.totalPrice,
      ownerConfirmedAt: new Date(),
      expectedEndAt: new Date(Date.now() + quote.durationDays * 24 * 60 * 60 * 1000),
      status: "pending_confirmation",
    });
    const projectId = Number(projectResult[0].insertId);

    const requirementContent = [
      need.originalDescription ?? need.title,
      need.structuredData ? `\n结构化需求：${JSON.stringify(need.structuredData)}` : "",
      `\n报价交付内容：${quote.deliverables}`,
    ].join("");
    await tx.insert(projectRequirements).values({
      projectId,
      versionNo: 1,
      title: `${need.title} - 正式需求 V1`,
      content: requirementContent,
      acceptanceCriteria: quote.deliverables,
      exclusions: quote.exclusions,
      status: "pending_confirmation",
      ownerConfirmedAt: new Date(),
      createdBy: ownerId,
    });

    // 默认里程碑草案:按报价拆分两个阶段
    const half = Math.floor(quote.totalPrice / 2);
    await tx.insert(milestones).values([
      {
        projectId,
        title: "第一阶段:方案与初稿交付",
        description: "根据正式需求完成初步方案与首版交付内容。",
        amount: half,
        sortOrder: 1,
        status: "pending",
      },
      {
        projectId,
        title: "第二阶段:最终交付与验收",
        description: "完成全部交付内容并通过最终验收。",
        amount: quote.totalPrice - half,
        sortOrder: 2,
        status: "pending",
      },
    ]);

    const orderResult = await tx.insert(orders).values({
      orderType: "project",
      buyerId: ownerId,
      sellerId: quote.engineerId,
      refId: projectId,
      title: `[项目] ${need.title}`,
      amount: quote.totalPrice,
      status: "pending_payment",
    });
    const orderId = Number(orderResult[0].insertId);
    await tx.insert(orderStatusLogs).values({ orderId, toStatus: "pending_payment", note: "双方确认后创建项目订单，等待支付" });

    await tx.update(needs).set({ status: "project_created" }).where(eq(needs.id, needId));
    return projectId;
  });
}

// ============ 项目 ============
export async function listProjects(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(projects)
    .where(or(eq(projects.ownerId, userId), eq(projects.engineerId, userId)))
    .orderBy(desc(projects.createdAt))
    .limit(50);
}

export async function getProject(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0];
}

export async function updateProject(id: number, data: Partial<typeof projects.$inferInsert>) {
  const db = await requireDb();
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function listMilestones(projectId: number) {
  const db = await requireDb();
  return db.select().from(milestones).where(eq(milestones.projectId, projectId)).orderBy(milestones.sortOrder);
}

export async function getMilestone(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
  return rows[0];
}

export async function updateMilestone(id: number, data: Partial<typeof milestones.$inferInsert>) {
  const db = await requireDb();
  await db.update(milestones).set(data).where(eq(milestones.id, id));
}


export async function listProjectRequirements(projectId: number) {
  const db = await requireDb();
  return db.select().from(projectRequirements).where(eq(projectRequirements.projectId, projectId)).orderBy(desc(projectRequirements.versionNo));
}

export async function confirmProjectAgreementTransaction(projectId: number, userId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const projectRows = await tx.select().from(projects).where(eq(projects.id, projectId)).for("update").limit(1);
    const project = projectRows[0];
    if (!project) throw new Error("项目不存在");
    if (project.ownerId !== userId && project.engineerId !== userId) throw new Error("你不是该项目成员");
    if (!["pending_confirmation", "pending_agreement"].includes(project.status)) throw new Error("当前状态无需确认协议");

    const reqRows = await tx.select().from(projectRequirements)
      .where(eq(projectRequirements.projectId, projectId))
      .orderBy(desc(projectRequirements.versionNo))
      .for("update")
      .limit(1);
    const requirement = reqRows[0];
    if (!requirement) throw new Error("项目正式需求不存在");

    const now = new Date();
    const isOwner = project.ownerId === userId;
    const ownerConfirmedAt = isOwner ? now : project.ownerConfirmedAt;
    const engineerConfirmedAt = !isOwner ? now : project.engineerConfirmedAt;
    const requirementOwnerConfirmedAt = isOwner ? now : requirement.ownerConfirmedAt;
    const requirementEngineerConfirmedAt = !isOwner ? now : requirement.engineerConfirmedAt;
    const allConfirmed = Boolean(ownerConfirmedAt && engineerConfirmedAt && requirementOwnerConfirmedAt && requirementEngineerConfirmedAt);
    const nextStatus = projectAgreementStatus(Boolean(ownerConfirmedAt), Boolean(engineerConfirmedAt));

    await tx.update(projects).set({
      ownerConfirmedAt,
      engineerConfirmedAt,
      status: nextStatus,
    }).where(eq(projects.id, projectId));
    await tx.update(projectRequirements).set({
      ownerConfirmedAt: requirementOwnerConfirmedAt,
      engineerConfirmedAt: requirementEngineerConfirmedAt,
      status: allConfirmed ? "effective" : "pending_confirmation",
    }).where(eq(projectRequirements.id, requirement.id));
    return { allConfirmed };
  });
}

export async function listProjectFiles(projectId: number) {
  const db = await requireDb();
  return db.select().from(projectFiles).where(eq(projectFiles.projectId, projectId)).orderBy(desc(projectFiles.createdAt));
}

export async function getProjectFile(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(projectFiles).where(eq(projectFiles.id, id)).limit(1);
  return rows[0];
}

export async function createProjectFile(data: {
  projectId: number;
  milestoneId?: number;
  fileGroupId: string;
  fileName: string;
  storageKey: string;
  publicUrl?: string;
  mimeType?: string;
  sizeBytes: number;
  category: "requirement" | "design" | "delivery" | "test" | "agreement" | "other";
  description?: string;
  formalSubmission: boolean;
  confidentialityLevel?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "NDA" | "RESTRICTED";
  ndaRequired?: boolean;
  uploadedBy: number;
}) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select({ versionNo: projectFiles.versionNo }).from(projectFiles)
      .where(eq(projectFiles.fileGroupId, data.fileGroupId)).for("update");
    const versionNo = Math.max(0, ...rows.map((row) => row.versionNo)) + 1;
    if (versionNo > 1) {
      await tx.update(projectFiles).set({ status: "superseded" }).where(and(eq(projectFiles.fileGroupId, data.fileGroupId), eq(projectFiles.status, "available")));
    }
    const result = await tx.insert(projectFiles).values({ ...data, versionNo, status: "available" });
    return { id: Number(result[0].insertId), versionNo };
  });
}

export async function disableProjectFile(id: number, userId: number) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(projectFiles).where(eq(projectFiles.id, id)).for("update").limit(1);
    const file = rows[0];
    if (!file) throw new Error("文件不存在");
    if (file.uploadedBy !== userId) throw new Error("只能停用自己上传的文件");
    const milestoneRows = file.milestoneId ? await tx.select().from(milestones).where(eq(milestones.id, file.milestoneId)).for("update").limit(1) : [];
    if (file.formalSubmission || milestoneRows[0]?.submittedAt) throw new Error("正式交付或验收依据文件不能删除，只能由新版本替代");
    await tx.update(projectFiles).set({ status: "disabled" }).where(eq(projectFiles.id, id));
    const storedRows = await tx.select().from(storedFiles).where(eq(storedFiles.storageKey, file.storageKey)).for("update").limit(1);
    if (storedRows[0]) {
      await tx.update(storedFiles).set({ status: "disabled" }).where(eq(storedFiles.id, storedRows[0].id));
      await tx.insert(fileAccessLogs).values({ fileId: storedRows[0].id, userId, action: "disable", relatedEntityType: "project", relatedEntityId: file.projectId, result: "success", reason: "user_disabled" });
    }
  });
}

export async function listProjectChanges(projectId: number) {
  const db = await requireDb();
  return db.select().from(projectChanges).where(eq(projectChanges.projectId, projectId)).orderBy(desc(projectChanges.createdAt));
}

export async function getProjectChange(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(projectChanges).where(eq(projectChanges.id, id)).limit(1);
  return row;
}

export async function createProjectChange(data: typeof projectChanges.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(projectChanges).values(data);
  return Number(result[0].insertId);
}

export async function respondProjectChangeTransaction(changeId: number, userId: number, approve: boolean, responseNote?: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const changeRows = await tx.select().from(projectChanges).where(eq(projectChanges.id, changeId)).for("update").limit(1);
    const change = changeRows[0];
    if (!change) throw new Error("变更单不存在");
    if (change.status !== "pending_confirmation") throw new Error("该变更单已处理");
    const projectRows = await tx.select().from(projects).where(eq(projects.id, change.projectId)).for("update").limit(1);
    const project = projectRows[0];
    if (!project) throw new Error("项目不存在");
    if (project.ownerId !== userId && project.engineerId !== userId) throw new Error("你不是该项目成员");
    if (change.requesterId === userId) throw new Error("变更提出人不能代替对方确认");

    if (!approve) {
      await tx.update(projectChanges).set({ status: "rejected", respondedBy: userId, responseNote, respondedAt: new Date() }).where(eq(projectChanges.id, changeId));
      return { approved: false };
    }

    const requirementRows = await tx.select().from(projectRequirements)
      .where(eq(projectRequirements.projectId, project.id))
      .orderBy(desc(projectRequirements.versionNo))
      .for("update")
      .limit(1);
    const currentRequirement = requirementRows[0];
    const nextVersion = (currentRequirement?.versionNo ?? 0) + 1;
    if (currentRequirement) {
      await tx.update(projectRequirements).set({ status: "superseded" }).where(eq(projectRequirements.id, currentRequirement.id));
    }
    const combinedContent = [
      currentRequirement?.content ?? "",
      `\n\n【变更 V${nextVersion}】${change.title}\n${change.changeContent}`,
      change.deliverableImpact ? `\n交付影响：${change.deliverableImpact}` : "",
    ].join("");
    await tx.insert(projectRequirements).values({
      projectId: project.id,
      versionNo: nextVersion,
      title: `${project.title} - 正式需求 V${nextVersion}`,
      content: combinedContent,
      acceptanceCriteria: currentRequirement?.acceptanceCriteria,
      exclusions: currentRequirement?.exclusions,
      status: "effective",
      ownerConfirmedAt: new Date(),
      engineerConfirmedAt: new Date(),
      sourceChangeId: change.id,
      createdBy: change.requesterId,
    });
    const expectedEndAt = addScheduleDays(project.expectedEndAt, change.scheduleDeltaDays);
    await tx.update(projects).set({
      totalAmount: applyProjectAmountDelta(project.totalAmount, change.amountDelta),
      expectedEndAt,
    }).where(eq(projects.id, project.id));
    await tx.update(projectChanges).set({ status: "approved", respondedBy: userId, responseNote, respondedAt: new Date() }).where(eq(projectChanges.id, changeId));
    return { approved: true, requirementVersion: nextVersion };
  });
}

export async function withdrawProjectChange(changeId: number, userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(projectChanges).where(eq(projectChanges.id, changeId)).limit(1);
  const change = rows[0];
  if (!change) throw new Error("变更单不存在");
  if (change.requesterId !== userId) throw new Error("只有提出人可以撤回");
  if (change.status !== "pending_confirmation") throw new Error("当前状态不能撤回");
  await db.update(projectChanges).set({ status: "withdrawn" }).where(eq(projectChanges.id, changeId));
}

export async function createProjectAcceptance(data: typeof projectAcceptances.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(projectAcceptances).values(data);
  return Number(result[0].insertId);
}

export async function listProjectAcceptances(projectId: number) {
  const db = await requireDb();
  return db.select().from(projectAcceptances).where(eq(projectAcceptances.projectId, projectId)).orderBy(desc(projectAcceptances.createdAt));
}


export async function submitMilestoneTransaction(milestoneId: number, engineerId: number, deliveryNote: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const milestoneRows = await tx.select().from(milestones).where(eq(milestones.id, milestoneId)).for("update").limit(1);
    const milestone = milestoneRows[0];
    if (!milestone) throw new Error("里程碑不存在");
    const projectRows = await tx.select().from(projects).where(eq(projects.id, milestone.projectId)).for("update").limit(1);
    const project = projectRows[0];
    if (!project || project.engineerId !== engineerId) throw new Error("只有项目工程师可以提交交付");
    if (!["in_progress", "revision_required"].includes(milestone.status)) throw new Error("当前里程碑状态不能提交交付");
    if (!["in_progress", "revision", "waiting_acceptance"].includes(project.status)) throw new Error("当前项目状态不能提交交付");
    const [submitterMembership] = await tx.select({ id: projectMemberships.id }).from(projectMemberships)
      .where(and(eq(projectMemberships.projectId, project.id), eq(projectMemberships.accountId, engineerId), eq(projectMemberships.status, "active"))).limit(1);
    await tx.update(milestones).set({ status: "waiting_acceptance", deliveryNote, submittedAt: new Date(), lastSubmittedByProjectMembershipId: submitterMembership?.id ?? null }).where(eq(milestones.id, milestoneId));
    await tx.update(projects).set({ status: "waiting_acceptance" }).where(eq(projects.id, project.id));
    return { project, milestone };
  });
}

export async function acceptMilestoneTransaction(milestoneId: number, ownerId: number, comment?: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const milestoneRows = await tx.select().from(milestones).where(eq(milestones.id, milestoneId)).for("update").limit(1);
    const milestone = milestoneRows[0];
    if (!milestone) throw new Error("里程碑不存在");
    const projectRows = await tx.select().from(projects).where(eq(projects.id, milestone.projectId)).for("update").limit(1);
    const project = projectRows[0];
    if (!project || project.ownerId !== ownerId) throw new Error("只有项目所有者可以验收");
    if (milestone.status !== "waiting_acceptance") throw new Error("当前状态不能验收");

    const [reviewerMembership] = await tx.select({ id: projectMemberships.id }).from(projectMemberships)
      .where(and(eq(projectMemberships.projectId, project.id), eq(projectMemberships.accountId, ownerId), eq(projectMemberships.status, "active"))).limit(1);

    await tx.update(milestones).set({ status: "accepted", acceptedAt: new Date() }).where(eq(milestones.id, milestoneId));
    await tx.insert(projectAcceptances).values({
      projectId: project.id,
      milestoneId,
      result: "accepted",
      comment,
      submittedBy: ownerId,
      reviewerProjectMembershipId: reviewerMembership?.id ?? null,
    });

    const settlementIdempotencyKey = `milestone:${milestoneId}:settlement`;
    const existingSettlement = await tx.select().from(settlements).where(eq(settlements.milestoneId, milestoneId)).limit(1);
    if (existingSettlement.length > 0) throw new Error("该里程碑已创建结算申请");
    const settlementResult = await tx.insert(settlements).values({
      settlementNo: `SET${Date.now()}${String(milestoneId).padStart(8, "0")}`,
      projectId: project.id,
      milestoneId,
      payeeId: project.engineerId,
      amount: normalizeMoney(milestone.amount ?? 0),
      status: "pending",
      idempotencyKey: settlementIdempotencyKey,
    });
    const settlementId = Number(settlementResult[0].insertId);
    const orderRows = await tx.select().from(orders).where(and(eq(orders.orderType, "project"), eq(orders.refId, project.id))).limit(1);
    await tx.insert(settlementItems).values({
      settlementId,
      milestoneId,
      orderId: orderRows[0]?.id,
      itemType: "milestone",
      description: milestone.title,
      amount: normalizeMoney(milestone.amount ?? 0),
    });

    const milestoneList = await tx.select().from(milestones).where(eq(milestones.projectId, project.id)).orderBy(milestones.sortOrder);
    const remaining = milestoneList.filter((m) => m.id !== milestoneId && m.status !== "accepted" && m.status !== "cancelled");
    if (remaining.length === 0) {
      await tx.update(projects).set({ status: "completed", completedAt: new Date() }).where(eq(projects.id, project.id));
      if (project.needId != null) {
        await tx.update(needs).set({ status: "solved" }).where(eq(needs.id, project.needId));
      }
      const existingOrder = await tx.select().from(orders).where(and(eq(orders.orderType, "project"), eq(orders.refId, project.id))).limit(1);
      if (existingOrder.length === 0) {
        await tx.insert(orders).values({
          orderType: "project",
          buyerId: project.ownerId,
          sellerId: project.engineerId,
          refId: project.id,
          title: `[项目] ${project.title}`,
          amount: project.totalAmount,
          status: "completed",
          completedAt: new Date(),
        });
      }
      await tx.insert(creditEvents).values({
        userId: project.engineerId,
        eventType: "project_completed",
        scoreChange: 5,
        reason: "项目按约完成",
        refType: "project",
        refId: project.id,
      });
      return { project, milestone, completed: true, nextMilestone: null };
    }
    const next = remaining.sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (next.status === "pending") await tx.update(milestones).set({ status: "in_progress" }).where(eq(milestones.id, next.id));
    await tx.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
    return { project, milestone, completed: false, nextMilestone: next };
  });
}

export async function requestMilestoneRevisionTransaction(milestoneId: number, ownerId: number, reason: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const milestoneRows = await tx.select().from(milestones).where(eq(milestones.id, milestoneId)).for("update").limit(1);
    const milestone = milestoneRows[0];
    if (!milestone) throw new Error("里程碑不存在");
    const projectRows = await tx.select().from(projects).where(eq(projects.id, milestone.projectId)).for("update").limit(1);
    const project = projectRows[0];
    if (!project || project.ownerId !== ownerId) throw new Error("只有项目所有者可以要求修改");
    if (milestone.status !== "waiting_acceptance") throw new Error("当前状态不能要求修改");
    await tx.update(milestones).set({ status: "revision_required", revisionReason: reason }).where(eq(milestones.id, milestoneId));
    await tx.update(projects).set({ status: "revision" }).where(eq(projects.id, project.id));
    await tx.insert(projectAcceptances).values({
      projectId: project.id,
      milestoneId,
      result: "revision_required",
      comment: reason,
      submittedBy: ownerId,
    });
    return { project, milestone };
  });
}

export async function createComplaint(data: typeof complaints.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(complaints).values(data);
  return Number(result[0].insertId);
}

export async function listComplaintsForUser(userId: number) {
  const db = await requireDb();
  return db.select().from(complaints).where(or(eq(complaints.complainantId, userId), eq(complaints.respondentId, userId))).orderBy(desc(complaints.createdAt));
}

export async function listComplaintsForRelated(relatedType: typeof complaints.$inferSelect["relatedType"], relatedId: number) {
  const db = await requireDb();
  return db.select().from(complaints).where(and(eq(complaints.relatedType, relatedType), eq(complaints.relatedId, relatedId))).orderBy(desc(complaints.createdAt));
}

export async function getComplaint(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
  return rows[0];
}

export async function respondComplaint(id: number, userId: number, statement: string) {
  const db = await requireDb();
  const complaint = await getComplaint(id);
  if (!complaint) throw new Error("投诉不存在");
  if (complaint.respondentId !== userId) throw new Error("只有被投诉方可以回应");
  if (!["submitted", "waiting_response", "under_review"].includes(complaint.status)) throw new Error("当前状态不能回应");
  await db.update(complaints).set({ respondentStatement: statement, status: "under_review" }).where(eq(complaints.id, id));
}

export async function addComplaintEvidence(data: typeof complaintEvidence.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(complaintEvidence).values(data);
  return Number(result[0].insertId);
}

export async function listComplaintEvidence(complaintId: number) {
  const db = await requireDb();
  return db.select().from(complaintEvidence).where(eq(complaintEvidence.complaintId, complaintId)).orderBy(desc(complaintEvidence.createdAt));
}

// ============ 旧物 ============
export async function createListing(data: typeof listings.$inferInsert) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const itemTargetStatus = data.status === "draft" ? "idle" : "listed";
    let itemId = data.itemId;
    if (!itemId) {
      const itemResult = await tx.insert(items).values({
        ownerId: data.sellerId,
        title: data.title,
        category: data.category,
        brand: data.brand,
        conditionLevel: data.conditionLevel,
        functionStatus: data.functionStatus,
        cityName: data.cityName,
        status: itemTargetStatus,
      });
      itemId = Number(itemResult[0].insertId);
      await tx.insert(itemOwnershipHistory).values({
        itemId,
        fromUserId: null,
        toUserId: data.sellerId,
        transferType: "created",
        note: "由旧物发布创建物品档案",
      });
      await tx.insert(itemStatusLogs).values({ itemId, toStatus: itemTargetStatus, operatorId: data.sellerId, reason: data.status === "draft" ? "保存发布草稿" : "创建发布" });
      for (const [indexNo, url] of (data.imageUrls ?? []).entries()) {
        await tx.insert(itemMedia).values({ itemId, url, purpose: indexNo === 0 ? "cover" : "detail", sortOrder: indexNo });
      }
    } else {
      const itemRows = await tx.select().from(items).where(eq(items.id, itemId)).for("update").limit(1);
      const item = itemRows[0];
      if (!item || item.ownerId !== data.sellerId) throw new Error("无权发布该物品");
      if (!['idle', 'in_use'].includes(item.status)) throw new Error("物品当前状态不可发布");
      const activeListings = await tx.select({ id: listings.id }).from(listings)
        .where(and(eq(listings.itemId, itemId), inArray(listings.status, ["published", "reserved"]))).for("update").limit(1);
      if (activeListings.length) throw new Error("该物品已有有效发布或成交锁");
      if (item.status !== itemTargetStatus) {
        await tx.update(items).set({ status: itemTargetStatus }).where(and(eq(items.id, itemId), eq(items.ownerId, data.sellerId)));
        await tx.insert(itemStatusLogs).values({ itemId, fromStatus: item.status, toStatus: itemTargetStatus, operatorId: data.sellerId, reason: data.status === "draft" ? "保存发布草稿" : "创建发布" });
      }
    }
    const result = await tx.insert(listings).values({ ...data, itemId });
    const listingId = Number(result[0].insertId);
    for (const mode of new Set(data.modes ?? [data.primaryMode])) {
      await tx.insert(listingModes).values({ listingId, modeCode: mode as any, active: true });
    }
    return listingId;
  });
}

export async function getListing(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  return rows[0];
}

export async function updateListing(id: number, data: Partial<typeof listings.$inferInsert>) {
  const db = await requireDb();
  await db.update(listings).set(data).where(eq(listings.id, id));
}

export async function listListings(opts: { sellerId?: number; status?: string[]; keyword?: string; mode?: string; limit?: number }) {
  const db = await requireDb();
  const conds = [];
  if (opts.sellerId) conds.push(eq(listings.sellerId, opts.sellerId));
  if (opts.status && opts.status.length > 0) conds.push(inArray(listings.status, opts.status as any));
  if (opts.keyword) {
    const kw = `%${opts.keyword}%`;
    conds.push(or(like(listings.title, kw), like(listings.description, kw))!);
  }
  if (opts.mode) conds.push(eq(listings.primaryMode, opts.mode));
  if (!opts.status?.includes("deleted")) conds.push(ne(listings.status, "deleted"));
  return db
    .select()
    .from(listings)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(listings.createdAt))
    .limit(opts.limit ?? 50);
}

export type ListingEditableInput = Pick<
  typeof listings.$inferInsert,
  | "title"
  | "category"
  | "brand"
  | "conditionLevel"
  | "functionStatus"
  | "description"
  | "swapIntent"
  | "cityName"
  | "modes"
  | "primaryMode"
  | "price"
  | "minAcceptPrice"
  | "giveawayRule"
>;

async function listingImageTokens(
  tx: Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0],
  listingId: number,
  ownerId: number,
  fileIds: number[],
) {
  const uniqueIds = [...new Set(fileIds)];
  if (uniqueIds.length > 6) throw new Error("每件物品最多上传 6 张图片");
  if (uniqueIds.length === 0) return [];
  const files = await tx.select().from(storedFiles).where(inArray(storedFiles.id, uniqueIds)).for("update");
  if (files.length !== uniqueIds.length) throw new Error("部分图片不存在，请重新选择");
  for (const file of files) {
    if (file.ownerId !== ownerId || file.status !== "available" || file.privacyLevel !== "public" || !file.mimeType.startsWith("image/")) {
      throw new Error("图片状态或权限已变化，请重新上传");
    }
    if (["pending", "rejected"].includes(file.virusScanStatus)) throw new Error("图片安全检查未通过");
  }
  await tx.update(storedFiles).set({ relatedEntityType: "listing", relatedEntityId: listingId }).where(inArray(storedFiles.id, uniqueIds));
  return uniqueIds.map((id) => `file:${id}`);
}

export async function saveListingTransaction(input: {
  listingId: number;
  sellerId: number;
  data: ListingEditableInput;
  imageFileIds: number[];
  publish: boolean;
}) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const rows = await tx.select().from(listings).where(eq(listings.id, input.listingId)).for("update").limit(1);
    const listing = rows[0];
    if (!listing || listing.status === "deleted") throw new Error("物品发布不存在");
    if (listing.sellerId !== input.sellerId) throw new Error("只能修改自己的物品");
    if (!input.data.modes?.includes(input.data.primaryMode!)) throw new Error("主要方式必须在所选交易方式中");
    if (["reserved", "completed"].includes(listing.status)) throw new Error("物品已进入交易或已成交，不能编辑");

    const itemRows = listing.itemId
      ? await tx.select().from(items).where(eq(items.id, listing.itemId)).for("update").limit(1)
      : [];
    const item = itemRows[0];
    if (!item || item.ownerId !== input.sellerId) throw new Error("物品所有权状态已变化");

    if (input.publish) {
      if (!["idle", "in_use", "listed"].includes(item.status)) throw new Error("物品当前状态不能上架");
      const otherActive = await tx
        .select({ id: listings.id })
        .from(listings)
        .where(and(eq(listings.itemId, item.id), ne(listings.id, listing.id), inArray(listings.status, ["published", "reserved"])))
        .for("update")
        .limit(1);
      if (otherActive.length) throw new Error("该物品已有其他有效发布");
    }

    const imageUrls = await listingImageTokens(tx, listing.id, input.sellerId, input.imageFileIds);
    const nextStatus = input.publish ? "published" : listing.status;
    await tx.update(listings).set({
      ...input.data,
      imageUrls,
      status: nextStatus,
      itemStatus: input.publish ? "listed" : listing.itemStatus,
    }).where(eq(listings.id, listing.id));

    await tx.delete(listingModes).where(eq(listingModes.listingId, listing.id));
    for (const mode of new Set(input.data.modes ?? [input.data.primaryMode!])) {
      await tx.insert(listingModes).values({ listingId: listing.id, modeCode: mode as (typeof listingModes.$inferInsert)["modeCode"], active: true });
    }
    await tx.update(items).set({
      title: input.data.title,
      category: input.data.category,
      brand: input.data.brand,
      conditionLevel: input.data.conditionLevel,
      functionStatus: input.data.functionStatus,
      cityName: input.data.cityName,
      status: input.publish ? "listed" : item.status,
    }).where(eq(items.id, item.id));
    await tx.delete(itemMedia).where(eq(itemMedia.itemId, item.id));
    for (const [indexNo, url] of imageUrls.entries()) {
      await tx.insert(itemMedia).values({ itemId: item.id, url, purpose: indexNo === 0 ? "cover" : "detail", sortOrder: indexNo });
    }
    if (input.publish && item.status !== "listed") {
      await tx.insert(itemStatusLogs).values({ itemId: item.id, fromStatus: item.status, toStatus: "listed", operatorId: input.sellerId, reason: listing.status === "draft" ? "发布草稿" : "重新上架" });
    }
    return { id: listing.id, status: nextStatus };
  });
}

export async function closeListingTransaction(listingId: number, sellerId: number) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const rows = await tx.select().from(listings).where(eq(listings.id, listingId)).for("update").limit(1);
    const listing = rows[0];
    if (!listing || listing.status === "deleted") throw new Error("物品发布不存在");
    if (listing.sellerId !== sellerId) throw new Error("只有发布者可以下架");
    if (listing.status !== "published") throw new Error("当前状态不能下架");
    const activeSwap = await tx.select({ id: swapRequests.id }).from(swapRequests)
      .where(and(or(eq(swapRequests.targetListingId, listingId), eq(swapRequests.offeredListingId, listingId)), inArray(swapRequests.status, ["submitted", "awaiting_confirmations"])))
      .for("update").limit(1);
    if (activeSwap.length) throw new Error("该物品有进行中的置换请求，请先处理后再下架");
    await tx.update(listings).set({ status: "closed", itemStatus: "idle" }).where(eq(listings.id, listingId));
    if (listing.itemId) {
      const itemRows = await tx.select().from(items).where(eq(items.id, listing.itemId)).for("update").limit(1);
      const item = itemRows[0];
      if (item?.ownerId === sellerId && item.status === "listed") {
        await tx.update(items).set({ status: "idle" }).where(eq(items.id, item.id));
        await tx.insert(itemStatusLogs).values({ itemId: item.id, fromStatus: item.status, toStatus: "idle", operatorId: sellerId, reason: "物品下架" });
      }
    }
    return listing;
  });
}

export async function deleteListingTransaction(listingId: number, sellerId: number) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const rows = await tx.select().from(listings).where(eq(listings.id, listingId)).for("update").limit(1);
    const listing = rows[0];
    if (!listing || listing.status === "deleted") return { id: listingId, alreadyDeleted: true };
    if (listing.sellerId !== sellerId) throw new Error("只能删除自己的物品");
    if (!['draft', 'closed'].includes(listing.status)) throw new Error("请先下架物品；交易中的物品不能删除");
    const orderRows = await tx.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.orderType, "listing"), eq(orders.refId, listingId), ne(orders.status, "cancelled"))).for("update").limit(1);
    if (orderRows.length) throw new Error("该物品已有交易记录，不能删除");
    const activeSwap = await tx.select({ id: swapRequests.id }).from(swapRequests)
      .where(and(or(eq(swapRequests.targetListingId, listingId), eq(swapRequests.offeredListingId, listingId)), inArray(swapRequests.status, ["submitted", "awaiting_confirmations"])))
      .for("update").limit(1);
    if (activeSwap.length) throw new Error("该物品有进行中的置换请求，不能删除");
    await tx.update(listings).set({ status: "deleted", itemStatus: "idle" }).where(eq(listings.id, listingId));
    await tx.update(listingModes).set({ active: false }).where(eq(listingModes.listingId, listingId));
    if (listing.itemId) {
      const itemRows = await tx.select().from(items).where(eq(items.id, listing.itemId)).for("update").limit(1);
      const item = itemRows[0];
      if (item?.ownerId === sellerId && ["idle", "listed"].includes(item.status)) {
        await tx.update(items).set({ status: "idle" }).where(eq(items.id, item.id));
        await tx.insert(itemStatusLogs).values({ itemId: item.id, fromStatus: item.status, toStatus: "idle", operatorId: sellerId, reason: "删除发布记录" });
      }
    }
    return { id: listingId, alreadyDeleted: false };
  });
}

export async function getListingsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const database = await requireDb();
  return database.select().from(listings).where(inArray(listings.id, [...new Set(ids)]));
}

export async function listSwapRequestsForUser(userId: number) {
  const database = await requireDb();
  return database.select().from(swapRequests)
    .where(or(eq(swapRequests.requesterId, userId), eq(swapRequests.ownerId, userId)))
    .orderBy(desc(swapRequests.updatedAt))
    .limit(50);
}

export async function getSwapRequest(id: number) {
  const database = await requireDb();
  const rows = await database.select().from(swapRequests).where(eq(swapRequests.id, id)).limit(1);
  return rows[0];
}

export async function createSwapRequestTransaction(input: { targetListingId: number; offeredListingId: number; requesterId: number }) {
  if (input.targetListingId === input.offeredListingId) throw new Error("请选择两件不同的物品");
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const listingIds = [input.targetListingId, input.offeredListingId].sort((left, right) => left - right);
    const lockedListings = await tx.select().from(listings).where(inArray(listings.id, listingIds)).orderBy(listings.id).for("update");
    const target = lockedListings.find((listing) => listing.id === input.targetListingId);
    const offered = lockedListings.find((listing) => listing.id === input.offeredListingId);
    if (!target || !offered || target.status !== "published" || offered.status !== "published") throw new Error("物品已下架或状态已变化");
    if (offered.sellerId !== input.requesterId) throw new Error("只能使用自己的物品发起置换");
    if (target.sellerId === input.requesterId) throw new Error("不能向自己的物品发起置换");
    if (!(target.modes ?? []).includes("swap") || !(offered.modes ?? []).includes("swap")) throw new Error("双方物品都需要开启置换方式");
    if (!target.itemId || !offered.itemId || target.itemId === offered.itemId) throw new Error("物品档案不完整，暂时不能置换");

    const itemIds = [target.itemId, offered.itemId].sort((left, right) => left - right);
    const lockedItems = await tx.select().from(items).where(inArray(items.id, itemIds)).orderBy(items.id).for("update");
    const targetItem = lockedItems.find((item) => item.id === target.itemId);
    const offeredItem = lockedItems.find((item) => item.id === offered.itemId);
    if (!targetItem || !offeredItem || targetItem.ownerId !== target.sellerId || offeredItem.ownerId !== input.requesterId) {
      throw new Error("物品所有权已变化，请刷新后重试");
    }
    if (targetItem.status !== "listed" || offeredItem.status !== "listed") throw new Error("物品已进入其他交易");

    const activeKey = `${target.id}:${input.requesterId}`;
    const existing = await tx.select().from(swapRequests).where(eq(swapRequests.activeKey, activeKey)).for("update").limit(1);
    if (existing[0]) return { request: existing[0], target, offered, duplicate: true };
    const inserted = await tx.insert(swapRequests).values({
      targetListingId: target.id,
      offeredListingId: offered.id,
      requesterId: input.requesterId,
      ownerId: target.sellerId,
      activeKey,
    });
    const id = Number(inserted[0].insertId);
    const rows = await tx.select().from(swapRequests).where(eq(swapRequests.id, id)).limit(1);
    return { request: rows[0], target, offered, duplicate: false };
  });
}

export async function respondSwapRequestTransaction(input: { requestId: number; ownerId: number; accept: boolean }) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const requestRows = await tx.select().from(swapRequests).where(eq(swapRequests.id, input.requestId)).for("update").limit(1);
    const request = requestRows[0];
    if (!request) throw new Error("置换请求不存在");
    if (request.ownerId !== input.ownerId) throw new Error("只有物品发布者可以处理该请求");
    if (input.accept && request.status === "awaiting_confirmations") return { request, duplicate: true };
    if (!input.accept && request.status === "rejected") return { request, duplicate: true };
    if (request.status !== "submitted") throw new Error("该置换请求已被处理");
    if (!input.accept) {
      await tx.update(swapRequests).set({ status: "rejected", activeKey: null }).where(eq(swapRequests.id, request.id));
      return { request: { ...request, status: "rejected" as const, activeKey: null }, duplicate: false };
    }

    const listingIds = [request.targetListingId, request.offeredListingId].sort((left, right) => left - right);
    const lockedListings = await tx.select().from(listings).where(inArray(listings.id, listingIds)).orderBy(listings.id).for("update");
    const target = lockedListings.find((listing) => listing.id === request.targetListingId);
    const offered = lockedListings.find((listing) => listing.id === request.offeredListingId);
    if (!target || !offered || target.status !== "published" || offered.status !== "published") throw new Error("物品已下架或进入其他交易");
    if (target.sellerId !== request.ownerId || offered.sellerId !== request.requesterId || !target.itemId || !offered.itemId) {
      throw new Error("置换参与方或物品档案已变化");
    }
    const itemIds = [target.itemId, offered.itemId].sort((left, right) => left - right);
    const lockedItems = await tx.select().from(items).where(inArray(items.id, itemIds)).orderBy(items.id).for("update");
    const targetItem = lockedItems.find((item) => item.id === target.itemId);
    const offeredItem = lockedItems.find((item) => item.id === offered.itemId);
    if (!targetItem || !offeredItem || targetItem.status !== "listed" || offeredItem.status !== "listed") throw new Error("物品已进入其他交易");
    if (targetItem.ownerId !== request.ownerId || offeredItem.ownerId !== request.requesterId) throw new Error("物品所有权已变化");

    await tx.update(listings).set({ status: "reserved", itemStatus: "reserved" }).where(inArray(listings.id, listingIds));
    await tx.update(items).set({ status: "reserved" }).where(inArray(items.id, itemIds));
    await tx.insert(itemStatusLogs).values([
      { itemId: targetItem.id, fromStatus: targetItem.status, toStatus: "reserved", operatorId: input.ownerId, reason: `接受置换请求 ${request.id}` },
      { itemId: offeredItem.id, fromStatus: offeredItem.status, toStatus: "reserved", operatorId: input.ownerId, reason: `接受置换请求 ${request.id}` },
    ]);
    const orderResult = await tx.insert(orders).values({
      orderType: "swap",
      buyerId: request.requesterId,
      sellerId: request.ownerId,
      refId: request.id,
      title: `[置换] ${offered.title} ↔ ${target.title}`,
      amount: 0,
      status: "pending_acceptance",
    });
    const orderId = Number(orderResult[0].insertId);
    await tx.insert(orderStatusLogs).values({ orderId, toStatus: "pending_acceptance", note: "置换请求已接受，等待双方确认" });
    await tx.update(swapRequests).set({ status: "awaiting_confirmations", orderId }).where(eq(swapRequests.id, request.id));
    return { request: { ...request, status: "awaiting_confirmations" as const, orderId }, duplicate: false };
  });
}

export async function cancelSwapRequestTransaction(requestId: number, actorId: number) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const requestRows = await tx.select().from(swapRequests).where(eq(swapRequests.id, requestId)).for("update").limit(1);
    const request = requestRows[0];
    if (!request) throw new Error("置换请求不存在");
    if (request.requesterId !== actorId && request.ownerId !== actorId) throw new Error("你不是该置换的参与方");
    if (request.status === "cancelled") return { request, duplicate: true };
    if (!['submitted', 'awaiting_confirmations'].includes(request.status)) throw new Error("当前状态不能取消置换");
    if (request.status === "submitted" && request.requesterId !== actorId) throw new Error("物品发布者请使用拒绝操作");

    if (request.status === "awaiting_confirmations") {
      const listingIds = [request.targetListingId, request.offeredListingId].sort((left, right) => left - right);
      const lockedListings = await tx.select().from(listings).where(inArray(listings.id, listingIds)).orderBy(listings.id).for("update");
      const itemIds = lockedListings.map((listing) => listing.itemId).filter((id): id is number => Boolean(id)).sort((left, right) => left - right);
      const lockedItems = itemIds.length
        ? await tx.select().from(items).where(inArray(items.id, itemIds)).orderBy(items.id).for("update")
        : [];
      await tx.update(listings).set({ status: "published", itemStatus: "listed" }).where(and(inArray(listings.id, listingIds), eq(listings.status, "reserved")));
      if (itemIds.length) await tx.update(items).set({ status: "listed" }).where(and(inArray(items.id, itemIds), eq(items.status, "reserved")));
      const changedItems = lockedItems.filter((item) => item.status === "reserved");
      if (changedItems.length) {
        await tx.insert(itemStatusLogs).values(changedItems.map((item) => ({ itemId: item.id, fromStatus: "reserved", toStatus: "listed", operatorId: actorId, reason: `置换请求 ${request.id} 取消释放物品` })));
      }
      if (request.orderId) {
        const orderRows = await tx.select().from(orders).where(eq(orders.id, request.orderId)).for("update").limit(1);
        const order = orderRows[0];
        if (order && order.status !== "cancelled") {
          await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
          await tx.insert(orderStatusLogs).values({ orderId: order.id, fromStatus: order.status, toStatus: "cancelled", note: "置换已取消" });
        }
      }
    }
    await tx.update(swapRequests).set({ status: "cancelled", activeKey: null }).where(eq(swapRequests.id, request.id));
    return { request: { ...request, status: "cancelled" as const, activeKey: null }, duplicate: false };
  });
}

export async function confirmSwapRequestTransaction(requestId: number, actorId: number) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const requestRows = await tx.select().from(swapRequests).where(eq(swapRequests.id, requestId)).for("update").limit(1);
    const request = requestRows[0];
    if (!request) throw new Error("置换请求不存在");
    if (request.requesterId !== actorId && request.ownerId !== actorId) throw new Error("你不是该置换的参与方");
    if (request.status === "completed") return { request, completed: true, duplicate: true };
    if (request.status !== "awaiting_confirmations" || !request.orderId) throw new Error("当前状态不能确认置换");
    const requesterConfirmed = request.requesterConfirmed || request.requesterId === actorId;
    const ownerConfirmed = request.ownerConfirmed || request.ownerId === actorId;
    if (request.requesterConfirmed === requesterConfirmed && request.ownerConfirmed === ownerConfirmed) {
      return { request, completed: false, duplicate: true };
    }
    if (!requesterConfirmed || !ownerConfirmed) {
      await tx.update(swapRequests).set({ requesterConfirmed, ownerConfirmed }).where(eq(swapRequests.id, request.id));
      return { request: { ...request, requesterConfirmed, ownerConfirmed }, completed: false, duplicate: false };
    }

    const orderRows = await tx.select().from(orders).where(eq(orders.id, request.orderId)).for("update").limit(1);
    const order = orderRows[0];
    if (!order || order.orderType !== "swap" || order.status !== "pending_acceptance") throw new Error("置换订单状态已变化");
    const listingIds = [request.targetListingId, request.offeredListingId].sort((left, right) => left - right);
    const lockedListings = await tx.select().from(listings).where(inArray(listings.id, listingIds)).orderBy(listings.id).for("update");
    const target = lockedListings.find((listing) => listing.id === request.targetListingId);
    const offered = lockedListings.find((listing) => listing.id === request.offeredListingId);
    if (!target?.itemId || !offered?.itemId || target.status !== "reserved" || offered.status !== "reserved") throw new Error("置换物品状态已变化");
    const itemIds = [target.itemId, offered.itemId].sort((left, right) => left - right);
    const lockedItems = await tx.select().from(items).where(inArray(items.id, itemIds)).orderBy(items.id).for("update");
    const targetItem = lockedItems.find((item) => item.id === target.itemId);
    const offeredItem = lockedItems.find((item) => item.id === offered.itemId);
    if (!targetItem || !offeredItem || targetItem.status !== "reserved" || offeredItem.status !== "reserved") throw new Error("置换物品状态已变化");
    if (targetItem.ownerId !== request.ownerId || offeredItem.ownerId !== request.requesterId) throw new Error("置换物品所有权已变化");

    await tx.update(items).set({ ownerId: request.requesterId, status: "swapped" }).where(eq(items.id, targetItem.id));
    await tx.update(items).set({ ownerId: request.ownerId, status: "swapped" }).where(eq(items.id, offeredItem.id));
    await tx.update(listings).set({ status: "completed", itemStatus: "swapped" }).where(inArray(listings.id, listingIds));
    await tx.insert(itemOwnershipHistory).values([
      { itemId: targetItem.id, fromUserId: request.ownerId, toUserId: request.requesterId, transferType: "swapped", orderId: order.id },
      { itemId: offeredItem.id, fromUserId: request.requesterId, toUserId: request.ownerId, transferType: "swapped", orderId: order.id },
    ]);
    await tx.insert(itemStatusLogs).values([
      { itemId: targetItem.id, fromStatus: targetItem.status, toStatus: "swapped", operatorId: actorId, reason: `置换订单 ${order.id} 完成` },
      { itemId: offeredItem.id, fromStatus: offeredItem.status, toStatus: "swapped", operatorId: actorId, reason: `置换订单 ${order.id} 完成` },
    ]);
    await tx.update(orders).set({ status: "completed", completedAt: new Date() }).where(eq(orders.id, order.id));
    await tx.insert(orderStatusLogs).values({ orderId: order.id, fromStatus: order.status, toStatus: "completed", note: "双方确认，物品置换完成" });
    await tx.update(swapRequests).set({ status: "completed", requesterConfirmed: true, ownerConfirmed: true, activeKey: null }).where(eq(swapRequests.id, request.id));
    return {
      request: { ...request, status: "completed" as const, requesterConfirmed: true, ownerConfirmed: true, activeKey: null },
      completed: true,
      duplicate: false,
    };
  });
}

// ============ 物品生命周期 ============
export async function listItemsByOwner(ownerId: number) {
  const db = await requireDb();
  return db.select().from(items).where(eq(items.ownerId, ownerId)).orderBy(desc(items.updatedAt));
}

export async function getItemLifecycle(itemId: number, viewerId: number) {
  const db = await requireDb();
  const itemRows = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  const item = itemRows[0];
  if (!item) throw new Error("物品不存在");
  if (item.ownerId !== viewerId) {
    const related = await db.select({ id: listings.id }).from(listings)
      .where(and(eq(listings.itemId, itemId), eq(listings.status, "published"))).limit(1);
    if (!related.length) throw new Error("无权查看该物品档案");
  }
  const [media, defects, accessories, ownership, services, statuses, publicationHistory] = await Promise.all([
    db.select().from(itemMedia).where(eq(itemMedia.itemId, itemId)).orderBy(itemMedia.sortOrder),
    db.select().from(itemDefects).where(eq(itemDefects.itemId, itemId)).orderBy(desc(itemDefects.createdAt)),
    db.select().from(itemAccessories).where(eq(itemAccessories.itemId, itemId)),
    db.select().from(itemOwnershipHistory).where(eq(itemOwnershipHistory.itemId, itemId)).orderBy(desc(itemOwnershipHistory.transferredAt)),
    db.select().from(itemServiceHistory).where(eq(itemServiceHistory.itemId, itemId)).orderBy(desc(itemServiceHistory.servicedAt)),
    db.select().from(itemStatusLogs).where(eq(itemStatusLogs.itemId, itemId)).orderBy(desc(itemStatusLogs.createdAt)),
    db.select().from(listings).where(eq(listings.itemId, itemId)).orderBy(desc(listings.createdAt)),
  ]);
  return { item, media, defects, accessories, ownership, services, statuses, listings: publicationHistory };
}

export async function addItemServiceRecord(data: typeof itemServiceHistory.$inferInsert, ownerId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(items).where(eq(items.id, data.itemId)).for("update").limit(1);
    const item = rows[0];
    if (!item || item.ownerId !== ownerId) throw new Error("无权修改该物品");
    const result = await tx.insert(itemServiceHistory).values(data);
    return Number(result[0].insertId);
  });
}

export async function transferItemOwnership(itemId: number, fromUserId: number, toUserId: number | null, transferType: "sold" | "swapped" | "given_away" | "recycled", orderId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(items).where(eq(items.id, itemId)).for("update").limit(1);
    const item = rows[0];
    if (!item || item.ownerId !== fromUserId) throw new Error("物品所有权状态已变化");
    const nextStatus = transferType === "sold" ? "sold" : transferType === "swapped" ? "swapped" : transferType === "given_away" ? "given_away" : "recycled";
    await tx.update(items).set({ ownerId: toUserId ?? fromUserId, status: nextStatus }).where(eq(items.id, itemId));
    await tx.insert(itemOwnershipHistory).values({ itemId, fromUserId, toUserId, transferType, orderId });
    await tx.insert(itemStatusLogs).values({ itemId, fromStatus: item.status, toStatus: nextStatus, operatorId: fromUserId, reason: `订单 ${orderId} 完成流转` });
  });
}

// ============ 买家报价 ============
export async function listOffers(listingId: number) {
  const db = await requireDb();
  return db.select().from(offers).where(eq(offers.listingId, listingId)).orderBy(desc(offers.createdAt));
}

export async function createOffer(data: typeof offers.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(offers).values(data);
  return Number(result[0].insertId);
}

/** 接受买家报价事务:接受、其他not_selected、创建订单、listing→reserved */
export async function acceptOfferTransaction(listingId: number, offerId: number, sellerId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const listingRows = await tx.select().from(listings).where(eq(listings.id, listingId)).for("update").limit(1);
    const listing = listingRows[0];
    if (!listing) throw new Error("物品不存在");
    if (listing.sellerId !== sellerId) throw new Error("只有发布者可以接受报价");
    if (listing.status !== "published") throw new Error("该物品当前不可成交");
    const offerRows = await tx.select().from(offers).where(eq(offers.id, offerId)).for("update").limit(1);
    const offer = offerRows[0];
    if (!offer || offer.listingId !== listingId) throw new Error("报价不存在");
    if (!["submitted", "negotiating"].includes(offer.status)) throw new Error("该报价已被处理");
    if (!listing.itemId) throw new Error("发布未关联物品");
    const itemRows = await tx.select().from(items).where(eq(items.id, listing.itemId)).for("update").limit(1);
    const item = itemRows[0];
    if (!item || item.ownerId !== sellerId || item.status !== "listed") throw new Error("物品状态已变化");

    await tx.update(offers).set({ status: "accepted" }).where(eq(offers.id, offerId));
    await tx
      .update(offers)
      .set({ status: "not_selected" })
      .where(
        and(
          eq(offers.listingId, listingId),
          inArray(offers.status, ["submitted", "negotiating"]),
          sql`${offers.id} != ${offerId}`,
        ),
      );

    const orderResult = await tx.insert(orders).values({
      orderType: "listing",
      buyerId: offer.buyerId,
      sellerId,
      refId: listingId,
      title: listing.title,
      amount: offer.amount,
      status: "pending_payment",
    });
    const orderId = Number(orderResult[0].insertId);
    await tx.insert(orderStatusLogs).values({ orderId, toStatus: "pending_payment", note: "卖家接受报价,订单创建" });
    await tx.update(listings).set({ status: "reserved", itemStatus: "reserved" }).where(eq(listings.id, listingId));
    await tx.update(items).set({ status: "reserved" }).where(eq(items.id, listing.itemId));
    await tx.insert(itemStatusLogs).values({ itemId: listing.itemId, fromStatus: "listed", toStatus: "reserved", operatorId: sellerId, reason: `接受报价并创建订单 ${orderId}` });
    return orderId;
  });
}

export async function buyListingNowTransaction(listingId: number, buyerId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(listings).where(eq(listings.id, listingId)).for("update").limit(1);
    const listing = rows[0];
    if (!listing) throw new Error("物品不存在");
    if (listing.status !== "published") throw new Error("该物品已不可购买");
    if (listing.sellerId === buyerId) throw new Error("不能购买自己的物品");
    if (!listing.price || !(listing.modes ?? []).includes("fixed_price")) throw new Error("该物品未启用一口价");
    if (listing.itemId) {
      const itemRows = await tx.select().from(items).where(eq(items.id, listing.itemId)).for("update").limit(1);
      if (!itemRows[0] || itemRows[0].status !== "listed") throw new Error("物品状态已变化");
    }
    const orderResult = await tx.insert(orders).values({ orderType:"listing", buyerId, sellerId:listing.sellerId, refId:listing.id, title:listing.title, amount:listing.price, status:"pending_payment" });
    const orderId=Number(orderResult[0].insertId);
    await tx.insert(orderStatusLogs).values({ orderId, toStatus:"pending_payment", note:"买家拍下,待支付" });
    await tx.update(listings).set({ status:"reserved", itemStatus:"reserved" }).where(eq(listings.id, listing.id));
    if (listing.itemId) {
      await tx.update(items).set({ status:"reserved" }).where(eq(items.id, listing.itemId));
      await tx.insert(itemStatusLogs).values({ itemId:listing.itemId, fromStatus:"listed", toStatus:"reserved", operatorId:buyerId, reason:`创建一口价订单 ${orderId}` });
    }
    return { orderId, sellerId: listing.sellerId, title: listing.title };
  });
}

// ============ 赠送 ============
export async function listGiveawayApplications(listingId: number) {
  const db = await requireDb();
  return db.select().from(giveawayApplications).where(eq(giveawayApplications.listingId, listingId)).orderBy(desc(giveawayApplications.createdAt));
}

export async function createGiveawayApplication(data: typeof giveawayApplications.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(giveawayApplications).values(data);
  return Number(result[0].insertId);
}

export async function selectGiveawayApplication(listingId: number, applicationId: number, sellerId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const listingRows = await tx.select().from(listings).where(eq(listings.id, listingId)).for("update").limit(1);
    const listing = listingRows[0];
    if (!listing) throw new Error("物品不存在");
    if (listing.sellerId !== sellerId) throw new Error("只有发布者可以选择领取人");
    if (listing.status !== "published") throw new Error("该物品当前不可赠送");
    if (!listing.itemId) throw new Error("发布未关联物品");
    const itemRows = await tx.select().from(items).where(eq(items.id, listing.itemId)).for("update").limit(1);
    const item = itemRows[0];
    if (!item || item.ownerId !== sellerId || item.status !== "listed") throw new Error("物品状态已变化");
    const appRows = await tx.select().from(giveawayApplications).where(eq(giveawayApplications.id, applicationId)).for("update").limit(1);
    const application = appRows[0];
    if (!application || application.listingId !== listingId) throw new Error("申请不存在");

    await tx.update(giveawayApplications).set({ status: "selected" }).where(eq(giveawayApplications.id, applicationId));
    await tx
      .update(giveawayApplications)
      .set({ status: "rejected" })
      .where(
        and(
          eq(giveawayApplications.listingId, listingId),
          eq(giveawayApplications.status, "submitted"),
          sql`${giveawayApplications.id} != ${applicationId}`,
        ),
      );
    const orderResult = await tx.insert(orders).values({
      orderType: "listing",
      buyerId: application.applicantId,
      sellerId,
      refId: listingId,
      title: `[赠送] ${listing.title}`,
      amount: 0,
      status: "pending_delivery",
    });
    const orderId = Number(orderResult[0].insertId);
    await tx.insert(orderStatusLogs).values({ orderId, toStatus: "pending_delivery", note: "赠送已确认,等待交付" });
    await tx.update(listings).set({ status: "reserved", itemStatus: "reserved" }).where(eq(listings.id, listingId));
    await tx.update(items).set({ status: "reserved" }).where(eq(items.id, listing.itemId));
    await tx.insert(itemStatusLogs).values({ itemId: listing.itemId, fromStatus: "listed", toStatus: "reserved", operatorId: sellerId, reason: `选择赠送领取人并创建订单 ${orderId}` });
    return orderId;
  });
}

// ============ 回收 ============
export async function createRecyclingRequest(data: typeof recyclingRequests.$inferInsert) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    let itemId = data.itemId;
    if (itemId) {
      const rows = await tx.select().from(items).where(eq(items.id, itemId)).for("update").limit(1);
      const item = rows[0];
      if (!item || item.ownerId !== data.userId || !["idle", "in_use"].includes(item.status)) throw new Error("物品当前不可回收");
      await tx.update(items).set({ status: "recycling" }).where(eq(items.id, itemId));
      await tx.insert(itemStatusLogs).values({ itemId, fromStatus: item.status, toStatus: "recycling", operatorId: data.userId, reason: "创建回收询价" });
    } else {
      const itemResult = await tx.insert(items).values({ ownerId: data.userId, title: data.title, category: data.category, cityName: data.cityName, status: "recycling" });
      itemId = Number(itemResult[0].insertId);
      await tx.insert(itemOwnershipHistory).values({ itemId, fromUserId: null, toUserId: data.userId, transferType: "created", note: "由回收询价创建物品档案" });
      await tx.insert(itemStatusLogs).values({ itemId, toStatus: "recycling", operatorId: data.userId, reason: "创建回收询价" });
    }
    const result = await tx.insert(recyclingRequests).values({ ...data, itemId });
    return Number(result[0].insertId);
  });
}

export async function getRecyclingRequest(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(recyclingRequests).where(eq(recyclingRequests.id, id)).limit(1);
  return rows[0];
}

export async function listRecyclingRequests(opts: { userId?: number; openForQuotes?: boolean }) {
  const db = await requireDb();
  const conds = [];
  if (opts.userId) conds.push(eq(recyclingRequests.userId, opts.userId));
  if (opts.openForQuotes) conds.push(inArray(recyclingRequests.status, ["quoting", "quoted"]));
  return db
    .select()
    .from(recyclingRequests)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(recyclingRequests.createdAt))
    .limit(50);
}

export async function updateRecyclingRequest(id: number, data: Partial<typeof recyclingRequests.$inferInsert>) {
  const db = await requireDb();
  await db.update(recyclingRequests).set(data).where(eq(recyclingRequests.id, id));
}

export async function cancelRecyclingRequestTransaction(requestId: number, userId: number) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const rows = await tx.select().from(recyclingRequests).where(eq(recyclingRequests.id, requestId)).for("update").limit(1);
    const request = rows[0];
    if (!request) throw new Error("回收询价不存在");
    if (request.userId !== userId) throw new Error("只能取消自己的回收询价");
    if (request.status === "cancelled") return { request, duplicate: true, merchantUserIds: [] as number[] };
    if (!["quoting", "quoted"].includes(request.status)) throw new Error("已选择商家或已完成的回收不能取消");
    const quoteRows = await tx.select().from(recyclingQuotes).where(and(eq(recyclingQuotes.requestId, requestId), eq(recyclingQuotes.status, "submitted"))).for("update");
    await tx.update(recyclingQuotes).set({ status: "not_selected" }).where(and(eq(recyclingQuotes.requestId, requestId), eq(recyclingQuotes.status, "submitted")));
    await tx.update(recyclingRequests).set({ status: "cancelled" }).where(eq(recyclingRequests.id, requestId));
    if (request.itemId) {
      const itemRows = await tx.select().from(items).where(eq(items.id, request.itemId)).for("update").limit(1);
      const item = itemRows[0];
      if (item?.ownerId === userId && item.status === "recycling") {
        await tx.update(items).set({ status: "idle" }).where(eq(items.id, item.id));
        await tx.insert(itemStatusLogs).values({ itemId: item.id, fromStatus: "recycling", toStatus: "idle", operatorId: userId, reason: `取消回收询价 ${requestId}` });
      }
    }
    return { request: { ...request, status: "cancelled" as const }, duplicate: false, merchantUserIds: [...new Set(quoteRows.map((quote) => quote.merchantUserId))] };
  });
}

export async function listRecyclingQuotes(requestId: number) {
  const db = await requireDb();
  return db.select().from(recyclingQuotes).where(eq(recyclingQuotes.requestId, requestId)).orderBy(desc(recyclingQuotes.amount));
}

export async function createRecyclingQuoteTransaction(data: typeof recyclingQuotes.$inferInsert) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const requestRows = await tx.select().from(recyclingRequests).where(eq(recyclingRequests.id, data.requestId)).for("update").limit(1);
    const request = requestRows[0];
    if (!request || !["quoting", "quoted"].includes(request.status)) throw new Error("该回收询价已结束");
    const existing = await tx.select().from(recyclingQuotes)
      .where(and(eq(recyclingQuotes.requestId, data.requestId), eq(recyclingQuotes.merchantUserId, data.merchantUserId), eq(recyclingQuotes.status, "submitted")))
      .for("update").limit(1);
    if (existing[0]) return { id: existing[0].id, duplicate: true };
    const result = await tx.insert(recyclingQuotes).values(data);
    await tx.update(recyclingRequests).set({ status: "quoted" }).where(eq(recyclingRequests.id, data.requestId));
    return { id: Number(result[0].insertId), duplicate: false };
  });
}

export async function createRecyclingQuote(data: typeof recyclingQuotes.$inferInsert) {
  const result = await createRecyclingQuoteTransaction(data);
  return result.id;
}

export async function declineRecyclingQuoteTransaction(requestId: number, quoteId: number, userId: number) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const requestRows = await tx.select().from(recyclingRequests).where(eq(recyclingRequests.id, requestId)).for("update").limit(1);
    const request = requestRows[0];
    if (!request || request.userId !== userId) throw new Error("只能处理自己的回收报价");
    if (!["quoting", "quoted"].includes(request.status)) throw new Error("回收询价状态已变化");
    const quoteRows = await tx.select().from(recyclingQuotes).where(eq(recyclingQuotes.id, quoteId)).for("update").limit(1);
    const quote = quoteRows[0];
    if (!quote || quote.requestId !== requestId) throw new Error("回收报价不存在");
    if (quote.status === "not_selected") return { quote, duplicate: true };
    if (quote.status !== "submitted") throw new Error("该报价已被处理");
    await tx.update(recyclingQuotes).set({ status: "not_selected" }).where(eq(recyclingQuotes.id, quoteId));
    const remaining = await tx.select({ id: recyclingQuotes.id }).from(recyclingQuotes)
      .where(and(eq(recyclingQuotes.requestId, requestId), eq(recyclingQuotes.status, "submitted"))).limit(1);
    await tx.update(recyclingRequests).set({ status: remaining.length ? "quoted" : "quoting" }).where(eq(recyclingRequests.id, requestId));
    return { quote: { ...quote, status: "not_selected" as const }, duplicate: false };
  });
}

/** 选择回收报价事务:选中、其他not_selected、创建订单、更新询价状态 */
export async function selectRecyclingQuoteTransaction(requestId: number, quoteId: number, userId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const reqRows = await tx.select().from(recyclingRequests).where(eq(recyclingRequests.id, requestId)).for("update").limit(1);
    const request = reqRows[0];
    if (!request) throw new Error("询价单不存在");
    if (request.userId !== userId) throw new Error("只有发起人可以选择报价");
    if (!["quoting", "quoted"].includes(request.status)) throw new Error("当前状态不允许选择报价");
    const quoteRows = await tx.select().from(recyclingQuotes).where(eq(recyclingQuotes.id, quoteId)).for("update").limit(1);
    const quote = quoteRows[0];
    if (!quote || quote.requestId !== requestId) throw new Error("报价不存在");
    if (quote.status !== "submitted") throw new Error("该报价已被处理");

    await tx.update(recyclingQuotes).set({ status: "selected" }).where(eq(recyclingQuotes.id, quoteId));
    await tx
      .update(recyclingQuotes)
      .set({ status: "not_selected" })
      .where(
        and(
          eq(recyclingQuotes.requestId, requestId),
          eq(recyclingQuotes.status, "submitted"),
          sql`${recyclingQuotes.id} != ${quoteId}`,
        ),
      );
    await tx.update(recyclingRequests).set({ status: "selected", selectedQuoteId: quoteId }).where(eq(recyclingRequests.id, requestId));

    const orderResult = await tx.insert(orders).values({
      orderType: "recycling",
      buyerId: quote.merchantUserId,
      sellerId: userId,
      refId: requestId,
      title: `[回收] ${request.title}`,
      amount: quote.amount,
      status: "pending_confirmation",
    });
    const orderId = Number(orderResult[0].insertId);
    await tx.insert(orderStatusLogs).values({ orderId, toStatus: "pending_confirmation", note: "已选择回收报价,等待上门检测" });
    return orderId;
  });
}

// ============ 订单 ============
export async function listOrders(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(orders)
    .where(or(eq(orders.buyerId, userId), eq(orders.sellerId, userId)))
    .orderBy(desc(orders.createdAt))
    .limit(50);
}

export async function getOrder(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0];
}

export async function getOrderForReference(orderType: "listing" | "project" | "recycling" | "swap", refId: number) {
  const db = await requireDb();
  const rows = await db.select().from(orders).where(and(eq(orders.orderType, orderType), eq(orders.refId, refId))).orderBy(desc(orders.createdAt)).limit(1);
  return rows[0];
}

export async function updateOrder(id: number, data: Partial<typeof orders.$inferInsert>) {
  const db = await requireDb();
  await db.update(orders).set(data).where(eq(orders.id, id));
}

export async function addOrderLog(orderId: number, fromStatus: string | null, toStatus: string, note?: string) {
  const db = await requireDb();
  await db.insert(orderStatusLogs).values({ orderId, fromStatus, toStatus, note });
}

export async function listOrderLogs(orderId: number) {
  const db = await requireDb();
  return db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, orderId)).orderBy(desc(orderStatusLogs.createdAt));
}

export async function cancelOrderTransaction(orderId: number, actorId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    const order = rows[0];
    if (!order) throw new Error("订单不存在");
    if (order.buyerId !== actorId && order.sellerId !== actorId) throw new Error("你不是该订单参与方");
    if (!["pending_confirmation", "pending_payment"].includes(order.status)) throw new Error("当前状态不能取消");
    await tx.update(orders).set({ status:"cancelled" }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusLogs).values({ orderId, fromStatus:order.status, toStatus:"cancelled", note:"订单已取消" });
    if (order.orderType === "listing") {
      const listingRows=await tx.select().from(listings).where(eq(listings.id, order.refId)).for("update").limit(1);
      const listing=listingRows[0];
      if (listing) {
        await tx.update(listings).set({ status:"published", itemStatus:"listed" }).where(eq(listings.id, listing.id));
        if (listing.itemId) {
          const itemRows = await tx.select().from(items).where(eq(items.id, listing.itemId)).for("update").limit(1);
          const item = itemRows[0];
          if (!item || item.ownerId !== order.sellerId || item.status !== "reserved") throw new Error("物品成交锁状态已变化");
          await tx.update(items).set({ status:"listed" }).where(eq(items.id, listing.itemId));
          await tx.insert(itemStatusLogs).values({ itemId:listing.itemId, fromStatus:item.status, toStatus:"listed", operatorId:actorId, reason:`订单 ${orderId} 取消释放物品` });
        }
      }
    }
    return order;
  });
}

export async function completeOrderTransaction(orderId: number, buyerId: number) {
  const db=await requireDb();
  return db.transaction(async (tx) => {
    const rows=await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    const order=rows[0];
    if (!order) throw new Error("订单不存在");
    if (order.buyerId !== buyerId) throw new Error("只有买家可以确认收货");
    if (order.status !== "pending_acceptance") throw new Error("当前状态不能确认收货");
    await tx.update(orders).set({ status:"completed", completedAt:new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusLogs).values({ orderId, fromStatus:"pending_acceptance", toStatus:"completed", note:"买家确认收货,订单完成" });
    if (order.orderType === "listing") {
      const commerceLines = await tx.select({ id: orderLineItems.id }).from(orderLineItems).where(eq(orderLineItems.orderId, orderId)).limit(1);
      if (commerceLines.length) return order;
      const listingRows=await tx.select().from(listings).where(eq(listings.id, order.refId)).for("update").limit(1);
      const listing=listingRows[0];
      if (listing) {
        const transferType = order.amount === 0 ? "given_away" : "sold";
        await tx.update(listings).set({ status:"completed", itemStatus:transferType }).where(eq(listings.id, listing.id));
        if (listing.itemId) {
          const itemRows=await tx.select().from(items).where(eq(items.id, listing.itemId)).for("update").limit(1);
          const item=itemRows[0];
          if (!item || item.ownerId !== order.sellerId) throw new Error("物品所有权状态已变化");
          await tx.update(items).set({ ownerId:order.buyerId, status:transferType }).where(eq(items.id, listing.itemId));
          await tx.insert(itemOwnershipHistory).values({ itemId:listing.itemId, fromUserId:order.sellerId, toUserId:order.buyerId, transferType, orderId });
          await tx.insert(itemStatusLogs).values({ itemId:listing.itemId, fromStatus:item.status, toStatus:transferType, operatorId:buyerId, reason:`订单 ${orderId} 完成流转` });
        }
      }
    } else if (order.orderType === "recycling") {
      const requestRows = await tx.select().from(recyclingRequests).where(eq(recyclingRequests.id, order.refId)).for("update").limit(1);
      const request = requestRows[0];
      if (!request?.itemId) throw new Error("回收询价未关联物品");
      const itemRows = await tx.select().from(items).where(eq(items.id, request.itemId)).for("update").limit(1);
      const item = itemRows[0];
      if (!item || item.ownerId !== order.sellerId || item.status !== "recycling") throw new Error("回收物品状态已变化");
      await tx.update(recyclingRequests).set({ status:"completed" }).where(eq(recyclingRequests.id, order.refId));
      await tx.update(items).set({ status: "recycled" }).where(eq(items.id, item.id));
      await tx.insert(itemOwnershipHistory).values({ itemId: item.id, fromUserId: order.sellerId, toUserId: null, transferType: "recycled", orderId, note: "回收订单完成，物品退出可交易状态" });
      await tx.insert(itemStatusLogs).values({ itemId: item.id, fromStatus: item.status, toStatus: "recycled", operatorId: buyerId, reason: `回收订单 ${orderId} 完成` });
    }
    return order;
  });
}

export async function completeItemSwapTransaction(input: { orderId: number; firstItemId: number; secondItemId: number; firstOwnerId: number; secondOwnerId: number; actorId: number }) {
  if (input.firstItemId === input.secondItemId || input.firstOwnerId === input.secondOwnerId) throw new Error("置换双方必须是不同物品和用户");
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const orderRows = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update").limit(1);
    const order = orderRows[0];
    if (!order || order.orderType !== "listing" || order.status !== "pending_acceptance") throw new Error("置换订单状态不可完成");
    const participants = new Set([order.buyerId, order.sellerId]);
    if (!participants.has(input.firstOwnerId) || !participants.has(input.secondOwnerId) || !participants.has(input.actorId)) throw new Error("置换参与方不匹配");
    const itemIds = [input.firstItemId, input.secondItemId].sort((left, right) => left - right);
    const lockedItems = await tx.select().from(items).where(inArray(items.id, itemIds)).orderBy(items.id).for("update");
    const first = lockedItems.find((item) => item.id === input.firstItemId);
    const second = lockedItems.find((item) => item.id === input.secondItemId);
    if (!first || !second || first.ownerId !== input.firstOwnerId || second.ownerId !== input.secondOwnerId || first.status !== "reserved" || second.status !== "reserved") throw new Error("置换物品状态或所有权已变化");
    await tx.update(items).set({ ownerId: input.secondOwnerId, status: "swapped" }).where(eq(items.id, first.id));
    await tx.update(items).set({ ownerId: input.firstOwnerId, status: "swapped" }).where(eq(items.id, second.id));
    await tx.update(listings).set({ status: "completed", itemStatus: "swapped" }).where(and(inArray(listings.itemId, itemIds), eq(listings.status, "reserved")));
    await tx.insert(itemOwnershipHistory).values([
      { itemId: first.id, fromUserId: input.firstOwnerId, toUserId: input.secondOwnerId, transferType: "swapped", orderId: order.id },
      { itemId: second.id, fromUserId: input.secondOwnerId, toUserId: input.firstOwnerId, transferType: "swapped", orderId: order.id },
    ]);
    await tx.insert(itemStatusLogs).values([
      { itemId: first.id, fromStatus: first.status, toStatus: "swapped", operatorId: input.actorId, reason: `置换订单 ${order.id} 完成` },
      { itemId: second.id, fromStatus: second.status, toStatus: "swapped", operatorId: input.actorId, reason: `置换订单 ${order.id} 完成` },
    ]);
    await tx.update(orders).set({ status: "completed", completedAt: new Date() }).where(eq(orders.id, order.id));
    await tx.insert(orderStatusLogs).values({ orderId: order.id, fromStatus: order.status, toStatus: "completed", note: "双方物品置换完成" });
    return { orderId: order.id, firstItemId: first.id, secondItemId: second.id };
  });
}

// ============ 消息 ============
export async function listConversations(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(conversations)
    .where(or(eq(conversations.userAId, userId), eq(conversations.userBId, userId)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(50);
}

export async function getOrCreateConversation(userAId: number, userBId: number, refType?: string, refId?: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(
      or(
        and(eq(conversations.userAId, userAId), eq(conversations.userBId, userBId)),
        and(eq(conversations.userAId, userBId), eq(conversations.userBId, userAId)),
      ),
    )
    .limit(1);
  if (rows.length > 0) return rows[0];
  const result = await db.insert(conversations).values({ userAId, userBId, refType, refId });
  const id = Number(result[0].insertId);
  const created = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return created[0];
}

export async function getConversation(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return rows[0];
}

export async function listMessages(conversationId: number, beforeId?: number, limit = 200) {
  const db = await requireDb();
  const conditions = [eq(messages.conversationId, conversationId)];
  if (beforeId) conditions.push(lt(messages.id, beforeId));
  const rows = await db.select().from(messages).where(and(...conditions)).orderBy(desc(messages.id)).limit(limit);
  return rows.reverse();
}

export async function unreadConversationCounts(userId: number, conversationIds: number[]) {
  if (conversationIds.length === 0) return new Map<number, number>();
  const db = await requireDb();
  const rows = await db
    .select({ conversationId: messages.conversationId, count: sql<number>`COUNT(*)` })
    .from(messages)
    .leftJoin(messageReceipts, and(eq(messageReceipts.messageId, messages.id), eq(messageReceipts.userId, userId)))
    .where(and(inArray(messages.conversationId, conversationIds), ne(messages.senderId, userId), isNull(messageReceipts.readAt)))
    .groupBy(messages.conversationId);
  return new Map(rows.map((row) => [row.conversationId, Number(row.count)]));
}

export async function sendMessage(conversationId: number, senderId: number, clientMessageId: string, content: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const convRows = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).for("update").limit(1);
    const conversation = convRows[0];
    if (!conversation || (conversation.userAId !== senderId && conversation.userBId !== senderId)) throw new Error("会话不存在");
    const existing = await tx.select().from(messages)
      .where(and(eq(messages.senderId, senderId), eq(messages.clientMessageId, clientMessageId))).limit(1);
    if (existing[0]) return { message: existing[0], created: false };
    const result = await tx.insert(messages).values({ conversationId, senderId, clientMessageId, content });
    const messageId = Number(result[0].insertId);
    await tx.update(conversations).set({ lastMessage: content.slice(0, 200), lastMessageAt: new Date() }).where(eq(conversations.id, conversationId));
    const inserted = await tx.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    return { message: inserted[0], created: true };
  });
}

export async function markConversationDelivered(conversationId: number, userId: number) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const convRows = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).for("update").limit(1);
    const conv = convRows[0];
    if (!conv || (conv.userAId !== userId && conv.userBId !== userId)) throw new Error("会话不存在");
    const rows = await tx.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.conversationId, conversationId), sql`${messages.senderId} != ${userId}`));
    const deliveredAt = new Date();
    for (const row of rows) {
      await tx.insert(messageReceipts).values({ messageId: row.id, userId, deliveredAt })
        .onDuplicateKeyUpdate({ set: { deliveredAt } });
    }
  });
}

export async function markConversationRead(conversationId: number, userId: number) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const convRows = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).for("update").limit(1);
    const conv = convRows[0];
    if (!conv || (conv.userAId !== userId && conv.userBId !== userId)) throw new Error("会话不存在");
    const rows = await tx.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.conversationId, conversationId), sql`${messages.senderId} != ${userId}`));
    const now = new Date();
    for (const row of rows) {
      await tx.insert(messageReceipts).values({ messageId: row.id, userId, deliveredAt: now, readAt: now })
        .onDuplicateKeyUpdate({ set: { deliveredAt: now, readAt: now } });
    }
  });
}

export async function getMessageReceipts(conversationId: number) {
  const db = await requireDb();
  return db.select({ messageId: messageReceipts.messageId, userId: messageReceipts.userId, deliveredAt: messageReceipts.deliveredAt, readAt: messageReceipts.readAt })
    .from(messageReceipts).innerJoin(messages, eq(messageReceipts.messageId, messages.id))
    .where(eq(messages.conversationId, conversationId));
}

// ============ 通知 ============
export function notificationRetryDelayMs(attempt: number) {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

async function dispatchPushAttempt(input: {
  notificationId: number;
  token: Pick<typeof devicePushTokens.$inferSelect, "id" | "userId" | "platform" | "token" | "deviceId" | "active" | "lastSeenAt" | "createdAt">;
  title: string;
  content?: string | null;
  category?: string | null;
  refType?: string | null;
  refId?: number | null;
  attempt: number;
}) {
  const db = await requireDb();
  const pushProvider = getPushProvider();
  let result: Awaited<ReturnType<typeof pushProvider.send>>;
  try {
    result = await pushProvider.send({
      token: input.token.token,
      title: input.title,
      body: input.content ?? undefined,
      data: {
        type: input.refType ?? input.category ?? "system",
        notificationId: String(input.notificationId),
        ...(input.refType ? { refType: input.refType } : {}),
        ...(input.refId ? { refId: String(input.refId) } : {}),
      },
    });
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : "push provider failed" };
  }
  const now = new Date();
  const simulated = pushProvider.name === "log";
  const invalidToken = /invalid|unregistered|expired|DeviceNotRegistered/i.test(result.error ?? "");
  const status = simulated ? "skipped" : result.success ? "sent" : "failed";
  await db.insert(notificationDeliveries).values({
    notificationId: input.notificationId,
    devicePushTokenId: input.token.id,
    channel: "push",
    provider: pushProvider.name,
    status,
    attemptCount: input.attempt,
    providerMessageId: result.providerMessageId,
    errorMessage: result.error,
    lastError: result.error,
    attemptedAt: now,
    sentAt: result.success ? now : undefined,
    deliveredAt: result.success && !simulated ? now : undefined,
    nextRetryAt: !result.success && !invalidToken && input.attempt < 3 ? new Date(now.getTime() + notificationRetryDelayMs(input.attempt)) : null,
  });
  if (invalidToken) {
    await db.update(devicePushTokens).set({
      active: false,
      disabledAt: now,
      disabledReason: (result.error ?? "Push Token 无效").slice(0, 255),
    }).where(eq(devicePushTokens.id, input.token.id));
  }
}

export async function retryDueNotificationDeliveries(limit = 50) {
  const db = await requireDb();
  const due = await db.select({
    deliveryId: notificationDeliveries.id,
    notificationId: notificationDeliveries.notificationId,
    attemptCount: notificationDeliveries.attemptCount,
    tokenId: devicePushTokens.id,
    userId: devicePushTokens.userId,
    platform: devicePushTokens.platform,
    token: devicePushTokens.token,
    deviceId: devicePushTokens.deviceId,
    active: devicePushTokens.active,
    lastSeenAt: devicePushTokens.lastSeenAt,
    tokenCreatedAt: devicePushTokens.createdAt,
    title: notifications.title,
    content: notifications.content,
    category: notifications.category,
    refType: notifications.refType,
    refId: notifications.refId,
  }).from(notificationDeliveries)
    .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
    .innerJoin(devicePushTokens, eq(notificationDeliveries.devicePushTokenId, devicePushTokens.id))
    .where(and(eq(notificationDeliveries.status, "failed"), isNotNull(notificationDeliveries.nextRetryAt), lte(notificationDeliveries.nextRetryAt, new Date()), eq(devicePushTokens.active, true), sql`${notificationDeliveries.attemptCount} < 3`))
    .orderBy(notificationDeliveries.nextRetryAt).limit(limit);
  let retried = 0;
  for (const candidate of due) {
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, candidate.deliveryId)).for("update").limit(1);
      const row = rows[0];
      if (!row?.nextRetryAt || row.nextRetryAt.getTime() > Date.now()) return false;
      await tx.update(notificationDeliveries).set({ nextRetryAt: null }).where(eq(notificationDeliveries.id, row.id));
      return true;
    });
    if (!claimed) continue;
    await dispatchPushAttempt({ notificationId: candidate.notificationId, token: { id: candidate.tokenId, userId: candidate.userId, platform: candidate.platform, token: candidate.token, deviceId: candidate.deviceId, active: candidate.active, lastSeenAt: candidate.lastSeenAt, createdAt: candidate.tokenCreatedAt }, title: candidate.title, content: candidate.content, category: candidate.category, refType: candidate.refType, refId: candidate.refId, attempt: candidate.attemptCount + 1 });
    retried += 1;
  }
  return retried;
}

export async function createNotification(data: typeof notifications.$inferInsert) {
  const db = await requireDb();
  const dedupeKey = data.dedupeKey ?? `${data.category ?? "system"}:${data.refType ?? "none"}:${data.refId ?? "none"}:${data.title}`.slice(0, 191);
  const stored = await db.transaction(async (tx) => {
    const recipient = await tx.select({ id: users.id }).from(users).where(eq(users.id, data.userId)).for("update").limit(1);
    if (!recipient[0]) throw new Error("通知接收用户不存在");
    const existing = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, data.userId), eq(notifications.dedupeKey, dedupeKey))).limit(1);
    if (existing[0]) return { id: existing[0].id, created: false };
    const result = await tx.insert(notifications).values({ ...data, dedupeKey });
    const id = Number(result[0].insertId);
    await tx.insert(notificationDeliveries).values({ notificationId: id, channel: "in_app", provider: "internal", status: "sent", attemptCount: 1, attemptedAt: new Date(), sentAt: new Date(), deliveredAt: new Date() });
    return { id, created: true };
  });
  if (!stored.created) return stored.id;
  emitRealtimeEvent({ type: "notification.created", userId: data.userId, payload: { id: stored.id, ...data, dedupeKey } });
  const tokens = await db.select().from(devicePushTokens).where(and(eq(devicePushTokens.userId, data.userId), eq(devicePushTokens.active, true)));
  for (const token of tokens) {
    await dispatchPushAttempt({ notificationId: stored.id, token, title: data.title, content: data.content, category: data.category, refType: data.refType, refId: data.refId, attempt: 1 }).catch((error) => {
      logger.warn("notification.push_dispatch_failed", { notificationId: stored.id, tokenId: token.id, error });
    });
  }
  return stored.id;
}

export async function listNotifications(userId: number) {
  const db = await requireDb();
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function unreadNotificationCount(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationsRead(userId: number, id?: number) {
  const db = await requireDb();
  const readAt = new Date();
  if (id) {
    await db.update(notifications).set({ isRead: true, readAt }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  } else {
    await db.update(notifications).set({ isRead: true, readAt }).where(eq(notifications.userId, userId));
  }
}

export async function createStoredFile(data: typeof storedFiles.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(storedFiles).values(data);
  return Number(result[0].insertId);
}

export async function getStoredFile(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(storedFiles).where(eq(storedFiles.id, id)).limit(1);
  return rows[0];
}

export async function getStoredFileByKey(storageKey: string) {
  const db = await requireDb();
  const rows = await db.select().from(storedFiles).where(eq(storedFiles.storageKey, storageKey)).limit(1);
  return rows[0];
}

export async function countStoredFiles(ownerId: number, relatedEntityType?: string, relatedEntityId?: number) {
  const db = await requireDb();
  const conditions = [eq(storedFiles.ownerId, ownerId)];
  if (relatedEntityType) conditions.push(eq(storedFiles.relatedEntityType, relatedEntityType));
  if (relatedEntityId != null) conditions.push(eq(storedFiles.relatedEntityId, relatedEntityId));
  const rows = await db.select({ count: sql<number>`COUNT(*)` }).from(storedFiles).where(and(...conditions));
  return Number(rows[0]?.count ?? 0);
}

export async function findStoredFileByOwnerAndHash(ownerId: number, sha256: string) {
  const db = await requireDb();
  const rows = await db.select().from(storedFiles).where(and(eq(storedFiles.ownerId, ownerId), eq(storedFiles.sha256, sha256), eq(storedFiles.status, "available"))).limit(1);
  return rows[0];
}

export async function canManageRelatedFile(userId: number, role: string, relatedEntityType?: string, relatedEntityId?: number) {
  if (role === "admin" || !relatedEntityType || relatedEntityId == null) return true;
  if (relatedEntityType === "item") {
    const db = await requireDb();
    const rows = await db.select({ ownerId: items.ownerId }).from(items).where(eq(items.id, relatedEntityId)).limit(1);
    return rows[0]?.ownerId === userId;
  }
  if (relatedEntityType === "listing") {
    const db = await requireDb();
    const rows = await db.select({ sellerId: listings.sellerId }).from(listings).where(eq(listings.id, relatedEntityId)).limit(1);
    return rows[0]?.sellerId === userId;
  }
  if (relatedEntityType === "content_post") {
    const db = await requireDb();
    const rows = await db.select({ authorAccountId: contentPosts.authorAccountId }).from(contentPosts).where(eq(contentPosts.id, relatedEntityId)).limit(1);
    return rows[0]?.authorAccountId === userId;
  }
  return false;
}

export async function addFileAccessLog(data: typeof fileAccessLogs.$inferInsert) {
  const db = await requireDb();
  await db.insert(fileAccessLogs).values(data);
}

export async function registerPushToken(data: typeof devicePushTokens.$inferInsert) {
  const db = await requireDb();
  await db.insert(devicePushTokens).values(data).onDuplicateKeyUpdate({ set: {
    userId: data.userId,
    platform: data.platform,
    deviceId: data.deviceId,
    active: true,
    lastSeenAt: new Date(),
    disabledAt: null,
    disabledReason: null,
  } });
}

export async function deactivatePushToken(userId: number, input: { token?: string; deviceId?: string }, reason = "用户退出登录") {
  const db = await requireDb();
  const targets = [input.token ? eq(devicePushTokens.token, input.token) : undefined, input.deviceId ? eq(devicePushTokens.deviceId, input.deviceId) : undefined].filter(Boolean);
  if (!targets.length) return 0;
  const result = await db.update(devicePushTokens).set({
    active: false,
    disabledAt: new Date(),
    disabledReason: reason.slice(0, 255),
  }).where(and(eq(devicePushTokens.userId, userId), or(...(targets as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))));
  return Number(result[0].affectedRows ?? 0);
}

export async function createNotificationWithDelivery(data: typeof notifications.$inferInsert) {
  return createNotification(data);
}

export async function listFileAccessLogs(limit = 100) {
  const db = await requireDb();
  return db.select({
    id: fileAccessLogs.id, fileId: fileAccessLogs.fileId, userId: fileAccessLogs.userId,
    action: fileAccessLogs.action, relatedEntityType: fileAccessLogs.relatedEntityType,
    relatedEntityId: fileAccessLogs.relatedEntityId, ipAddress: fileAccessLogs.ipAddress,
    deviceId: fileAccessLogs.deviceId, createdAt: fileAccessLogs.createdAt,
    originalName: storedFiles.originalName, privacyLevel: storedFiles.privacyLevel,
  }).from(fileAccessLogs).innerJoin(storedFiles, eq(fileAccessLogs.fileId, storedFiles.id))
    .orderBy(desc(fileAccessLogs.createdAt)).limit(limit);
}

export async function listNotificationFailures(limit = 100) {
  const db = await requireDb();
  return db.select().from(notificationDeliveries).where(eq(notificationDeliveries.status, "failed")).orderBy(desc(notificationDeliveries.createdAt)).limit(limit);
}

// ============ 评价与信用 ============
export async function createReview(data: typeof reviews.$inferInsert) {
  const db = await requireDb();
  await db.insert(reviews).values(data);
}

export async function createOrderReviewTransaction(input: {
  orderId: number;
  reviewerId: number;
  overallRating: number;
  dimensions?: Record<string, number>;
  tags: string[];
  imageFileIds: number[];
  content?: string;
  requestId: string;
}) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const duplicateRows = await tx.select().from(reviews)
      .where(and(eq(reviews.reviewerId, input.reviewerId), eq(reviews.requestId, input.requestId)))
      .limit(1);
    if (duplicateRows[0]) return { review: duplicateRows[0], duplicate: true };

    const orderRows = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update").limit(1);
    const order = orderRows[0];
    if (!order) throw new Error("订单不存在");
    if (order.status !== "completed") throw new Error("订单完成后才能评价");
    const isBuyer = order.buyerId === input.reviewerId;
    const isSeller = order.sellerId === input.reviewerId;
    if (!isBuyer && !isSeller) throw new Error("你不是该订单参与方");
    if ((isBuyer && order.buyerReviewed) || (isSeller && order.sellerReviewed)) throw new Error("你已评价过该订单");

    if (input.imageFileIds.length) {
      const files = await tx.select().from(storedFiles).where(inArray(storedFiles.id, input.imageFileIds));
      if (files.length !== input.imageFileIds.length || files.some((file) => file.ownerId !== input.reviewerId || file.status !== "available" || file.virusScanStatus !== "clean" || !file.mimeType.startsWith("image/"))) {
        throw new Error("评价图片不存在、不可用或尚未通过安全扫描");
      }
    }

    const revieweeId = isBuyer ? order.sellerId : order.buyerId;
    const impactDimension = order.orderType === "project" ? "service_reliability" : "trade_reliability";
    const result = await tx.insert(reviews).values({
      orderId: order.id,
      reviewerId: input.reviewerId,
      revieweeId,
      overallRating: input.overallRating,
      dimensions: input.dimensions,
      tags: input.tags,
      imageFileIds: input.imageFileIds,
      content: input.content,
      businessSource: `order:${order.orderType}`,
      impactDimension,
      requestId: input.requestId,
    });
    const reviewId = Number(result[0].insertId);
    await tx.update(orders).set(isBuyer ? { buyerReviewed: true } : { sellerReviewed: true }).where(eq(orders.id, order.id));
    const scoreChange = input.overallRating >= 4 ? 1 : input.overallRating <= 2 ? -2 : 0;
    await tx.insert(creditEvents).values({
      userId: revieweeId,
      actorAccountId: input.reviewerId,
      eventType: "review_received",
      scoreChange,
      reason: `收到${input.overallRating}星评价`,
      businessSource: `order:${order.orderType}`,
      impactDimension,
      refType: "review",
      refId: reviewId,
      requestId: `credit:${input.requestId}`,
    });
    if (scoreChange) {
      await tx.update(userProfiles)
        .set({ creditScore: sql`GREATEST(${userProfiles.creditScore} + ${scoreChange}, 0)` })
        .where(eq(userProfiles.userId, revieweeId));
    }
    await tx.insert(auditLogs).values({
      actorId: input.reviewerId,
      actorRole: "user",
      action: "review.order.create",
      resourceType: "review",
      resourceId: String(reviewId),
      detail: { orderId: order.id, revieweeId, scoreChange, impactDimension, imageCount: input.imageFileIds.length },
    });
    const reviewRows = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
    return { review: reviewRows[0]!, duplicate: false };
  });
}

export async function listOrderReviews(orderId: number) {
  const database = await requireDb();
  return database.select().from(reviews).where(eq(reviews.orderId, orderId)).orderBy(asc(reviews.createdAt));
}

export async function replyToReviewTransaction(input: { reviewId: number; actorId: number; reply: string }) {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const rows = await tx.select().from(reviews).where(eq(reviews.id, input.reviewId)).for("update").limit(1);
    const review = rows[0];
    if (!review) throw new Error("评价不存在");
    if (review.revieweeId !== input.actorId) throw new Error("只有被评价方可以回复");
    if (review.reply) throw new Error("该评价已经回复");
    await tx.update(reviews).set({ reply: input.reply, repliedBy: input.actorId, repliedAt: new Date() }).where(eq(reviews.id, review.id));
    await tx.insert(auditLogs).values({ actorId: input.actorId, actorRole: "user", action: "review.reply", resourceType: "review", resourceId: String(review.id) });
    return { ...review, reply: input.reply, repliedBy: input.actorId, repliedAt: new Date() };
  });
}

export async function listReviewsForUser(userId: number) {
  const db = await requireDb();
  return db.select().from(reviews).where(eq(reviews.revieweeId, userId)).orderBy(desc(reviews.createdAt)).limit(50);
}

export async function addCreditEvent(data: typeof creditEvents.$inferInsert) {
  const db = await requireDb();
  await db.insert(creditEvents).values(data);
  if (data.scoreChange && data.scoreChange !== 0) {
    await db
      .update(userProfiles)
      .set({ creditScore: sql`GREATEST(${userProfiles.creditScore} + ${data.scoreChange}, 0)` })
      .where(eq(userProfiles.userId, data.userId));
  }
}

export async function listCreditEvents(userId: number) {
  const db = await requireDb();
  return db.select().from(creditEvents).where(eq(creditEvents.userId, userId)).orderBy(desc(creditEvents.createdAt)).limit(50);
}
