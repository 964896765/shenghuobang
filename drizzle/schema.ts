import { boolean, char, check, decimal, foreignKey, index, int, json, mysqlEnum, mysqlTable, text, timestamp, varbinary, varchar, uniqueIndex } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users",
  {
    id: int("id").autoincrement().primaryKey(),
    // Kept for compatibility with existing business data. Standalone accounts use local:<phone>.
    openId: varchar("openId", { length: 96 }).notNull().unique(),
    phone: varchar("phone", { length: 32 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }).default("phone_password"),
    accountStatus: mysqlEnum("accountStatus", ["active", "restricted", "suspended", "closed"]).default("active").notNull(),
    role: mysqlEnum("role", ["user", "admin", "verification_reviewer", "complaint_operator", "finance_operator", "customer_service"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    phoneUnique: uniqueIndex("users_phone_unique").on(table.phone),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** 用户扩展资料 + 当前身份 */
export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  nickname: varchar("nickname", { length: 64 }),
  avatarUrl: text("avatarUrl"),
  bio: text("bio"),
  cityCode: varchar("cityCode", { length: 32 }).default("beijing"),
  cityName: varchar("cityName", { length: 64 }).default("北京"),
  currentRole: mysqlEnum("currentRole", ["user", "engineer", "merchant"]).default("user").notNull(),
  engineerStatus: mysqlEnum("engineerStatus", ["none", "pending", "active", "rejected"]).default("none").notNull(),
  merchantStatus: mysqlEnum("merchantStatus", ["none", "pending", "active", "rejected"]).default("none").notNull(),
  creditScore: int("creditScore").default(100).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserProfile = typeof userProfiles.$inferSelect;

/** V3.2.4-R2 前台按需位置偏好。只保存约 1 公里精度坐标，公开查询不返回坐标。 */
export const userLocationPreferences = mysqlTable("user_location_preferences",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    cityName: varchar("cityName", { length: 64 }),
    regionName: varchar("regionName", { length: 64 }),
    approximateLatitude: decimal("approximateLatitude", {
      precision: 4,
      scale: 2,
    }),
    approximateLongitude: decimal("approximateLongitude", {
      precision: 5,
      scale: 2,
    }),
    source: mysqlEnum("source", ["device", "manual"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex("user_location_preferences_user_unique").on(table.userId),
    regionIndex: index("user_location_preferences_region_idx").on(table.cityName, table.regionName),
  }),
);
export type UserLocationPreference = typeof userLocationPreferences.$inferSelect;

/** 工程师档案 */
export const engineerProfiles = mysqlTable("engineer_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  realName: varchar("realName", { length: 64 }),
  professionalTitle: varchar("professionalTitle", { length: 128 }),
  primaryCategory: varchar("primaryCategory", { length: 64 }),
  yearsOfExperience: int("yearsOfExperience").default(0),
  introduction: text("introduction"),
  skills: json("skills").$type<string[]>(),
  cityName: varchar("cityName", { length: 64 }),
  supportsRemote: boolean("supportsRemote").default(true),
  supportsOnsite: boolean("supportsOnsite").default(false),
  startingPrice: int("startingPrice").default(0),
  acceptingOrders: boolean("acceptingOrders").default(true),
  verificationLevel: mysqlEnum("verificationLevel", ["none", "basic", "professional"]).default("none").notNull(),
  rating: int("rating").default(50).notNull(), // 0-50 => 0.0-5.0
  completedProjects: int("completedProjects").default(0),
  responseMinutes: int("responseMinutes").default(30),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EngineerProfile = typeof engineerProfiles.$inferSelect;

/** 商家档案(含回收商) */
export const merchantProfiles = mysqlTable("merchant_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  categories: json("categories").$type<string[]>(), // repair / recycle / installation
  description: text("description"),
  cityName: varchar("cityName", { length: 64 }),
  addressText: varchar("addressText", { length: 255 }),
  supportsHomeService: boolean("supportsHomeService").default(true),
  acceptingOrders: boolean("acceptingOrders").default(true),
  rating: int("rating").default(48).notNull(),
  completedOrders: int("completedOrders").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MerchantProfile = typeof merchantProfiles.$inferSelect;

/** 需求 */
export const needs = mysqlTable("needs", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: int("creatorId").notNull(),
  needType: varchar("needType", { length: 32 }).default("life").notNull(), // life/engineering/product/software/repair/renovation/consulting/other
  title: varchar("title", { length: 255 }).notNull(),
  originalDescription: text("originalDescription"),
  structuredData: json("structuredData").$type<{
    target?: string;
    scenario?: string;
    problem?: string;
    expectation?: string;
    budgetSuggestion?: string;
    recommendedProfession?: string;
    riskNotes?: string;
  }>(),
  category: varchar("category", { length: 64 }),
  budgetMin: int("budgetMin"),
  budgetMax: int("budgetMax"),
  expectedDeadline: varchar("expectedDeadline", { length: 64 }),
  cityName: varchar("cityName", { length: 64 }).default("北京"),
  supportsRemote: boolean("supportsRemote").default(true),
  requiresOnsite: boolean("requiresOnsite").default(false),
  visibility: mysqlEnum("visibility", ["public", "private"]).default("public").notNull(),
  allowComments: boolean("allowComments").default(true),
  allowQuotes: boolean("allowQuotes").default(true),
  status: mysqlEnum("status", ["draft", "pending_review", "published", "collecting_solutions", "selecting_quote", "project_created", "solved", "closed", "rejected"]).default("draft").notNull(),
  supportCount: int("supportCount").default(0).notNull(),
  publishedAt: timestamp("publishedAt"),
  closedAt: timestamp("closedAt"),
  closeReason: varchar("closeReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Need = typeof needs.$inferSelect;
export type InsertNeed = typeof needs.$inferInsert;

/** 我也需要 */
export const needSupports = mysqlTable("need_supports",
  {
    id: int("id").autoincrement().primaryKey(),
    needId: int("needId").notNull(),
    userId: int("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    needUserUnique: uniqueIndex("need_supports_need_user_unique").on(table.needId, table.userId),
  }),
);

/** 需求评论 */
export const needComments = mysqlTable("need_comments", {
  id: int("id").autoincrement().primaryKey(),
  needId: int("needId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 工程师方案 */
export const solutions = mysqlTable("solutions", {
  id: int("id").autoincrement().primaryKey(),
  needId: int("needId").notNull(),
  providerId: int("providerId").notNull(),
  providerType: mysqlEnum("providerType", ["user", "engineer", "ai"]).default("engineer").notNull(),
  understanding: text("understanding"),
  approach: text("approach").notNull(),
  risks: text("risks"),
  status: mysqlEnum("status", ["submitted", "visible", "withdrawn", "selected", "not_selected", "removed"]).default("visible").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Solution = typeof solutions.$inferSelect;

/** 工程报价 */
export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  needId: int("needId").notNull(),
  engineerId: int("engineerId").notNull(), // userId of engineer
  totalPrice: int("totalPrice").notNull(),
  durationDays: int("durationDays").notNull(),
  deliverables: text("deliverables").notNull(),
  exclusions: text("exclusions"),
  paymentTerms: varchar("paymentTerms", { length: 255 }),
  revisionCount: int("revisionCount").default(2),
  supportDays: int("supportDays").default(30),
  validDays: int("validDays").default(7),
  status: mysqlEnum("status", ["submitted", "viewed", "negotiating", "accepted", "rejected", "withdrawn", "expired", "not_selected"]).default("submitted").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  currentVersionId: int("currentVersionId"),
  expiresAt: timestamp("expiresAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Quote = typeof quotes.$inferSelect;

/** 工程项目 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  // Legacy quote-created projects keep both references. Idea-created projects leave them NULL.
  needId: int("needId"),
  quoteId: int("quoteId"),
  ownerId: int("ownerId").notNull(),
  engineerId: int("engineerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  totalAmount: int("totalAmount").notNull(),
  ownerConfirmedAt: timestamp("ownerConfirmedAt"),
  engineerConfirmedAt: timestamp("engineerConfirmedAt"),
  expectedEndAt: timestamp("expectedEndAt"),
  status: mysqlEnum("status", [
    "pending_confirmation",
    "pending_agreement",
    "pending_payment",
    "in_progress",
    "waiting_acceptance",
    "revision",
    "paused",
    "disputed",
    "completed",
    "cancelled",
    "refunded",
    "closed",
  ])
    .default("pending_confirmation")
    .notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  authorizationVersion: int("authorizationVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusAuthorizationIndex: index("projects_status_authorization_idx").on(table.status, table.authorizationVersion),
}));
export type Project = typeof projects.$inferSelect;

/** 项目里程碑 */
export const milestones = mysqlTable("milestones", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: int("amount").default(0),
  sortOrder: int("sortOrder").default(0).notNull(),
  milestoneType: mysqlEnum("milestoneType", ["general", "prototype"]).default("general").notNull(),
  prototypeTaskType: mysqlEnum("prototypeTaskType", ["designer", "engineer"]),
  status: mysqlEnum("status", ["pending", "in_progress", "submitted", "waiting_acceptance", "revision_required", "accepted", "overdue", "disputed", "cancelled"]).default("pending").notNull(),
  deliveryNote: text("deliveryNote"),
  revisionReason: text("revisionReason"),
  startedAt: timestamp("startedAt"),
  submittedAt: timestamp("submittedAt"),
  acceptedAt: timestamp("acceptedAt"),
  assigneeProjectMembershipId: int("assigneeProjectMembershipId"),
  startedByProjectMembershipId: int("startedByProjectMembershipId"),
  lastSubmittedByProjectMembershipId: int("lastSubmittedByProjectMembershipId"),
  authorizationVersion: int("authorizationVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  assigneeStatusIndex: index("milestones_project_assignee_status_idx").on(table.projectId, table.assigneeProjectMembershipId, table.status),
  assigneeProjectForeignKey: foreignKey({
    columns: [table.projectId, table.assigneeProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "milestones_assignee_project_membership_fk",
  }),
  submitterProjectForeignKey: foreignKey({
    columns: [table.projectId, table.lastSubmittedByProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "milestones_submitter_project_membership_fk",
  }),
  starterProjectForeignKey: foreignKey({
    columns: [table.projectId, table.startedByProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "milestones_starter_project_membership_fk",
  }),
}));
export type Milestone = typeof milestones.$inferSelect;

/** 报价版本：正式报价提交后不可静默覆盖 */
export const quoteVersions = mysqlTable("quote_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    quoteId: int("quoteId").notNull(),
    versionNo: int("versionNo").notNull(),
    totalPrice: int("totalPrice").notNull(),
    durationDays: int("durationDays").notNull(),
    understanding: text("understanding"),
    deliverables: text("deliverables").notNull(),
    exclusions: text("exclusions"),
    paymentTerms: varchar("paymentTerms", { length: 255 }),
    revisionCount: int("revisionCount").default(2).notNull(),
    supportDays: int("supportDays").default(30).notNull(),
    validDays: int("validDays").default(7).notNull(),
    changeNote: varchar("changeNote", { length: 500 }),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    quoteVersionUnique: uniqueIndex("quote_versions_quote_version_unique").on(table.quoteId, table.versionNo),
  }),
);
export type QuoteVersion = typeof quoteVersions.$inferSelect;

/** 项目正式需求版本 */
export const projectRequirements = mysqlTable("project_requirements",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    versionNo: int("versionNo").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    acceptanceCriteria: text("acceptanceCriteria"),
    exclusions: text("exclusions"),
    status: mysqlEnum("status", ["pending_confirmation", "effective", "superseded", "rejected"]).default("pending_confirmation").notNull(),
    ownerConfirmedAt: timestamp("ownerConfirmedAt"),
    engineerConfirmedAt: timestamp("engineerConfirmedAt"),
    sourceChangeId: int("sourceChangeId"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    projectRequirementVersionUnique: uniqueIndex("project_requirements_project_version_unique").on(table.projectId, table.versionNo),
  }),
);
export type ProjectRequirement = typeof projectRequirements.$inferSelect;

/** 项目文件与交付文件版本 */
export const projectFiles = mysqlTable("project_files",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    milestoneId: int("milestoneId"),
    fileGroupId: varchar("fileGroupId", { length: 64 }).notNull(),
    versionNo: int("versionNo").default(1).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 500 }).notNull(),
    publicUrl: text("publicUrl"),
    mimeType: varchar("mimeType", { length: 128 }),
    sizeBytes: int("sizeBytes").default(0).notNull(),
    category: mysqlEnum("category", ["requirement", "design", "delivery", "test", "agreement", "other"]).default("other").notNull(),
    description: text("description"),
    formalSubmission: boolean("formalSubmission").default(false).notNull(),
    status: mysqlEnum("status", ["available", "superseded", "disabled"]).default("available").notNull(),
    confidentialityLevel: mysqlEnum("confidentialityLevel", ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"]).default("INTERNAL").notNull(),
    ndaRequired: boolean("ndaRequired").default(false).notNull(),
    accessPolicyVersion: int("accessPolicyVersion").default(1).notNull(),
    disabledAt: timestamp("disabledAt"),
    disabledBy: int("disabledBy").references(() => users.id),
    uploadedBy: int("uploadedBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    projectFileVersionUnique: uniqueIndex("project_files_group_version_unique").on(table.fileGroupId, table.versionNo),
    projectStatusConfidentialityIndex: index("project_files_project_status_conf_idx").on(table.projectId, table.status, table.confidentialityLevel),
  }),
);
export type ProjectFile = typeof projectFiles.$inferSelect;

export const designVersions = mysqlTable("design_versions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  versionNo: int("versionNo").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  changeNotes: text("changeNotes"),
  status: mysqlEnum("status", ["draft", "submitted", "superseded", "withdrawn"]).default("draft").notNull(),
  createdByProjectMembershipId: int("createdByProjectMembershipId").notNull(),
  submittedByProjectMembershipId: int("submittedByProjectMembershipId"),
  submittedAt: timestamp("submittedAt"),
  authorizationVersion: int("authorizationVersion").default(1).notNull(),
  requestId: varchar("requestId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  projectVersionUnique: uniqueIndex("design_versions_project_version_uq").on(table.projectId, table.versionNo),
  requestUnique: uniqueIndex("design_versions_request_uq").on(table.requestId),
  projectStatusIndex: index("design_versions_project_status_idx").on(table.projectId, table.status, table.submittedAt),
  creatorProjectForeignKey: foreignKey({
    columns: [table.projectId, table.createdByProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "design_versions_creator_project_membership_fk",
  }),
  submitterProjectForeignKey: foreignKey({
    columns: [table.projectId, table.submittedByProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "design_versions_submitter_project_membership_fk",
  }),
}));
export type DesignVersion = typeof designVersions.$inferSelect;

export const designVersionFiles = mysqlTable("design_version_files", {
  id: int("id").autoincrement().primaryKey(),
  designVersionId: int("designVersionId").notNull().references(() => designVersions.id),
  projectFileId: int("projectFileId").notNull().references(() => projectFiles.id),
  fileRole: mysqlEnum("fileRole", ["source", "preview", "reference", "specification", "other"]).default("other").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  uploadedByProjectMembershipId: int("uploadedByProjectMembershipId").notNull().references(() => projectMemberships.id),
  disabledAt: timestamp("disabledAt"),
  accessPolicyVersion: int("accessPolicyVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  designVersionFileUnique: uniqueIndex("design_version_files_version_file_uq").on(table.designVersionId, table.projectFileId),
  versionStateIndex: index("design_version_files_version_state_idx").on(table.designVersionId, table.disabledAt, table.sortOrder),
}));
export type DesignVersionFile = typeof designVersionFiles.$inferSelect;

export const milestoneDeliverableSubmissions = mysqlTable("milestone_deliverable_submissions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  milestoneId: int("milestoneId").notNull().references(() => milestones.id),
  submissionVersion: int("submissionVersion").notNull(),
  note: text("note").notNull(),
  submittedByProjectMembershipId: int("submittedByProjectMembershipId").notNull(),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  requestId: varchar("requestId", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["submitted", "superseded"]).default("submitted").notNull(),
  authorizationVersion: int("authorizationVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  milestoneSubmissionVersionUnique: uniqueIndex("milestone_deliverable_submissions_milestone_version_uq").on(table.milestoneId, table.submissionVersion),
  requestUnique: uniqueIndex("milestone_deliverable_submissions_request_uq").on(table.requestId),
  projectMilestoneStatusIndex: index("milestone_deliverable_submissions_project_milestone_status_idx").on(table.projectId, table.milestoneId, table.status, table.submittedAt),
  submitterProjectForeignKey: foreignKey({
    columns: [table.projectId, table.submittedByProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "milestone_deliverable_submissions_submitter_project_membership_fk",
  }),
}));
export type MilestoneDeliverableSubmission = typeof milestoneDeliverableSubmissions.$inferSelect;

export const milestoneDeliverableSubmissionFiles = mysqlTable("milestone_deliverable_submission_files", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => milestoneDeliverableSubmissions.id),
  projectFileId: int("projectFileId").notNull().references(() => projectFiles.id),
  sortOrder: int("sortOrder").default(0).notNull(),
  disabledAt: timestamp("disabledAt"),
  accessPolicyVersion: int("accessPolicyVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  submissionFileUnique: uniqueIndex("milestone_deliverable_submission_files_submission_file_uq").on(table.submissionId, table.projectFileId),
  submissionStateIndex: index("milestone_deliverable_submission_files_submission_state_idx").on(table.submissionId, table.disabledAt, table.sortOrder),
}));
export type MilestoneDeliverableSubmissionFile = typeof milestoneDeliverableSubmissionFiles.$inferSelect;

export const milestoneAcceptanceRounds = mysqlTable("milestone_acceptance_rounds", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  milestoneId: int("milestoneId").notNull().references(() => milestones.id),
  submissionId: int("submissionId").notNull().references(() => milestoneDeliverableSubmissions.id),
  roundNo: int("roundNo").notNull(),
  status: mysqlEnum("status", ["pending_review", "accepted", "revision_requested", "superseded"]).default("pending_review").notNull(),
  reviewerProjectMembershipId: int("reviewerProjectMembershipId"),
  decisionNote: text("decisionNote"),
  requestId: varchar("requestId", { length: 64 }).notNull(),
  decidedAt: timestamp("decidedAt"),
  authorizationVersion: int("authorizationVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  submissionUnique: uniqueIndex("milestone_acceptance_rounds_submission_uq").on(table.submissionId),
  roundUnique: uniqueIndex("milestone_acceptance_rounds_milestone_round_uq").on(table.milestoneId, table.roundNo),
  requestUnique: uniqueIndex("milestone_acceptance_rounds_request_uq").on(table.requestId),
  milestoneStatusIndex: index("milestone_acceptance_rounds_milestone_status_idx").on(table.milestoneId, table.status, table.createdAt),
  reviewerProjectForeignKey: foreignKey({
    columns: [table.projectId, table.reviewerProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "milestone_acceptance_rounds_reviewer_project_membership_fk",
  }),
}));
export type MilestoneAcceptanceRound = typeof milestoneAcceptanceRounds.$inferSelect;

export const milestoneRevisionRequests = mysqlTable("milestone_revision_requests", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  milestoneId: int("milestoneId").notNull().references(() => milestones.id),
  acceptanceRoundId: int("acceptanceRoundId").notNull().references(() => milestoneAcceptanceRounds.id),
  reason: text("reason").notNull(),
  requirementsJson: json("requirementsJson").$type<string[] | null>(),
  assignedProjectMembershipId: int("assignedProjectMembershipId"),
  dueAt: timestamp("dueAt"),
  status: mysqlEnum("status", ["open", "resubmitted", "closed"]).default("open").notNull(),
  createdByProjectMembershipId: int("createdByProjectMembershipId").notNull(),
  resolvedBySubmissionId: int("resolvedBySubmissionId").references(() => milestoneDeliverableSubmissions.id),
  requestId: varchar("requestId", { length: 64 }).notNull(),
  authorizationVersion: int("authorizationVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  acceptanceRoundUnique: uniqueIndex("milestone_revision_requests_round_uq").on(table.acceptanceRoundId),
  requestUnique: uniqueIndex("milestone_revision_requests_request_uq").on(table.requestId),
  milestoneStatusIndex: index("milestone_revision_requests_milestone_status_idx").on(table.milestoneId, table.status, table.createdAt),
  assignedProjectForeignKey: foreignKey({
    columns: [table.projectId, table.assignedProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "milestone_revision_requests_assignee_project_membership_fk",
  }),
  creatorProjectForeignKey: foreignKey({
    columns: [table.projectId, table.createdByProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "milestone_revision_requests_creator_project_membership_fk",
  }),
}));
export type MilestoneRevisionRequest = typeof milestoneRevisionRequests.$inferSelect;

export const projectIntentions = mysqlTable("project_intentions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  accountId: int("accountId").notNull().references(() => users.id),
  intentionType: mysqlEnum("intentionType", ["follow", "trial", "purchase_interest", "collaboration_interest"]).notNull(),
  note: text("note"),
  status: mysqlEnum("status", ["active", "withdrawn"]).default("active").notNull(),
  activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
  requestId: varchar("requestId", { length: 64 }).notNull(),
  lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  requestUnique: uniqueIndex("project_intentions_request_uq").on(table.requestId),
  activeDedupeUnique: uniqueIndex("project_intentions_active_dedupe_uq").on(table.activeDedupeKey),
  accountProjectStatusIndex: index("project_intentions_account_project_status_idx").on(table.accountId, table.projectId, table.status),
  projectTypeStatusIndex: index("project_intentions_project_type_status_idx").on(table.projectId, table.intentionType, table.status),
}));
export type ProjectIntention = typeof projectIntentions.$inferSelect;

/** 项目变更单 */
export const projectChanges = mysqlTable("project_changes", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  requesterId: int("requesterId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  changeContent: text("changeContent").notNull(),
  reason: text("reason"),
  amountDelta: int("amountDelta").default(0).notNull(),
  scheduleDeltaDays: int("scheduleDeltaDays").default(0).notNull(),
  deliverableImpact: text("deliverableImpact"),
  status: mysqlEnum("status", ["pending_confirmation", "approved", "rejected", "withdrawn", "disputed"]).default("pending_confirmation").notNull(),
  respondedBy: int("respondedBy"),
  responseNote: text("responseNote"),
  respondedAt: timestamp("respondedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProjectChange = typeof projectChanges.$inferSelect;

/** 每一次项目验收结果都形成独立记录 */
export const projectAcceptances = mysqlTable("project_acceptances", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  milestoneId: int("milestoneId").notNull(),
  result: mysqlEnum("result", ["accepted", "revision_required", "disputed"]).notNull(),
  comment: text("comment"),
  submittedBy: int("submittedBy").notNull(),
  reviewerProjectMembershipId: int("reviewerProjectMembershipId"),
  deliverySubmissionVersion: int("deliverySubmissionVersion"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  projectMilestoneCreatedIndex: index("project_acceptances_project_milestone_created_idx").on(table.projectId, table.milestoneId, table.createdAt),
  reviewerProjectForeignKey: foreignKey({
    columns: [table.projectId, table.reviewerProjectMembershipId],
    foreignColumns: [projectMemberships.projectId, projectMemberships.id],
    name: "project_acceptances_reviewer_project_membership_fk",
  }),
}));
export type ProjectAcceptance = typeof projectAcceptances.$inferSelect;

/** 投诉与项目争议 */
export const complaints = mysqlTable("complaints", {
  id: int("id").autoincrement().primaryKey(),
  complainantId: int("complainantId").notNull(),
  respondentId: int("respondentId").notNull(),
  relatedType: mysqlEnum("relatedType", ["project", "milestone", "order", "listing", "recycling", "message"]).notNull(),
  relatedId: int("relatedId").notNull(),
  complaintType: varchar("complaintType", { length: 64 }).notNull(),
  description: text("description").notNull(),
  expectedResolution: text("expectedResolution"),
  status: mysqlEnum("status", ["submitted", "waiting_response", "under_review", "waiting_evidence", "negotiating", "decision_pending", "resolved", "rejected", "withdrawn", "closed"])
    .default("submitted")
    .notNull(),
  respondentStatement: text("respondentStatement"),
  resolution: text("resolution"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Complaint = typeof complaints.$inferSelect;

export const complaintEvidence = mysqlTable("complaint_evidence", {
  id: int("id").autoincrement().primaryKey(),
  complaintId: int("complaintId").notNull(),
  submitterId: int("submitterId").notNull(),
  fileName: varchar("fileName", { length: 255 }),
  storageKey: varchar("storageKey", { length: 500 }),
  publicUrl: text("publicUrl"),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 物品档案 + 发布(合并简化:一件物品一个发布) */
export const listings = mysqlTable("listings", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId"),
  sellerId: int("sellerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 64 }).default("其他"),
  brand: varchar("brand", { length: 64 }),
  conditionLevel: varchar("conditionLevel", { length: 32 }).default("九成新"), // 全新~仅适合回收
  functionStatus: varchar("functionStatus", { length: 32 }).default("功能正常"),
  description: text("description"),
  swapIntent: varchar("swapIntent", { length: 255 }),
  imageUrls: json("imageUrls").$type<string[]>(),
  cityName: varchar("cityName", { length: 64 }).default("北京"),
  // 流转方式
  modes: json("modes").$type<string[]>(), // fixed_price / accept_offers / swap / giveaway / recycle
  primaryMode: varchar("primaryMode", { length: 32 }).default("fixed_price").notNull(),
  price: int("price"),
  minAcceptPrice: int("minAcceptPrice"),
  giveawayRule: varchar("giveawayRule", { length: 32 }), // first_come / apply / choose
  status: mysqlEnum("status", ["draft", "published", "reserved", "completed", "closed", "deleted"]).default("published").notNull(),
  itemStatus: varchar("itemStatus", { length: 32 }).default("listed"), // listed/reserved/sold/swapped/given_away/recycling/recycled
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Listing = typeof listings.$inferSelect;

/** 买家报价 offer */
export const offers = mysqlTable("offers", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId").notNull(),
  buyerId: int("buyerId").notNull(),
  amount: int("amount").notNull(),
  message: varchar("message", { length: 255 }),
  status: mysqlEnum("status", ["submitted", "negotiating", "accepted", "rejected", "withdrawn", "expired", "not_selected"]).default("submitted").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Offer = typeof offers.$inferSelect;

/** 赠送申请 */
export const giveawayApplications = mysqlTable("giveaway_applications", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId").notNull(),
  applicantId: int("applicantId").notNull(),
  reason: varchar("reason", { length: 255 }),
  status: mysqlEnum("status", ["submitted", "selected", "rejected", "withdrawn"]).default("submitted").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 回收询价 */
export const recyclingRequests = mysqlTable("recycling_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("itemId").references(() => items.id),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }).default("家电"),
    conditionDesc: text("conditionDesc"),
    imageUrls: json("imageUrls").$type<string[]>(),
    cityName: varchar("cityName", { length: 64 }).default("北京"),
    expectedPrice: int("expectedPrice"),
    status: mysqlEnum("status", ["quoting", "quoted", "selected", "inspecting", "completed", "cancelled"]).default("quoting").notNull(),
    selectedQuoteId: int("selectedQuoteId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    itemIndex: index("recycling_requests_item_idx").on(table.itemId),
  }),
);
export type RecyclingRequest = typeof recyclingRequests.$inferSelect;

/** 回收报价 */
export const recyclingQuotes = mysqlTable("recycling_quotes", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  merchantUserId: int("merchantUserId").notNull(),
  merchantName: varchar("merchantName", { length: 128 }),
  amount: int("amount").notNull(),
  note: varchar("note", { length: 255 }),
  pickupTime: varchar("pickupTime", { length: 64 }),
  status: mysqlEnum("status", ["submitted", "selected", "not_selected", "withdrawn", "adjusted", "confirmed"]).default("submitted").notNull(),
  adjustedAmount: int("adjustedAmount"),
  adjustReason: varchar("adjustReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RecyclingQuote = typeof recyclingQuotes.$inferSelect;

/** 订单 */
export const orders = mysqlTable("orders",
  {
    id: int("id").autoincrement().primaryKey(),
    orderType: mysqlEnum("orderType", ["listing", "project", "recycling", "swap"]).default("listing").notNull(),
    buyerId: int("buyerId").notNull(),
    sellerId: int("sellerId").notNull(),
    refId: int("refId").notNull(), // listingId / projectId / recyclingRequestId
    title: varchar("title", { length: 255 }).notNull(),
    amount: int("amount").notNull(),
    status: mysqlEnum("status", [
      "pending_confirmation",
      "pending_payment",
      "paid",
      "pending_delivery",
      "pending_acceptance",
      "completed",
      "cancelled",
      "refunding",
      "partially_refunded",
      "refunded",
      "disputed",
      "closed",
    ])
      .default("pending_payment")
      .notNull(),
    paidAt: timestamp("paidAt"),
    completedAt: timestamp("completedAt"),
    buyerReviewed: boolean("buyerReviewed").default(false),
    sellerReviewed: boolean("sellerReviewed").default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    relatedEntityIndex: index("orders_related_entity_idx").on(table.orderType, table.refId),
    statusIndex: index("orders_status_idx").on(table.status),
  }),
);
export type Order = typeof orders.$inferSelect;

/** 订单状态日志 */
export const orderStatusLogs = mysqlTable("order_status_logs", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  fromStatus: varchar("fromStatus", { length: 32 }),
  toStatus: varchar("toStatus", { length: 32 }).notNull(),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 物品置换请求：请求、接受和双方确认均以服务端状态为准。 */
export const swapRequests = mysqlTable("swap_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    targetListingId: int("targetListingId")
      .notNull()
      .references(() => listings.id),
    offeredListingId: int("offeredListingId")
      .notNull()
      .references(() => listings.id),
    requesterId: int("requesterId")
      .notNull()
      .references(() => users.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    orderId: int("orderId").references(() => orders.id),
    status: mysqlEnum("status", ["submitted", "awaiting_confirmations", "rejected", "cancelled", "completed"]).default("submitted").notNull(),
    requesterConfirmed: boolean("requesterConfirmed").default(false).notNull(),
    ownerConfirmed: boolean("ownerConfirmed").default(false).notNull(),
    activeKey: varchar("activeKey", { length: 191 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    activeUnique: uniqueIndex("swap_requests_active_unique").on(table.activeKey),
    requesterStatusIdx: index("swap_requests_requester_status_idx").on(table.requesterId, table.status),
    ownerStatusIdx: index("swap_requests_owner_status_idx").on(table.ownerId, table.status),
  }),
);
export type SwapRequest = typeof swapRequests.$inferSelect;

/** 会话 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userAId: int("userAId").notNull(),
  userBId: int("userBId").notNull(),
  refType: varchar("refType", { length: 32 }), // need/listing/project/order
  refId: int("refId"),
  lastMessage: varchar("lastMessage", { length: 255 }),
  lastMessageAt: timestamp("lastMessageAt"),
  status: mysqlEnum("status", ["active", "closed"]).default("active").notNull(),
  authorizationVersion: int("authorizationVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  referenceStatusIndex: index("conversations_reference_status_idx").on(table.refType, table.refId, table.status),
}));
export type Conversation = typeof conversations.$inferSelect;

/** 消息 */
export const messages = mysqlTable("messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    senderId: int("senderId").notNull(),
    clientMessageId: varchar("clientMessageId", { length: 128 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    senderClientUnique: uniqueIndex("messages_sender_client_unique").on(table.senderId, table.clientMessageId),
    conversationOrderIndex: index("messages_conversation_order_idx").on(table.conversationId, table.createdAt, table.id),
  }),
);
export type Message = typeof messages.$inferSelect;

/** 通知 */
export const notifications = mysqlTable("notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    category: mysqlEnum("category", ["system", "need", "project", "order"]).default("system").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content"),
    refType: varchar("refType", { length: 32 }),
    refId: int("refId"),
    dedupeKey: varchar("dedupeKey", { length: 191 }),
    isRead: boolean("isRead").default(false).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userDedupeUnique: uniqueIndex("notifications_user_dedupe_unique").on(table.userId, table.dedupeKey),
    userReadIndex: index("notifications_user_read_idx").on(table.userId, table.readAt),
  }),
);
export type Notification = typeof notifications.$inferSelect;

/** 评价 */
export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  reviewerId: int("reviewerId").notNull(),
  revieweeId: int("revieweeId").notNull(),
  overallRating: int("overallRating").notNull(), // 1-5
  dimensions: json("dimensions").$type<Record<string, number>>(),
  content: text("content"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Review = typeof reviews.$inferSelect;

/** 信用事件 */
export const creditEvents = mysqlTable("credit_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  scoreChange: int("scoreChange").default(0).notNull(),
  reason: varchar("reason", { length: 255 }),
  refType: varchar("refType", { length: 32 }),
  refId: int("refId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CreditEvent = typeof creditEvents.$inferSelect;

// ============ V3.2 物品生命周期 ============
export const items = mysqlTable("items",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }).default("其他"),
    brand: varchar("brand", { length: 64 }),
    model: varchar("model", { length: 128 }),
    conditionLevel: varchar("conditionLevel", { length: 32 }).default("九成新"),
    functionStatus: varchar("functionStatus", { length: 32 }).default("功能正常"),
    purchasePrice: int("purchasePrice"),
    purchasedAt: timestamp("purchasedAt"),
    cityName: varchar("cityName", { length: 64 }).default("北京"),
    status: mysqlEnum("status", ["in_use", "idle", "listed", "reserved", "sold", "swapped", "given_away", "recycling", "recycled", "under_repair", "archived"]).default("idle").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ownerStatusIdx: index("items_owner_status_idx").on(table.ownerId, table.status),
  }),
);
export type Item = typeof items.$inferSelect;

export const itemMedia = mysqlTable("item_media", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId")
    .notNull()
    .references(() => items.id),
  fileId: int("fileId"),
  url: text("url"),
  mediaType: mysqlEnum("mediaType", ["image", "video"]).default("image").notNull(),
  purpose: mysqlEnum("purpose", ["cover", "detail", "defect"]).default("detail").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const itemDefects = mysqlTable("item_defects", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId")
    .notNull()
    .references(() => items.id),
  defectType: varchar("defectType", { length: 64 }),
  description: text("description").notNull(),
  severity: mysqlEnum("severity", ["minor", "moderate", "major"]).default("minor").notNull(),
  markerData: json("markerData").$type<Record<string, number>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const itemAccessories = mysqlTable("item_accessories", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId")
    .notNull()
    .references(() => items.id),
  name: varchar("name", { length: 128 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  conditionNote: varchar("conditionNote", { length: 255 }),
});

export const itemOwnershipHistory = mysqlTable("item_ownership_history",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("itemId")
      .notNull()
      .references(() => items.id),
    fromUserId: int("fromUserId").references(() => users.id),
    toUserId: int("toUserId").references(() => users.id),
    transferType: mysqlEnum("transferType", ["created", "sold", "swapped", "given_away", "recycled", "admin_correction"]).notNull(),
    orderId: int("orderId").references(() => orders.id),
    note: varchar("note", { length: 255 }),
    transferredAt: timestamp("transferredAt").defaultNow().notNull(),
  },
  (table) => ({
    itemTimeIdx: index("item_ownership_item_time_idx").on(table.itemId, table.transferredAt),
  }),
);

export const itemServiceHistory = mysqlTable("item_service_history", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId")
    .notNull()
    .references(() => items.id),
  serviceType: mysqlEnum("serviceType", ["repair", "maintenance", "inspection", "refurbishment", "upgrade"]).notNull(),
  providerUserId: int("providerUserId").references(() => users.id),
  description: text("description").notNull(),
  amount: int("amount"),
  servicedAt: timestamp("servicedAt").defaultNow().notNull(),
});

export const itemStatusLogs = mysqlTable("item_status_logs", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId")
    .notNull()
    .references(() => items.id),
  fromStatus: varchar("fromStatus", { length: 32 }),
  toStatus: varchar("toStatus", { length: 32 }).notNull(),
  operatorId: int("operatorId").references(() => users.id),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const listingModes = mysqlTable("listing_modes",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId")
      .notNull()
      .references(() => listings.id),
    modeCode: mysqlEnum("modeCode", ["fixed_price", "accept_offers", "swap", "giveaway", "recycle", "rental"]).notNull(),
    active: boolean("active").default(true).notNull(),
    configuration: json("configuration").$type<Record<string, unknown>>(),
  },
  (table) => ({
    listingModeUnique: uniqueIndex("listing_modes_listing_mode_unique").on(table.listingId, table.modeCode),
  }),
);

// ============ V3.2 文件、通知与实时消息 ============
export const storedFiles = mysqlTable("stored_files",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    provider: mysqlEnum("provider", ["local", "s3"]).default("local").notNull(),
    storageKey: varchar("storageKey", { length: 500 }).notNull(),
    originalName: varchar("originalName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    privacyLevel: mysqlEnum("privacyLevel", ["public", "business", "sensitive", "high_sensitive"]).default("business").notNull(),
    virusScanStatus: mysqlEnum("virusScanStatus", ["pending", "clean", "rejected", "unavailable"]).default("pending").notNull(),
    status: mysqlEnum("status", ["uploading", "available", "disabled", "archived"]).default("available").notNull(),
    relatedEntityType: varchar("relatedEntityType", { length: 32 }),
    relatedEntityId: int("relatedEntityId"),
    accessPolicyVersion: int("accessPolicyVersion").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    storageKeyUnique: uniqueIndex("stored_files_storage_key_unique").on(table.storageKey),
    shaIdx: index("stored_files_sha_idx").on(table.sha256),
    ownerIdx: index("stored_files_owner_idx").on(table.ownerId),
    relatedStatusIndex: index("stored_files_related_status_idx").on(table.relatedEntityType, table.relatedEntityId, table.status),
  }),
);

export const fileAccessLogs = mysqlTable("file_access_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    fileId: int("fileId")
      .notNull()
      .references(() => storedFiles.id),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    action: mysqlEnum("action", ["upload", "download", "preview", "disable"]).notNull(),
    relatedEntityType: varchar("relatedEntityType", { length: 32 }),
    relatedEntityId: int("relatedEntityId"),
    ipAddress: varchar("ipAddress", { length: 64 }),
    deviceId: varchar("deviceId", { length: 128 }),
    result: mysqlEnum("result", ["success", "denied", "failed"]).default("success").notNull(),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    fileIndex: index("file_access_logs_file_idx").on(table.fileId, table.createdAt),
  }),
);

export const messageReceipts = mysqlTable("message_receipts",
  {
    id: int("id").autoincrement().primaryKey(),
    messageId: int("messageId")
      .notNull()
      .references(() => messages.id),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    deliveredAt: timestamp("deliveredAt"),
    readAt: timestamp("readAt"),
  },
  (table) => ({
    receiptUnique: uniqueIndex("message_receipts_message_user_unique").on(table.messageId, table.userId),
  }),
);

export const notificationDeliveries = mysqlTable("notification_deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    notificationId: int("notificationId")
      .notNull()
      .references(() => notifications.id),
    devicePushTokenId: int("devicePushTokenId").references(() => devicePushTokens.id),
    channel: mysqlEnum("channel", ["in_app", "push"]).default("in_app").notNull(),
    provider: varchar("provider", { length: 32 }).default("log").notNull(),
    status: mysqlEnum("status", ["pending", "sent", "failed", "skipped"]).default("pending").notNull(),
    providerMessageId: varchar("providerMessageId", { length: 128 }),
    errorMessage: varchar("errorMessage", { length: 500 }),
    attemptCount: int("attemptCount").default(0).notNull(),
    lastError: varchar("lastError", { length: 500 }),
    nextRetryAt: timestamp("nextRetryAt"),
    sentAt: timestamp("sentAt"),
    deliveredAt: timestamp("deliveredAt"),
    attemptedAt: timestamp("attemptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    retryIndex: index("notification_deliveries_retry_idx").on(table.status, table.nextRetryAt),
  }),
);

export const devicePushTokens = mysqlTable("device_push_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    platform: mysqlEnum("platform", ["ios", "android", "web"]).notNull(),
    token: varchar("token", { length: 512 }).notNull(),
    deviceId: varchar("deviceId", { length: 128 }),
    active: boolean("active").default(true).notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    disabledAt: timestamp("disabledAt"),
    disabledReason: varchar("disabledReason", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("device_push_tokens_token_unique").on(table.token),
    userIndex: index("device_push_tokens_user_idx").on(table.userId),
  }),
);

// ============ V3.3-A / A2 migration infrastructure ============

export const migrationRuns = mysqlTable("migration_runs",
  {
    migrationRunId: varchar("migrationRunId", { length: 64 }).primaryKey(),
    migrationVersion: varchar("migrationVersion", { length: 32 }).notNull(),
    runMode: mysqlEnum("runMode", ["migrate", "rerun", "recovery"]).default("migrate").notNull(),
    parentMigrationRunId: varchar("parentMigrationRunId", { length: 64 }),
    runSequence: int("runSequence").notNull(),
    sourceBaseline: varchar("sourceBaseline", { length: 128 }).notNull(),
    sourceChecksum: char("sourceChecksum", { length: 64 }).notNull(),
    manifestChecksum: char("manifestChecksum", { length: 64 }).notNull(),
    configurationChecksum: char("configurationChecksum", {
      length: 64,
    }).notNull(),
    status: mysqlEnum("status", ["pending", "running", "completed", "failed", "aborted"]).default("pending").notNull(),
    startedAt: timestamp("startedAt", { fsp: 3 }),
    completedAt: timestamp("completedAt", { fsp: 3 }),
    failedAt: timestamp("failedAt", { fsp: 3 }),
    abortedAt: timestamp("abortedAt", { fsp: 3 }),
    heartbeatAt: timestamp("heartbeatAt", { fsp: 3 }),
    processedCount: int("processedCount").default(0).notNull(),
    succeededCount: int("succeededCount").default(0).notNull(),
    failedCount: int("failedCount").default(0).notNull(),
    skippedCount: int("skippedCount").default(0).notNull(),
    requestedByAccountId: int("requestedByAccountId").references(() => users.id),
    failureCode: varchar("failureCode", { length: 64 }),
    failureDetail: json("failureDetail").$type<Record<string, unknown>>(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { fsp: 3 }).defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    parentRunForeignKey: foreignKey({
      columns: [table.parentMigrationRunId],
      foreignColumns: [table.migrationRunId],
      name: "migration_runs_parent_fk",
    }),
    versionBaselineSequenceUnique: uniqueIndex("migration_runs_version_baseline_seq_uq").on(table.migrationVersion, table.sourceBaseline, table.runSequence),
    parentModeIndex: index("migration_runs_parent_mode_idx").on(table.parentMigrationRunId, table.runMode),
    statusHeartbeatIndex: index("migration_runs_status_heartbeat_idx").on(table.status, table.heartbeatAt),
    versionBaselineCreatedIndex: index("migration_runs_version_baseline_created_idx").on(table.migrationVersion, table.sourceBaseline, table.createdAt),
    parentNotSelfCheck: check("migration_runs_parent_not_self_ck", sql`${table.parentMigrationRunId} is null or ${table.parentMigrationRunId} <> ${table.migrationRunId}`),
    countsCheck: check(
      "migration_runs_counts_ck",
      sql`${table.processedCount} >= 0 and ${table.succeededCount} >= 0 and ${table.failedCount} >= 0 and ${table.skippedCount} >= 0 and ${table.processedCount} = ${table.succeededCount} + ${table.failedCount} + ${table.skippedCount}`,
    ),
    terminalStatusCheck: check(
      "migration_runs_terminal_status_ck",
      sql`(
        (${table.status} = 'pending' and ${table.startedAt} is null and ${table.completedAt} is null and ${table.failedAt} is null and ${table.abortedAt} is null)
        or (${table.status} = 'running' and ${table.startedAt} is not null and ${table.completedAt} is null and ${table.failedAt} is null and ${table.abortedAt} is null)
        or (${table.status} = 'completed' and ${table.startedAt} is not null and ${table.completedAt} is not null and ${table.failedAt} is null and ${table.abortedAt} is null and ${table.failureCode} is null)
        or (${table.status} = 'failed' and ${table.startedAt} is not null and ${table.completedAt} is null and ${table.failedAt} is not null and ${table.abortedAt} is null and ${table.failureCode} is not null)
        or (${table.status} = 'aborted' and ${table.startedAt} is not null and ${table.completedAt} is null and ${table.failedAt} is null and ${table.abortedAt} is not null)
      )`,
    ),
  }),
);

export const migrationCheckpoints = mysqlTable("migration_checkpoints",
  {
    id: int("id").autoincrement().primaryKey(),
    migrationRunId: varchar("migrationRunId", { length: 64 })
      .notNull()
      .references(() => migrationRuns.migrationRunId),
    checkpointKey: varchar("checkpointKey", { length: 191 }).notNull(),
    phase: mysqlEnum("phase", ["schema", "seed", "backfill", "validate", "recovery"]).notNull(),
    entityType: varchar("entityType", { length: 64 }).notNull(),
    rangeStartExclusive: varchar("rangeStartExclusive", { length: 128 }),
    rangeEndInclusive: varchar("rangeEndInclusive", { length: 128 }),
    cursorJson: json("cursorJson").$type<Record<string, unknown>>(),
    status: mysqlEnum("status", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),
    processedCount: int("processedCount").default(0).notNull(),
    succeededCount: int("succeededCount").default(0).notNull(),
    failedCount: int("failedCount").default(0).notNull(),
    skippedCount: int("skippedCount").default(0).notNull(),
    batchSize: int("batchSize").notNull(),
    attemptCount: int("attemptCount").default(0).notNull(),
    checksum: char("checksum", { length: 64 }).notNull(),
    startedAt: timestamp("startedAt", { fsp: 3 }),
    completedAt: timestamp("completedAt", { fsp: 3 }),
    failedAt: timestamp("failedAt", { fsp: 3 }),
    lastErrorCode: varchar("lastErrorCode", { length: 64 }),
    lastErrorDetail: json("lastErrorDetail").$type<Record<string, unknown>>(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { fsp: 3 }).defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    runCheckpointUnique: uniqueIndex("migration_checkpoints_run_key_uq").on(table.migrationRunId, table.checkpointKey),
    runStatusPhaseIndex: index("migration_checkpoints_run_status_phase_idx").on(table.migrationRunId, table.status, table.phase),
    entityStatusIndex: index("migration_checkpoints_entity_status_idx").on(table.entityType, table.status),
    countsCheck: check(
      "migration_checkpoints_counts_ck",
      sql`${table.processedCount} >= 0 and ${table.succeededCount} >= 0 and ${table.failedCount} >= 0 and ${table.skippedCount} >= 0 and ${table.processedCount} = ${table.succeededCount} + ${table.failedCount} + ${table.skippedCount}`,
    ),
    batchSizeCheck: check("migration_checkpoints_batch_size_ck", sql`${table.batchSize} between 1 and 500`),
  }),
);

export const migrationAnomalies = mysqlTable("migration_anomalies",
  {
    id: int("id").autoincrement().primaryKey(),
    migrationVersion: varchar("migrationVersion", { length: 32 }).notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 })
      .notNull()
      .references(() => migrationRuns.migrationRunId),
    checkpointKey: varchar("checkpointKey", { length: 191 }),
    severity: mysqlEnum("severity", ["INFO", "WARNING", "BLOCKING"]).notNull(),
    entityType: varchar("entityType", { length: 64 }).notNull(),
    entityId: int("entityId"),
    code: varchar("code", { length: 64 }).notNull(),
    fingerprint: char("fingerprint", { length: 64 }).notNull(),
    handling: mysqlEnum("handling", ["CONTINUE", "MIN_PRIVILEGE", "SKIP_ENTITY", "MANUAL_REVIEW", "ABORT_RUN"]).notNull(),
    status: mysqlEnum("status", ["open", "resolved", "waived"]).default("open").notNull(),
    detail: json("detail").$type<Record<string, unknown>>(),
    detailChecksum: char("detailChecksum", { length: 64 }).notNull(),
    resolvedAt: timestamp("resolvedAt"),
    resolvedByAccountId: int("resolvedByAccountId").references(() => users.id),
    resolutionNote: varchar("resolutionNote", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    versionIndex: index("migration_anomalies_version_idx").on(table.migrationVersion, table.code),
    runFingerprintUnique: uniqueIndex("migration_anomalies_run_fingerprint_uq").on(table.migrationRunId, table.fingerprint),
    runSeverityStatusIndex: index("migration_anomalies_run_severity_status_idx").on(table.migrationRunId, table.severity, table.status),
    entityCodeIndex: index("migration_anomalies_entity_code_idx").on(table.entityType, table.entityId, table.code),
    blockingHandlingCheck: check("migration_anomalies_blocking_handling_ck", sql`${table.severity} <> 'BLOCKING' or ${table.handling} = 'ABORT_RUN'`),
  }),
);

// ============ V3.3-A / A2 frozen directories ============

export const identityTypes = mysqlTable("identity_types",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: varchar("description", { length: 500 }),
    requiresCertification: boolean("requiresCertification").default(false).notNull(),
    isSystem: boolean("isSystem").default(false).notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    codeUnique: uniqueIndex("identity_types_code_uq").on(table.code),
    statusDeletedIndex: index("identity_types_status_deleted_idx").on(table.status, table.deletedAt),
  }),
);

export const businessIdentities = mysqlTable("business_identities",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull().references(() => users.id),
    identityTypeId: int("identityTypeId").notNull().references(() => identityTypes.id),
    status: mysqlEnum("status", ["active", "suspended", "closed"]).default("active").notNull(),
    source: mysqlEnum("source", ["system", "legacy_backfill", "self_service", "platform"]).notNull(),
    createdBy: int("createdBy").references(() => users.id),
    suspendedAt: timestamp("suspendedAt"),
    suspendedBy: int("suspendedBy").references(() => users.id),
    suspensionReason: varchar("suspensionReason", { length: 500 }),
    closedAt: timestamp("closedAt"),
    version: int("version").default(1).notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    accountTypeUnique: uniqueIndex("business_identities_account_type_uq").on(table.accountId, table.identityTypeId),
    accountStatusIndex: index("business_identities_account_status_idx").on(table.accountId, table.status),
    typeStatusIndex: index("business_identities_type_status_idx").on(table.identityTypeId, table.status),
    migrationRunIndex: index("business_identities_migration_run_idx").on(table.migrationRunId),
  }),
);

export const identityProfiles = mysqlTable("identity_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    identityId: int("identityId").notNull().references(() => businessIdentities.id),
    displayName: varchar("displayName", { length: 128 }),
    professionalTitle: varchar("professionalTitle", { length: 128 }),
    introduction: text("introduction"),
    skills: json("skills").$type<string[]>(),
    cityCode: varchar("cityCode", { length: 32 }),
    cityName: varchar("cityName", { length: 64 }),
    contactPhoneEncrypted: varbinary("contactPhoneEncrypted", { length: 512 }),
    contactPhoneLast4: char("contactPhoneLast4", { length: 4 }),
    contactEmailEncrypted: varbinary("contactEmailEncrypted", { length: 768 }),
    publicContactPolicy: mysqlEnum("publicContactPolicy", ["hidden", "masked", "visible"]).default("hidden").notNull(),
    profileData: json("profileData").$type<Record<string, unknown>>(),
    version: int("version").default(1).notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    identityUnique: uniqueIndex("identity_profiles_identity_uq").on(table.identityId),
    cityDeletedIndex: index("identity_profiles_city_deleted_idx").on(table.cityCode, table.deletedAt),
    migrationRunIndex: index("identity_profiles_migration_run_idx").on(table.migrationRunId),
  }),
);

export const certificationTypes = mysqlTable("certification_types",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    subjectType: mysqlEnum("subjectType", ["identity", "organization", "either"]).notNull(),
    reviewMode: mysqlEnum("reviewMode", ["single", "two_stage"]).default("single").notNull(),
    validityDays: int("validityDays"),
    sensitiveLevel: mysqlEnum("sensitiveLevel", ["sensitive", "high_sensitive"]).default("sensitive").notNull(),
    requirements: json("requirements").$type<Record<string, unknown>>(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    codeUnique: uniqueIndex("certification_types_code_uq").on(table.code),
    subjectStatusIndex: index("certification_types_subject_status_idx").on(table.subjectType, table.status),
  }),
);

export const capabilities = mysqlTable("capabilities",
  {
    code: varchar("code", { length: 128 }).primaryKey(),
    domain: varchar("domain", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    riskLevel: mysqlEnum("riskLevel", ["normal", "sensitive", "high"]).default("normal").notNull(),
    defaultAuditMode: mysqlEnum("defaultAuditMode", ["none", "deny", "allow_and_deny"]).default("deny").notNull(),
    status: mysqlEnum("status", ["active", "deprecated"]).default("active").notNull(),
    replacementCode: varchar("replacementCode", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    replacementForeignKey: foreignKey({
      columns: [table.replacementCode],
      foreignColumns: [table.code],
      name: "capabilities_replacement_fk",
    }),
    domainStatusIndex: index("capabilities_domain_status_idx").on(table.domain, table.status),
  }),
);

export const projectRoles = mysqlTable("project_roles", {
  code: varchar("code", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  isSystem: boolean("isSystem").default(true).notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
});

export const organizations = mysqlTable("organizations",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    organizationType: varchar("organizationType", { length: 64 }).notNull(),
    registrationCountry: char("registrationCountry", { length: 2 }),
    creatorAccountId: int("creatorAccountId").notNull().references(() => users.id),
    description: text("description"),
    cityCode: varchar("cityCode", { length: 32 }),
    cityName: varchar("cityName", { length: 64 }),
    status: mysqlEnum("status", ["active", "suspended", "dissolving", "closed"]).default("active").notNull(),
    suspendedAt: timestamp("suspendedAt"),
    closedAt: timestamp("closedAt"),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    creatorIndex: index("organizations_creator_idx").on(table.creatorAccountId),
    typeStatusIndex: index("organizations_type_status_idx").on(table.organizationType, table.status),
    cityStatusIndex: index("organizations_city_status_idx").on(table.cityCode, table.status),
  }),
);

export const organizationMemberships = mysqlTable("organization_memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id),
    accountId: int("accountId").notNull().references(() => users.id),
    status: mysqlEnum("status", ["active", "suspended", "left", "removed"]).default("active").notNull(),
    sourceInvitationId: int("sourceInvitationId"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    suspendedAt: timestamp("suspendedAt"),
    leftAt: timestamp("leftAt"),
    removedAt: timestamp("removedAt"),
    endedBy: int("endedBy").references(() => users.id),
    endReason: varchar("endReason", { length: 500 }),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    organizationAccountUnique: uniqueIndex("organization_memberships_org_account_uq").on(table.organizationId, table.accountId),
    organizationIdUnique: uniqueIndex("organization_memberships_org_id_uq").on(table.organizationId, table.id),
    accountStatusIndex: index("organization_memberships_account_status_idx").on(table.accountId, table.status),
    organizationStatusIndex: index("organization_memberships_org_status_idx").on(table.organizationId, table.status),
  }),
);

export const organizationInvitations = mysqlTable("organization_invitations",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id),
    inviterMembershipId: int("inviterMembershipId").notNull(),
    inviteeAccountId: int("inviteeAccountId").references(() => users.id),
    inviteePhoneDigest: char("inviteePhoneDigest", { length: 64 }),
    inviteeEmailDigest: char("inviteeEmailDigest", { length: 64 }),
    tokenDigest: char("tokenDigest", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "declined", "revoked", "expired"]).default("pending").notNull(),
    activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedByAccountId: int("acceptedByAccountId").references(() => users.id),
    acceptedAt: timestamp("acceptedAt"),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("organization_invitations_token_uq").on(table.tokenDigest),
    requestUnique: uniqueIndex("organization_invitations_request_uq").on(table.requestId),
    activeDedupeUnique: uniqueIndex("organization_invitations_active_dedupe_uq").on(table.activeDedupeKey),
    organizationIdUnique: uniqueIndex("organization_invitations_org_id_uq").on(table.organizationId, table.id),
    organizationStatusExpiryIndex: index("organization_invitations_org_status_exp_idx").on(table.organizationId, table.status, table.expiresAt),
    inviteeStatusIndex: index("organization_invitations_invitee_status_idx").on(table.inviteeAccountId, table.status),
    inviterOrganizationForeignKey: foreignKey({
      columns: [table.organizationId, table.inviterMembershipId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.id],
      name: "organization_invitations_inviter_org_fk",
    }),
    inviteeExactlyOneCheck: check(
      "organization_invitations_target_ck",
      sql`(${table.inviteeAccountId} is not null) + (${table.inviteePhoneDigest} is not null) + (${table.inviteeEmailDigest} is not null) = 1`,
    ),
  }),
);

export const organizationPositions = mysqlTable("organization_positions",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: varchar("description", { length: 500 }),
    isOwnerPosition: boolean("isOwnerPosition").default(false).notNull(),
    isSystem: boolean("isSystem").default(false).notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    organizationCodeUnique: uniqueIndex("organization_positions_org_code_uq").on(table.organizationId, table.code),
    organizationIdUnique: uniqueIndex("organization_positions_org_id_uq").on(table.organizationId, table.id),
    organizationStatusIndex: index("organization_positions_org_status_idx").on(table.organizationId, table.status),
  }),
);

export const organizationMemberPositions = mysqlTable("organization_member_positions",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id),
    membershipId: int("membershipId").notNull(),
    positionId: int("positionId").notNull(),
    status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
    assignedBy: int("assignedBy").notNull().references(() => users.id),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
    revokedBy: int("revokedBy").references(() => users.id),
    revokedAt: timestamp("revokedAt"),
    reason: varchar("reason", { length: 500 }),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
  },
  (table) => ({
    membershipPositionUnique: uniqueIndex("organization_member_positions_member_pos_uq").on(table.membershipId, table.positionId),
    organizationStatusIndex: index("organization_member_positions_org_status_idx").on(table.organizationId, table.status),
    membershipOrganizationForeignKey: foreignKey({
      columns: [table.organizationId, table.membershipId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.id],
      name: "organization_member_positions_member_org_fk",
    }),
    positionOrganizationForeignKey: foreignKey({
      columns: [table.organizationId, table.positionId],
      foreignColumns: [organizationPositions.organizationId, organizationPositions.id],
      name: "organization_member_positions_position_org_fk",
    }),
  }),
);

export const positionCapabilities = mysqlTable("position_capabilities",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id),
    positionId: int("positionId").notNull(),
    capabilityCode: varchar("capabilityCode", { length: 128 }).notNull().references(() => capabilities.code),
    dataScope: mysqlEnum("dataScope", ["SELF", "OWNED_RESOURCE", "ORGANIZATION", "PROJECT", "ASSIGNED_RESOURCE", "CITY_OR_REGION", "PUBLIC", "INVITED_RESOURCE", "PLATFORM_ASSIGNED", "PLATFORM_ALL"]).notNull(),
    conditionJson: json("conditionJson").$type<Record<string, unknown>>(),
    status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
    grantedBy: int("grantedBy").notNull().references(() => users.id),
    revokedBy: int("revokedBy").references(() => users.id),
    revokedAt: timestamp("revokedAt"),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    positionCapabilityScopeUnique: uniqueIndex("position_capabilities_pos_cap_scope_uq").on(table.positionId, table.capabilityCode, table.dataScope),
    organizationCapabilityStatusIndex: index("position_capabilities_org_cap_status_idx").on(table.organizationId, table.capabilityCode, table.status),
    positionOrganizationForeignKey: foreignKey({
      columns: [table.organizationId, table.positionId],
      foreignColumns: [organizationPositions.organizationId, organizationPositions.id],
      name: "position_capabilities_position_org_fk",
    }),
  }),
);

export const organizationOwnerTransfers = mysqlTable("organization_owner_transfers",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id),
    fromMembershipId: int("fromMembershipId").notNull(),
    toMembershipId: int("toMembershipId").notNull(),
    status: mysqlEnum("status", ["pending", "confirmed", "cancelled", "expired", "completed"]).default("pending").notNull(),
    activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
    initiatedBy: int("initiatedBy").notNull().references(() => users.id),
    initiatorConfirmedAt: timestamp("initiatorConfirmedAt"),
    recipientConfirmedAt: timestamp("recipientConfirmedAt"),
    secondFactorConfirmedAt: timestamp("secondFactorConfirmedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
    completedAt: timestamp("completedAt"),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    requestUnique: uniqueIndex("organization_owner_transfers_request_uq").on(table.requestId),
    activeDedupeUnique: uniqueIndex("organization_owner_transfers_active_dedupe_uq").on(table.activeDedupeKey),
    organizationStatusIndex: index("organization_owner_transfers_org_status_idx").on(table.organizationId, table.status),
    fromMembershipOrganizationForeignKey: foreignKey({
      columns: [table.organizationId, table.fromMembershipId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.id],
      name: "organization_owner_transfers_from_org_fk",
    }),
    toMembershipOrganizationForeignKey: foreignKey({
      columns: [table.organizationId, table.toMembershipId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.id],
      name: "organization_owner_transfers_to_org_fk",
    }),
  }),
);

export const projectMemberships = mysqlTable("project_memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull().references(() => projects.id),
    accountId: int("accountId").notNull().references(() => users.id),
    businessIdentityId: int("businessIdentityId").references(() => businessIdentities.id),
    sourceOrganizationId: int("sourceOrganizationId").references(() => organizations.id),
    status: mysqlEnum("status", ["active", "suspended", "left", "removed"]).default("active").notNull(),
    sourceInvitationId: int("sourceInvitationId"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    suspendedAt: timestamp("suspendedAt"),
    leftAt: timestamp("leftAt"),
    removedAt: timestamp("removedAt"),
    endedBy: int("endedBy").references(() => users.id),
    endReason: varchar("endReason", { length: 500 }),
    confidentialityClearance: mysqlEnum("confidentialityClearance", ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"]).default("INTERNAL").notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    projectAccountUnique: uniqueIndex("project_memberships_project_account_uq").on(table.projectId, table.accountId),
    projectIdUnique: uniqueIndex("project_memberships_project_id_uq").on(table.projectId, table.id),
    accountStatusIndex: index("project_memberships_account_status_idx").on(table.accountId, table.status),
    projectStatusIndex: index("project_memberships_project_status_idx").on(table.projectId, table.status),
    organizationProjectStatusIndex: index("project_memberships_org_project_status_idx").on(table.sourceOrganizationId, table.projectId, table.status),
    migrationRunIndex: index("project_memberships_migration_run_idx").on(table.migrationRunId),
  }),
);

export const projectInvitations = mysqlTable("project_invitations",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull().references(() => projects.id),
    inviterMembershipId: int("inviterMembershipId").notNull(),
    inviteeAccountId: int("inviteeAccountId").references(() => users.id),
    inviteeOrganizationId: int("inviteeOrganizationId").references(() => organizations.id),
    proposedRoleCode: varchar("proposedRoleCode", { length: 64 }).notNull().references(() => projectRoles.code),
    confidentialityClearance: mysqlEnum("confidentialityClearance", ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"]).default("INTERNAL").notNull(),
    tokenDigest: char("tokenDigest", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "declined", "revoked", "expired"]).default("pending").notNull(),
    activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("project_invitations_token_uq").on(table.tokenDigest),
    requestUnique: uniqueIndex("project_invitations_request_uq").on(table.requestId),
    activeDedupeUnique: uniqueIndex("project_invitations_active_dedupe_uq").on(table.activeDedupeKey),
    projectIdUnique: uniqueIndex("project_invitations_project_id_uq").on(table.projectId, table.id),
    projectStatusExpiryIndex: index("project_invitations_project_status_exp_idx").on(table.projectId, table.status, table.expiresAt),
    inviterProjectForeignKey: foreignKey({
      columns: [table.projectId, table.inviterMembershipId],
      foreignColumns: [projectMemberships.projectId, projectMemberships.id],
      name: "project_invitations_inviter_project_fk",
    }),
    inviteeExactlyOneCheck: check(
      "project_invitations_target_ck",
      sql`(${table.inviteeAccountId} is not null) + (${table.inviteeOrganizationId} is not null) = 1`,
    ),
  }),
);

export const projectMembershipRoles = mysqlTable("project_membership_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull().references(() => projects.id),
    projectMembershipId: int("projectMembershipId").notNull(),
    roleCode: varchar("roleCode", { length: 64 }).notNull().references(() => projectRoles.code),
    status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
    assignedBy: int("assignedBy").notNull().references(() => users.id),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
    revokedBy: int("revokedBy").references(() => users.id),
    revokedAt: timestamp("revokedAt"),
    reason: varchar("reason", { length: 500 }),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
  },
  (table) => ({
    membershipRoleUnique: uniqueIndex("project_membership_roles_member_role_uq").on(table.projectMembershipId, table.roleCode),
    projectRoleStatusIndex: index("project_membership_roles_project_role_status_idx").on(table.projectId, table.roleCode, table.status),
    migrationRunIndex: index("project_membership_roles_migration_run_idx").on(table.migrationRunId),
    membershipProjectForeignKey: foreignKey({
      columns: [table.projectId, table.projectMembershipId],
      foreignColumns: [projectMemberships.projectId, projectMemberships.id],
      name: "project_membership_roles_member_project_fk",
    }),
  }),
);

export const projectRoleCapabilities = mysqlTable("project_role_capabilities",
  {
    id: int("id").autoincrement().primaryKey(),
    roleCode: varchar("roleCode", { length: 64 }).notNull().references(() => projectRoles.code),
    capabilityCode: varchar("capabilityCode", { length: 128 }).notNull().references(() => capabilities.code),
    dataScope: mysqlEnum("dataScope", ["SELF", "OWNED_RESOURCE", "ORGANIZATION", "PROJECT", "ASSIGNED_RESOURCE", "CITY_OR_REGION", "PUBLIC", "INVITED_RESOURCE", "PLATFORM_ASSIGNED", "PLATFORM_ALL"]).default("PROJECT").notNull(),
    conditionJson: json("conditionJson").$type<Record<string, unknown>>(),
    status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
  },
  (table) => ({
    roleCapabilityScopeUnique: uniqueIndex("project_role_capabilities_role_cap_scope_uq").on(table.roleCode, table.capabilityCode, table.dataScope),
    capabilityStatusIndex: index("project_role_capabilities_cap_status_idx").on(table.capabilityCode, table.status),
  }),
);

export const platformStaffPositions = mysqlTable("platform_staff_positions",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull().references(() => users.id),
    positionCode: varchar("positionCode", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["active", "suspended", "revoked", "expired"]).default("active").notNull(),
    activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
    assignedCaseScope: json("assignedCaseScope").$type<Record<string, unknown>>(),
    validFrom: timestamp("validFrom").defaultNow().notNull(),
    validUntil: timestamp("validUntil"),
    assignedBy: int("assignedBy").notNull().references(() => users.id),
    assignmentReason: varchar("assignmentReason", { length: 500 }).notNull(),
    suspendedAt: timestamp("suspendedAt"),
    revokedAt: timestamp("revokedAt"),
    revokedBy: int("revokedBy").references(() => users.id),
    version: int("version").default(1).notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    activeDedupeUnique: uniqueIndex("platform_staff_positions_active_dedupe_uq").on(table.activeDedupeKey),
    accountStatusValidityIndex: index("platform_staff_positions_account_status_valid_idx").on(table.accountId, table.status, table.validUntil),
    codeStatusIndex: index("platform_staff_positions_code_status_idx").on(table.positionCode, table.status),
    migrationRunIndex: index("platform_staff_positions_migration_run_idx").on(table.migrationRunId),
  }),
);

export const certifications = mysqlTable("certifications",
  {
    id: int("id").autoincrement().primaryKey(),
    applicationNo: varchar("applicationNo", { length: 64 }).notNull(),
    certificationTypeId: int("certificationTypeId").notNull().references(() => certificationTypes.id),
    subjectIdentityId: int("subjectIdentityId").references(() => businessIdentities.id),
    subjectOrganizationId: int("subjectOrganizationId").references(() => organizations.id),
    status: mysqlEnum("status", ["not_applied", "pending", "additional_info_required", "approved", "rejected", "revoked", "expired"]).default("not_applied").notNull(),
    applicationData: json("applicationData").$type<Record<string, unknown>>(),
    activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
    submittedAt: timestamp("submittedAt"),
    approvedAt: timestamp("approvedAt"),
    expiresAt: timestamp("expiresAt"),
    revokedAt: timestamp("revokedAt"),
    revokedBy: int("revokedBy").references(() => users.id),
    decisionReasonCode: varchar("decisionReasonCode", { length: 64 }),
    decisionReason: varchar("decisionReason", { length: 500 }),
    legacySourceType: varchar("legacySourceType", { length: 64 }),
    legacySourceId: int("legacySourceId"),
    version: int("version").default(1).notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    applicationNoUnique: uniqueIndex("certifications_application_no_uq").on(table.applicationNo),
    activeDedupeUnique: uniqueIndex("certifications_active_dedupe_uq").on(table.activeDedupeKey),
    legacySourceUnique: uniqueIndex("certifications_legacy_source_uq").on(table.legacySourceType, table.legacySourceId),
    identityTypeStatusIndex: index("certifications_identity_type_status_idx").on(table.subjectIdentityId, table.certificationTypeId, table.status),
    organizationTypeStatusIndex: index("certifications_org_type_status_idx").on(table.subjectOrganizationId, table.certificationTypeId, table.status),
    statusExpiryIndex: index("certifications_status_expiry_idx").on(table.status, table.expiresAt),
    migrationRunIndex: index("certifications_migration_run_idx").on(table.migrationRunId),
    subjectExactlyOneCheck: check(
      "certifications_subject_ck",
      sql`(${table.subjectIdentityId} is not null) + (${table.subjectOrganizationId} is not null) = 1`,
    ),
  }),
);

export const certificationDocuments = mysqlTable("certification_documents",
  {
    id: int("id").autoincrement().primaryKey(),
    certificationId: int("certificationId").notNull().references(() => certifications.id),
    fileId: int("fileId").notNull().references(() => storedFiles.id),
    documentType: varchar("documentType", { length: 64 }).notNull(),
    versionNo: int("versionNo").default(1).notNull(),
    status: mysqlEnum("status", ["available", "superseded", "disabled"]).default("available").notNull(),
    uploadedBy: int("uploadedBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    disabledAt: timestamp("disabledAt"),
    disabledBy: int("disabledBy").references(() => users.id),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
  },
  (table) => ({
    typeVersionUnique: uniqueIndex("certification_documents_type_version_uq").on(table.certificationId, table.documentType, table.versionNo),
    certificationFileUnique: uniqueIndex("certification_documents_cert_file_uq").on(table.certificationId, table.fileId),
    certificationStatusIndex: index("certification_documents_cert_status_idx").on(table.certificationId, table.status),
    migrationRunIndex: index("certification_documents_migration_run_idx").on(table.migrationRunId),
  }),
);

export const certificationReviewActions = mysqlTable("certification_review_actions",
  {
    id: int("id").autoincrement().primaryKey(),
    certificationId: int("certificationId").notNull().references(() => certifications.id),
    stage: mysqlEnum("stage", ["submission", "initial_review", "final_review", "revocation", "expiry"]).notNull(),
    action: mysqlEnum("action", ["submit", "resubmit", "start_review", "request_info", "approve", "reject", "revoke", "expire"]).notNull(),
    fromStatus: varchar("fromStatus", { length: 32 }),
    toStatus: varchar("toStatus", { length: 32 }).notNull(),
    actorId: int("actorId").references(() => users.id),
    platformStaffPositionId: int("platformStaffPositionId").references(() => platformStaffPositions.id),
    reasonCode: varchar("reasonCode", { length: 64 }),
    reason: varchar("reason", { length: 500 }),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
  },
  (table) => ({
    requestUnique: uniqueIndex("certification_review_actions_request_uq").on(table.requestId),
    certificationCreatedIndex: index("cert_review_actions_cert_created_idx").on(table.certificationId, table.createdAt),
    actorStageCreatedIndex: index("cert_review_actions_actor_stage_created_idx").on(table.actorId, table.stage, table.createdAt),
    migrationRunIndex: index("cert_review_actions_migration_run_idx").on(table.migrationRunId),
  }),
);

export const capabilityGrants = mysqlTable("capability_grants",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").references(() => users.id),
    businessIdentityId: int("businessIdentityId").references(() => businessIdentities.id),
    organizationMembershipId: int("organizationMembershipId").references(() => organizationMemberships.id),
    projectMembershipId: int("projectMembershipId").references(() => projectMemberships.id),
    platformStaffPositionId: int("platformStaffPositionId").references(() => platformStaffPositions.id),
    capabilityCode: varchar("capabilityCode", { length: 128 }).notNull().references(() => capabilities.code),
    dataScope: mysqlEnum("dataScope", ["SELF", "OWNED_RESOURCE", "ORGANIZATION", "PROJECT", "ASSIGNED_RESOURCE", "CITY_OR_REGION", "PUBLIC", "INVITED_RESOURCE", "PLATFORM_ASSIGNED", "PLATFORM_ALL"]).notNull(),
    resourceType: varchar("resourceType", { length: 64 }),
    resourceId: varchar("resourceId", { length: 64 }),
    conditionJson: json("conditionJson").$type<Record<string, unknown>>(),
    status: mysqlEnum("status", ["active", "revoked", "expired"]).default("active").notNull(),
    validFrom: timestamp("validFrom").defaultNow().notNull(),
    validUntil: timestamp("validUntil"),
    grantedBy: int("grantedBy").notNull().references(() => users.id),
    grantReason: varchar("grantReason", { length: 500 }).notNull(),
    revokedBy: int("revokedBy").references(() => users.id),
    revokedAt: timestamp("revokedAt"),
    revokeReason: varchar("revokeReason", { length: 500 }),
    activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    activeDedupeUnique: uniqueIndex("capability_grants_active_dedupe_uq").on(table.activeDedupeKey),
    capabilityStatusValidityIndex: index("capability_grants_cap_status_valid_idx").on(table.capabilityCode, table.status, table.validUntil),
    accountStatusIndex: index("capability_grants_account_status_idx").on(table.accountId, table.status),
    identityStatusIndex: index("capability_grants_identity_status_idx").on(table.businessIdentityId, table.status),
    organizationMembershipStatusIndex: index("capability_grants_org_member_status_idx").on(table.organizationMembershipId, table.status),
    projectMembershipStatusIndex: index("capability_grants_project_member_status_idx").on(table.projectMembershipId, table.status),
    platformPositionStatusIndex: index("capability_grants_platform_pos_status_idx").on(table.platformStaffPositionId, table.status),
    subjectExactlyOneCheck: check(
      "capability_grants_subject_ck",
      sql`(${table.accountId} is not null) + (${table.businessIdentityId} is not null) + (${table.organizationMembershipId} is not null) + (${table.projectMembershipId} is not null) + (${table.platformStaffPositionId} is not null) = 1`,
    ),
  }),
);

export const workspacePreferences = mysqlTable("workspace_preferences",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull().references(() => users.id),
    workspaceType: mysqlEnum("workspaceType", ["personal", "identity", "organization", "platform"]).default("personal").notNull(),
    identityId: int("identityId").references(() => businessIdentities.id),
    organizationId: int("organizationId").references(() => organizations.id),
    platformStaffPositionId: int("platformStaffPositionId").references(() => platformStaffPositions.id),
    lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
    version: int("version").default(1).notNull(),
    migrationRunId: varchar("migrationRunId", { length: 64 }).references(() => migrationRuns.migrationRunId),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    accountUnique: uniqueIndex("workspace_preferences_account_uq").on(table.accountId),
    identityIndex: index("workspace_preferences_identity_idx").on(table.identityId),
    organizationIndex: index("workspace_preferences_organization_idx").on(table.organizationId),
    migrationRunIndex: index("workspace_preferences_migration_run_idx").on(table.migrationRunId),
    workspaceTargetCheck: check(
      "workspace_preferences_target_ck",
      sql`(
        (${table.workspaceType} = 'personal' and ${table.identityId} is null and ${table.organizationId} is null and ${table.platformStaffPositionId} is null)
        or (${table.workspaceType} = 'identity' and ${table.identityId} is not null and ${table.organizationId} is null and ${table.platformStaffPositionId} is null)
        or (${table.workspaceType} = 'organization' and ${table.identityId} is null and ${table.organizationId} is not null and ${table.platformStaffPositionId} is null)
        or (${table.workspaceType} = 'platform' and ${table.identityId} is null and ${table.organizationId} is null and ${table.platformStaffPositionId} is not null)
      )`,
    ),
  }),
);

export const permissionAuditEvents = mysqlTable("permission_audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    eventId: char("eventId", { length: 36 }).notNull(),
    requestId: varchar("requestId", { length: 64 }),
    idempotencyKey: varchar("idempotencyKey", { length: 191 }),
    actorAccountId: int("actorAccountId").references(() => users.id),
    actorType: mysqlEnum("actorType", ["account", "system"]).notNull(),
    activeIdentityId: int("activeIdentityId").references(() => businessIdentities.id),
    organizationId: int("organizationId").references(() => organizations.id),
    projectId: int("projectId").references(() => projects.id),
    platformStaffPositionId: int("platformStaffPositionId").references(() => platformStaffPositions.id),
    capabilityCode: varchar("capabilityCode", { length: 128 }).references(() => capabilities.code),
    resourceType: varchar("resourceType", { length: 64 }).notNull(),
    resourceId: varchar("resourceId", { length: 64 }),
    decision: mysqlEnum("decision", ["allow", "deny", "changed"]).notNull(),
    reasonCode: varchar("reasonCode", { length: 64 }).notNull(),
    resolvedDataScope: varchar("resolvedDataScope", { length: 32 }),
    confidentiality: varchar("confidentiality", { length: 32 }),
    fieldMask: json("fieldMask").$type<Record<string, unknown>>(),
    policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
    contextData: json("contextData").$type<Record<string, unknown>>(),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: varchar("userAgent", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    eventUnique: uniqueIndex("permission_audit_events_event_uq").on(table.eventId),
    idempotencyUnique: uniqueIndex("permission_audit_events_idempotency_uq").on(table.idempotencyKey),
    actorCreatedIndex: index("permission_audit_events_actor_created_idx").on(table.actorAccountId, table.createdAt),
    resourceCreatedIndex: index("permission_audit_events_resource_created_idx").on(table.resourceType, table.resourceId, table.createdAt),
    capabilityDecisionCreatedIndex: index("permission_audit_events_cap_decision_created_idx").on(table.capabilityCode, table.decision, table.createdAt),
    organizationCreatedIndex: index("permission_audit_events_org_created_idx").on(table.organizationId, table.createdAt),
    projectCreatedIndex: index("permission_audit_events_project_created_idx").on(table.projectId, table.createdAt),
  }),
);

export const appSchemaVersions = mysqlTable("app_schema_versions", {
  version: varchar("version", { length: 32 }).primaryKey(),
  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
});

// ============ V3.1 支付、托管与结算 ============

export const payments = mysqlTable("payments",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentNo: varchar("paymentNo", { length: 40 }).notNull(),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    payerId: int("payerId")
      .notNull()
      .references(() => users.id),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("CNY").notNull(),
    provider: varchar("provider", { length: 32 }).default("sandbox").notNull(),
    providerTransactionNo: varchar("providerTransactionNo", { length: 128 }),
    status: mysqlEnum("status", ["created", "pending", "success", "failed", "closed", "refunding", "partially_refunded", "refunded"]).default("created").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    paidAt: timestamp("paidAt"),
    failedReason: varchar("failedReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    paymentNoUnique: uniqueIndex("payments_payment_no_unique").on(table.paymentNo),
    payerIdempotencyUnique: uniqueIndex("payments_payer_idempotency_unique").on(table.payerId, table.idempotencyKey),
    providerTransactionUnique: uniqueIndex("payments_provider_tx_unique").on(table.provider, table.providerTransactionNo),
    orderStatusIndex: index("payments_order_status_idx").on(table.orderId, table.status),
  }),
);
export type Payment = typeof payments.$inferSelect;

export const paymentAttempts = mysqlTable("payment_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentId: int("paymentId")
      .notNull()
      .references(() => payments.id),
    attemptNo: int("attemptNo").notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerRequestId: varchar("providerRequestId", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["pending", "success", "failed"]).default("pending").notNull(),
    requestData: json("requestData").$type<Record<string, unknown>>(),
    responseData: json("responseData").$type<Record<string, unknown>>(),
    failedReason: varchar("failedReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (table) => ({
    paymentAttemptUnique: uniqueIndex("payment_attempts_payment_no_unique").on(table.paymentId, table.attemptNo),
    providerRequestUnique: uniqueIndex("payment_attempts_provider_req_unique").on(table.provider, table.providerRequestId),
  }),
);

export const paymentEvents = mysqlTable("payment_events",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentId: int("paymentId")
      .notNull()
      .references(() => payments.id),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("CNY").notNull(),
    externalEventNo: varchar("externalEventNo", { length: 128 }),
    detail: json("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    paymentEventIndex: index("payment_events_payment_created_idx").on(table.paymentId, table.createdAt),
    externalEventUnique: uniqueIndex("payment_events_external_unique").on(table.externalEventNo),
  }),
);

export const refunds = mysqlTable("refunds",
  {
    id: int("id").autoincrement().primaryKey(),
    refundNo: varchar("refundNo", { length: 40 }).notNull(),
    paymentId: int("paymentId")
      .notNull()
      .references(() => payments.id),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    requesterId: int("requesterId")
      .notNull()
      .references(() => users.id),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("CNY").notNull(),
    reason: text("reason").notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "under_review", "approved", "processing", "success", "rejected", "cancelled", "failed"]).default("submitted").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    providerRefundNo: varchar("providerRefundNo", { length: 128 }),
    reviewedBy: int("reviewedBy").references(() => users.id),
    reviewReason: varchar("reviewReason", { length: 500 }),
    reviewedAt: timestamp("reviewedAt"),
    completedAt: timestamp("completedAt"),
    failedReason: varchar("failedReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    refundNoUnique: uniqueIndex("refunds_refund_no_unique").on(table.refundNo),
    requesterIdempotencyUnique: uniqueIndex("refunds_requester_idem_unique").on(table.requesterId, table.idempotencyKey),
    providerRefundUnique: uniqueIndex("refunds_provider_refund_unique").on(table.providerRefundNo),
    paymentStatusIndex: index("refunds_payment_status_idx").on(table.paymentId, table.status),
  }),
);
export type Refund = typeof refunds.$inferSelect;

/** Every provider refund call is recorded independently so failed refunds can be retried safely. */
export const refundAttempts = mysqlTable("refund_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    refundId: int("refundId")
      .notNull()
      .references(() => refunds.id),
    attemptNo: int("attemptNo").notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerRequestId: varchar("providerRequestId", { length: 128 }).notNull(),
    providerIdempotencyKey: varchar("providerIdempotencyKey", {
      length: 180,
    }).notNull(),
    operatorId: int("operatorId")
      .notNull()
      .references(() => users.id),
    orderPreviousStatus: varchar("orderPreviousStatus", {
      length: 32,
    }).notNull(),
    status: mysqlEnum("status", ["pending", "success", "failed"]).default("pending").notNull(),
    requestData: json("requestData").$type<Record<string, unknown>>(),
    responseData: json("responseData").$type<Record<string, unknown>>(),
    failedReason: varchar("failedReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (table) => ({
    refundAttemptUnique: uniqueIndex("refund_attempts_refund_no_unique").on(table.refundId, table.attemptNo),
    providerRequestUnique: uniqueIndex("refund_attempts_provider_req_unique").on(table.provider, table.providerRequestId),
    refundStatusIndex: index("refund_attempts_refund_status_idx").on(table.refundId, table.status),
  }),
);
export type RefundAttempt = typeof refundAttempts.$inferSelect;

export const escrowRecords = mysqlTable("escrow_records",
  {
    id: int("id").autoincrement().primaryKey(),
    escrowNo: varchar("escrowNo", { length: 40 }).notNull(),
    paymentId: int("paymentId")
      .notNull()
      .references(() => payments.id),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    projectId: int("projectId").references(() => projects.id),
    payerId: int("payerId")
      .notNull()
      .references(() => users.id),
    payeeId: int("payeeId")
      .notNull()
      .references(() => users.id),
    totalAmount: decimal("totalAmount", { precision: 14, scale: 2 }).notNull(),
    fundedAmount: decimal("fundedAmount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    releasedAmount: decimal("releasedAmount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    refundedAmount: decimal("refundedAmount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    currency: varchar("currency", { length: 3 }).default("CNY").notNull(),
    status: mysqlEnum("status", ["pending", "funded", "partially_released", "released", "frozen", "partially_refunded", "refunded", "closed"]).default("pending").notNull(),
    frozenReason: varchar("frozenReason", { length: 500 }),
    fundedAt: timestamp("fundedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    escrowNoUnique: uniqueIndex("escrow_records_escrow_no_unique").on(table.escrowNo),
    paymentUnique: uniqueIndex("escrow_records_payment_unique").on(table.paymentId),
    projectStatusIndex: index("escrow_records_project_status_idx").on(table.projectId, table.status),
  }),
);
export type EscrowRecord = typeof escrowRecords.$inferSelect;

export const settlements = mysqlTable("settlements",
  {
    id: int("id").autoincrement().primaryKey(),
    settlementNo: varchar("settlementNo", { length: 40 }).notNull(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    milestoneId: int("milestoneId")
      .notNull()
      .references(() => milestones.id),
    payeeId: int("payeeId")
      .notNull()
      .references(() => users.id),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("CNY").notNull(),
    status: mysqlEnum("status", ["pending", "under_review", "approved", "processing", "settled", "rejected", "frozen"]).default("pending").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    reviewedBy: int("reviewedBy").references(() => users.id),
    reviewedAt: timestamp("reviewedAt"),
    settledAt: timestamp("settledAt"),
    frozenReason: varchar("frozenReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    settlementNoUnique: uniqueIndex("settlements_settlement_no_unique").on(table.settlementNo),
    milestoneUnique: uniqueIndex("settlements_milestone_unique").on(table.milestoneId),
    idempotencyUnique: uniqueIndex("settlements_idempotency_unique").on(table.idempotencyKey),
    projectStatusIndex: index("settlements_project_status_idx").on(table.projectId, table.status),
  }),
);
export type Settlement = typeof settlements.$inferSelect;

export const settlementItems = mysqlTable("settlement_items",
  {
    id: int("id").autoincrement().primaryKey(),
    settlementId: int("settlementId")
      .notNull()
      .references(() => settlements.id),
    milestoneId: int("milestoneId").references(() => milestones.id),
    orderId: int("orderId").references(() => orders.id),
    itemType: varchar("itemType", { length: 32 }).default("milestone").notNull(),
    description: varchar("description", { length: 255 }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    settlementIndex: index("settlement_items_settlement_idx").on(table.settlementId),
  }),
);

export const escrowReleases = mysqlTable("escrow_releases",
  {
    id: int("id").autoincrement().primaryKey(),
    releaseNo: varchar("releaseNo", { length: 40 }).notNull(),
    escrowId: int("escrowId")
      .notNull()
      .references(() => escrowRecords.id),
    settlementId: int("settlementId").references(() => settlements.id),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("CNY").notNull(),
    status: mysqlEnum("status", ["pending", "processing", "success", "failed", "cancelled"]).default("pending").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    releasedBy: int("releasedBy").references(() => users.id),
    releasedAt: timestamp("releasedAt"),
    failedReason: varchar("failedReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    releaseNoUnique: uniqueIndex("escrow_releases_release_no_unique").on(table.releaseNo),
    idempotencyUnique: uniqueIndex("escrow_releases_idempotency_unique").on(table.idempotencyKey),
    settlementUnique: uniqueIndex("escrow_releases_settlement_unique").on(table.settlementId),
  }),
);

// ============ V3.1 实名与资质认证 ============

const verificationStatuses = ["draft", "submitted", "under_review", "additional_info_required", "approved", "rejected", "expired", "revoked"] as const;

export const identityVerifications = mysqlTable("identity_verifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    realName: varchar("realName", { length: 64 }).notNull(),
    idType: varchar("idType", { length: 32 }).default("cn_id").notNull(),
    idNumberDigest: varchar("idNumberDigest", { length: 64 }).notNull(),
    idNumberLast4: varchar("idNumberLast4", { length: 4 }).notNull(),
    provider: varchar("provider", { length: 32 }).default("manual").notNull(),
    status: mysqlEnum("status", verificationStatuses).default("submitted").notNull(),
    rejectReason: varchar("rejectReason", { length: 500 }),
    reviewedBy: int("reviewedBy").references(() => users.id),
    reviewedAt: timestamp("reviewedAt"),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userStatusIndex: index("identity_verifications_user_status_idx").on(table.userId, table.status),
  }),
);

export const engineerVerifications = mysqlTable("engineer_verifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    realName: varchar("realName", { length: 64 }).notNull(),
    professionalTitle: varchar("professionalTitle", { length: 128 }).notNull(),
    primaryCategory: varchar("primaryCategory", { length: 64 }).notNull(),
    yearsOfExperience: int("yearsOfExperience").default(0).notNull(),
    introduction: text("introduction"),
    skills: json("skills").$type<string[]>(),
    status: mysqlEnum("status", verificationStatuses).default("submitted").notNull(),
    rejectReason: varchar("rejectReason", { length: 500 }),
    reviewedBy: int("reviewedBy").references(() => users.id),
    reviewedAt: timestamp("reviewedAt"),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userStatusIndex: index("engineer_verifications_user_status_idx").on(table.userId, table.status),
  }),
);

export const merchantVerifications = mysqlTable("merchant_verifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    merchantName: varchar("merchantName", { length: 128 }).notNull(),
    registrationNoDigest: varchar("registrationNoDigest", { length: 64 }),
    registrationNoLast4: varchar("registrationNoLast4", { length: 4 }),
    categories: json("categories").$type<string[]>(),
    description: text("description"),
    addressText: varchar("addressText", { length: 255 }),
    status: mysqlEnum("status", verificationStatuses).default("submitted").notNull(),
    rejectReason: varchar("rejectReason", { length: 500 }),
    reviewedBy: int("reviewedBy").references(() => users.id),
    reviewedAt: timestamp("reviewedAt"),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userStatusIndex: index("merchant_verifications_user_status_idx").on(table.userId, table.status),
  }),
);

export const verificationDocuments = mysqlTable("verification_documents",
  {
    id: int("id").autoincrement().primaryKey(),
    verificationType: mysqlEnum("verificationType", ["identity", "engineer", "merchant"]).notNull(),
    verificationId: int("verificationId").notNull(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    documentType: varchar("documentType", { length: 64 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 500 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }),
    sizeBytes: int("sizeBytes").notNull(),
    status: mysqlEnum("status", ["available", "superseded", "disabled"]).default("available").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    verificationIndex: index("verification_documents_verification_idx").on(table.verificationType, table.verificationId),
    ownerIndex: index("verification_documents_owner_idx").on(table.ownerId),
  }),
);

export const verificationActions = mysqlTable("verification_actions",
  {
    id: int("id").autoincrement().primaryKey(),
    verificationType: mysqlEnum("verificationType", ["identity", "engineer", "merchant"]).notNull(),
    verificationId: int("verificationId").notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    action: mysqlEnum("action", ["submit", "resubmit", "start_review", "approve", "request_info", "reject", "revoke"]).notNull(),
    fromStatus: varchar("fromStatus", { length: 32 }),
    toStatus: varchar("toStatus", { length: 32 }).notNull(),
    reason: varchar("reason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    verificationIndex: index("verification_actions_verification_idx").on(table.verificationType, table.verificationId, table.createdAt),
  }),
);

// ============ V3.1 投诉裁定与审计 ============

export const complaintBusinessSnapshots = mysqlTable("complaint_business_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    complaintId: int("complaintId")
      .notNull()
      .references(() => complaints.id),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    projectPreviousStatus: varchar("projectPreviousStatus", {
      length: 32,
    }).notNull(),
    milestoneId: int("milestoneId").references(() => milestones.id),
    milestonePreviousStatus: varchar("milestonePreviousStatus", { length: 32 }),
    escrowStates: json("escrowStates").$type<{ id: number; status: string }[]>().notNull(),
    settlementStates: json("settlementStates").$type<{ id: number; status: string }[]>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    complaintUnique: uniqueIndex("complaint_business_snapshots_complaint_unique").on(table.complaintId),
    projectIndex: index("complaint_business_snapshots_project_idx").on(table.projectId),
  }),
);

/** A unique project lock is held only while a complaint is active. */
export const complaintActiveLocks = mysqlTable("complaint_active_locks",
  {
    id: int("id").autoincrement().primaryKey(),
    complaintId: int("complaintId")
      .notNull()
      .references(() => complaints.id),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    milestoneId: int("milestoneId").references(() => milestones.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    complaintUnique: uniqueIndex("complaint_active_locks_complaint_unique").on(table.complaintId),
    projectUnique: uniqueIndex("complaint_active_locks_project_unique").on(table.projectId),
    milestoneUnique: uniqueIndex("complaint_active_locks_milestone_unique").on(table.milestoneId),
  }),
);

export const complaintActions = mysqlTable("complaint_actions",
  {
    id: int("id").autoincrement().primaryKey(),
    complaintId: int("complaintId")
      .notNull()
      .references(() => complaints.id),
    actorId: int("actorId").references(() => users.id),
    actorType: mysqlEnum("actorType", ["user", "admin", "system"]).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    detail: text("detail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    complaintIndex: index("complaint_actions_complaint_idx").on(table.complaintId, table.createdAt),
  }),
);

export const complaintDecisions = mysqlTable("complaint_decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    complaintId: int("complaintId")
      .notNull()
      .references(() => complaints.id),
    decisionNo: varchar("decisionNo", { length: 40 }).notNull(),
    result: mysqlEnum("result", ["dismiss", "continue_performance", "redeliver", "full_refund", "partial_refund", "release_all", "partial_release"]).notNull(),
    reason: text("reason").notNull(),
    refundAmount: decimal("refundAmount", { precision: 14, scale: 2 }),
    releaseAmount: decimal("releaseAmount", { precision: 14, scale: 2 }),
    decidedBy: int("decidedBy")
      .notNull()
      .references(() => users.id),
    decidedAt: timestamp("decidedAt").defaultNow().notNull(),
  },
  (table) => ({
    complaintUnique: uniqueIndex("complaint_decisions_complaint_unique").on(table.complaintId),
    decisionNoUnique: uniqueIndex("complaint_decisions_no_unique").on(table.decisionNo),
  }),
);

export const complaintStatusLogs = mysqlTable("complaint_status_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    complaintId: int("complaintId")
      .notNull()
      .references(() => complaints.id),
    fromStatus: varchar("fromStatus", { length: 32 }),
    toStatus: varchar("toStatus", { length: 32 }).notNull(),
    actorId: int("actorId").references(() => users.id),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    complaintIndex: index("complaint_status_logs_complaint_idx").on(table.complaintId, table.createdAt),
  }),
);

export const complaintFundActions = mysqlTable("complaint_fund_actions",
  {
    id: int("id").autoincrement().primaryKey(),
    complaintId: int("complaintId")
      .notNull()
      .references(() => complaints.id),
    escrowId: int("escrowId").references(() => escrowRecords.id),
    settlementId: int("settlementId").references(() => settlements.id),
    refundId: int("refundId").references(() => refunds.id),
    releaseId: int("releaseId").references(() => escrowReleases.id),
    action: mysqlEnum("action", ["freeze", "unfreeze", "refund", "partial_refund", "release", "partial_release"]).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }),
    status: mysqlEnum("status", ["pending", "success", "failed"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    complaintIndex: index("complaint_fund_actions_complaint_idx").on(table.complaintId),
  }),
);

export const complaintCreditActions = mysqlTable("complaint_credit_actions",
  {
    id: int("id").autoincrement().primaryKey(),
    complaintId: int("complaintId")
      .notNull()
      .references(() => complaints.id),
    targetUserId: int("targetUserId")
      .notNull()
      .references(() => users.id),
    action: mysqlEnum("action", ["warning", "credit_deduction", "restrict_orders", "suspend_account"]).notNull(),
    scoreChange: int("scoreChange").default(0).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    status: mysqlEnum("status", ["pending", "applied", "reverted"]).default("applied").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    complaintIndex: index("complaint_credit_actions_complaint_idx").on(table.complaintId),
  }),
);

export const auditLogs = mysqlTable("audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actorId").references(() => users.id),
    actorRole: varchar("actorRole", { length: 32 }).notNull(),
    action: varchar("action", { length: 96 }).notNull(),
    resourceType: varchar("resourceType", { length: 64 }).notNull(),
    resourceId: varchar("resourceId", { length: 64 }),
    result: mysqlEnum("result", ["success", "denied", "failed"]).default("success").notNull(),
    riskLevel: mysqlEnum("riskLevel", ["normal", "sensitive", "high"]).default("normal").notNull(),
    detail: json("detail").$type<Record<string, unknown>>(),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: varchar("userAgent", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    actorIndex: index("audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
    resourceIndex: index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
    actionIndex: index("audit_logs_action_created_idx").on(table.action, table.createdAt),
  }),
);
export type AuditLog = typeof auditLogs.$inferSelect;

// ============ V3.3-B1 idea collaboration ============

export const ideas = mysqlTable("ideas",
  {
    id: int("id").autoincrement().primaryKey(),
    creatorAccountId: int("creatorAccountId").notNull().references(() => users.id),
    creatorIdentityId: int("creatorIdentityId").notNull().references(() => businessIdentities.id),
    title: varchar("title", { length: 160 }).notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    description: text("description").notNull(),
    categoryCode: varchar("categoryCode", { length: 64 }).notNull(),
    tags: json("tags").$type<string[]>().notNull(),
    visibility: mysqlEnum("visibility", ["public", "private", "nda"]).default("public").notNull(),
    status: mysqlEnum("status", ["draft", "published", "collaborating", "converted", "archived"]).default("draft").notNull(),
    coverFileId: int("coverFileId").references(() => storedFiles.id),
    authorizationVersion: int("authorizationVersion").default(1).notNull(),
    publishedAt: timestamp("publishedAt"),
    convertedProjectId: int("convertedProjectId").references(() => projects.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    convertedProjectUnique: uniqueIndex("ideas_converted_project_uq").on(table.convertedProjectId),
    creatorStatusIndex: index("ideas_creator_status_idx").on(table.creatorAccountId, table.status, table.deletedAt),
    publicFeedIndex: index("ideas_public_feed_idx").on(table.visibility, table.status, table.publishedAt),
  }),
);
export type Idea = typeof ideas.$inferSelect;

export const ideaAttachments = mysqlTable("idea_attachments",
  {
    id: int("id").autoincrement().primaryKey(),
    ideaId: int("ideaId").notNull().references(() => ideas.id),
    fileId: int("fileId").notNull().references(() => storedFiles.id),
    attachmentType: mysqlEnum("attachmentType", ["cover", "reference", "design", "other"]).default("other").notNull(),
    confidentialityLevel: mysqlEnum("confidentialityLevel", ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"]).default("INTERNAL").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    uploadedBy: int("uploadedBy").notNull().references(() => users.id),
    accessPolicyVersion: int("accessPolicyVersion").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    disabledAt: timestamp("disabledAt"),
  },
  (table) => ({
    ideaFileUnique: uniqueIndex("idea_attachments_idea_file_uq").on(table.ideaId, table.fileId),
    ideaStateIndex: index("idea_attachments_idea_state_idx").on(table.ideaId, table.disabledAt, table.sortOrder),
  }),
);
export type IdeaAttachment = typeof ideaAttachments.$inferSelect;

export const ideaCollaborationInvitations = mysqlTable("idea_collaboration_invitations",
  {
    id: int("id").autoincrement().primaryKey(),
    ideaId: int("ideaId").notNull().references(() => ideas.id),
    inviterAccountId: int("inviterAccountId").notNull().references(() => users.id),
    invitedAccountId: int("invitedAccountId").notNull().references(() => users.id),
    invitedIdentityId: int("invitedIdentityId").notNull().references(() => businessIdentities.id),
    requestedRole: mysqlEnum("requestedRole", ["designer", "engineer", "viewer"]).notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "declined", "revoked", "expired"]).default("pending").notNull(),
    activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
    message: varchar("message", { length: 1000 }),
    ndaRequired: boolean("ndaRequired").default(false).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    requestUnique: uniqueIndex("idea_invitations_request_uq").on(table.requestId),
    activeDedupeUnique: uniqueIndex("idea_invitations_active_dedupe_uq").on(table.activeDedupeKey),
    recipientStatusIndex: index("idea_invitations_recipient_status_idx").on(table.invitedAccountId, table.status, table.expiresAt),
    ideaStatusIndex: index("idea_invitations_idea_status_idx").on(table.ideaId, table.status),
  }),
);
export type IdeaCollaborationInvitation = typeof ideaCollaborationInvitations.$inferSelect;

export const ideaNdaAcceptances = mysqlTable("idea_nda_acceptances",
  {
    id: int("id").autoincrement().primaryKey(),
    ideaId: int("ideaId").notNull().references(() => ideas.id),
    accountId: int("accountId").notNull().references(() => users.id),
    identityId: int("identityId").notNull().references(() => businessIdentities.id),
    ndaVersion: varchar("ndaVersion", { length: 64 }).notNull(),
    acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
    requestId: varchar("requestId", { length: 64 }).notNull(),
  },
  (table) => ({
    ideaAccountIdentityUnique: uniqueIndex("idea_nda_idea_account_identity_uq").on(table.ideaId, table.accountId, table.identityId),
    requestUnique: uniqueIndex("idea_nda_request_uq").on(table.requestId),
    accountStateIndex: index("idea_nda_account_state_idx").on(table.accountId, table.revokedAt),
  }),
);
export type IdeaNdaAcceptance = typeof ideaNdaAcceptances.$inferSelect;


// ============ V4 高可信产品全生命周期核心 ============

/** 产品型号：承载可复用的产品定义，不替代既有物品实例。 */
export const productModels = mysqlTable("product_models",
  {
    id: int("id").autoincrement().primaryKey(),
    publicCode: varchar("publicCode", { length: 32 }).notNull(),
    ownerAccountId: int("ownerAccountId").notNull().references(() => users.id),
    ownerOrganizationId: int("ownerOrganizationId").references(() => organizations.id),
    name: varchar("name", { length: 160 }).notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    description: text("description"),
    categoryCode: varchar("categoryCode", { length: 64 }).notNull(),
    brandName: varchar("brandName", { length: 128 }),
    modelCode: varchar("modelCode", { length: 128 }),
    versionLabel: varchar("versionLabel", { length: 64 }).default("v1").notNull(),
    specifications: json("specifications").$type<Record<string, unknown>>().notNull(),
    visibility: mysqlEnum("visibility", ["public", "owner_only", "restricted"]).default("owner_only").notNull(),
    status: mysqlEnum("status", ["draft", "active", "retired", "archived"]).default("draft").notNull(),
    authorizationVersion: int("authorizationVersion").default(1).notNull(),
    createdRequestId: varchar("createdRequestId", { length: 64 }).notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    publishedAt: timestamp("publishedAt"),
    retiredAt: timestamp("retiredAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    publicCodeUnique: uniqueIndex("product_models_public_code_uq").on(table.publicCode),
    createdRequestUnique: uniqueIndex("product_models_created_request_uq").on(table.createdRequestId),
    lastRequestUnique: uniqueIndex("product_models_last_request_uq").on(table.lastRequestId),
    ownerStatusIndex: index("product_models_owner_status_idx").on(table.ownerAccountId, table.status, table.deletedAt),
    organizationStatusIndex: index("product_models_organization_status_idx").on(table.ownerOrganizationId, table.status, table.deletedAt),
    publicFeedIndex: index("product_models_public_feed_idx").on(table.visibility, table.status, table.publishedAt),
  }),
);
export type ProductModel = typeof productModels.$inferSelect;
export type InsertProductModel = typeof productModels.$inferInsert;

/** 产品来源关系：以多态来源连接需求、创意、项目或历史物品，避免向上游表重复加字段。 */
export const productSourceLinks = mysqlTable("product_source_links",
  {
    id: int("id").autoincrement().primaryKey(),
    productModelId: int("productModelId").notNull().references(() => productModels.id),
    sourceType: mysqlEnum("sourceType", ["need", "idea", "project", "legacy_item", "funding_campaign"]).notNull(),
    sourceId: int("sourceId").notNull(),
    relationType: mysqlEnum("relationType", ["derived_from", "validated_by", "produced_by", "migrated_from"]).default("derived_from").notNull(),
    createdByAccountId: int("createdByAccountId").notNull().references(() => users.id),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    requestUnique: uniqueIndex("product_source_links_request_uq").on(table.requestId),
    relationUnique: uniqueIndex("product_source_links_relation_uq").on(table.productModelId, table.sourceType, table.sourceId, table.relationType),
    sourceIndex: index("product_source_links_source_idx").on(table.sourceType, table.sourceId),
  }),
);
export type ProductSourceLink = typeof productSourceLinks.$inferSelect;

/** 产品单元：为具体实物建立稳定身份，并可选关联既有 items 资产档案。 */
export const productUnits = mysqlTable("product_units",
  {
    id: int("id").autoincrement().primaryKey(),
    productModelId: int("productModelId").notNull().references(() => productModels.id),
    linkedItemId: int("linkedItemId").references(() => items.id),
    currentOwnerAccountId: int("currentOwnerAccountId").references(() => users.id),
    publicCode: varchar("publicCode", { length: 40 }).notNull(),
    serialNumber: varchar("serialNumber", { length: 128 }),
    batchCode: varchar("batchCode", { length: 96 }),
    status: mysqlEnum("status", ["registered", "manufactured", "in_use", "idle", "listed", "under_service", "transferred", "recycling", "recycled", "retired"]).default("registered").notNull(),
    trustLevel: mysqlEnum("trustLevel", ["self_declared", "verified", "certified"]).default("self_declared").notNull(),
    passportVisibility: mysqlEnum("passportVisibility", ["public", "owner_only", "restricted"]).default("owner_only").notNull(),
    authorizationVersion: int("authorizationVersion").default(1).notNull(),
    createdRequestId: varchar("createdRequestId", { length: 64 }).notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    manufacturedAt: timestamp("manufacturedAt"),
    activatedAt: timestamp("activatedAt"),
    retiredAt: timestamp("retiredAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    publicCodeUnique: uniqueIndex("product_units_public_code_uq").on(table.publicCode),
    createdRequestUnique: uniqueIndex("product_units_created_request_uq").on(table.createdRequestId),
    lastRequestUnique: uniqueIndex("product_units_last_request_uq").on(table.lastRequestId),
    linkedItemUnique: uniqueIndex("product_units_linked_item_uq").on(table.linkedItemId),
    modelSerialUnique: uniqueIndex("product_units_model_serial_uq").on(table.productModelId, table.serialNumber),
    modelStatusIndex: index("product_units_model_status_idx").on(table.productModelId, table.status),
    ownerStatusIndex: index("product_units_owner_status_idx").on(table.currentOwnerAccountId, table.status),
  }),
);
export type ProductUnit = typeof productUnits.$inferSelect;
export type InsertProductUnit = typeof productUnits.$inferInsert;

/** 产品护照事件：仅追加写入，以序号、请求幂等键和哈希链保留可验证历史。 */
export const productPassportEvents = mysqlTable("product_passport_events",
  {
    id: int("id").autoincrement().primaryKey(),
    productUnitId: int("productUnitId").notNull().references(() => productUnits.id),
    sequenceNumber: int("sequenceNumber").notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    actorAccountId: int("actorAccountId").references(() => users.id),
    actorOrganizationId: int("actorOrganizationId").references(() => organizations.id),
    fromStatus: varchar("fromStatus", { length: 32 }),
    toStatus: varchar("toStatus", { length: 32 }),
    visibility: mysqlEnum("visibility", ["public", "owner", "internal"]).default("owner").notNull(),
    sourceType: varchar("sourceType", { length: 64 }),
    sourceId: varchar("sourceId", { length: 64 }),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    detail: json("detail").$type<Record<string, unknown>>().notNull(),
    previousEventHash: char("previousEventHash", { length: 64 }),
    eventHash: char("eventHash", { length: 64 }).notNull(),
    occurredAt: timestamp("occurredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    requestUnique: uniqueIndex("product_passport_events_request_uq").on(table.requestId),
    unitSequenceUnique: uniqueIndex("product_passport_events_unit_sequence_uq").on(table.productUnitId, table.sequenceNumber),
    unitTimelineIndex: index("product_passport_events_unit_timeline_idx").on(table.productUnitId, table.occurredAt),
    sourceIndex: index("product_passport_events_source_idx").on(table.sourceType, table.sourceId),
  }),
);
export type ProductPassportEvent = typeof productPassportEvents.$inferSelect;

// ============ V4 新品筹措与意向验证 ============

/** 新品筹措活动：验证真实需求与首批支持意向，不代表订单、支付、股权或收益承诺。 */
export const fundingCampaigns = mysqlTable("funding_campaigns",
  {
    id: int("id").autoincrement().primaryKey(),
    publicCode: varchar("publicCode", { length: 32 }).notNull(),
    ownerAccountId: int("ownerAccountId").notNull().references(() => users.id),
    sourceType: mysqlEnum("sourceType", ["need", "idea", "project", "product_model"]).notNull(),
    sourceId: int("sourceId").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    description: text("description").notNull(),
    categoryCode: varchar("categoryCode", { length: 64 }).notNull(),
    coverUrl: varchar("coverUrl", { length: 1000 }),
    goalQuantity: int("goalQuantity").notNull(),
    pledgedQuantity: int("pledgedQuantity").default(0).notNull(),
    activePledgeCount: int("activePledgeCount").default(0).notNull(),
    evidence: json("evidence").$type<Array<Record<string, unknown>>>().notNull(),
    verificationSummary: text("verificationSummary"),
    riskSummary: text("riskSummary").notNull(),
    visibility: mysqlEnum("visibility", ["public", "owner_only"]).default("owner_only").notNull(),
    status: mysqlEnum("status", ["draft", "reviewing", "active", "succeeded", "failed", "cancelled", "closed"]).default("draft").notNull(),
    authorizationVersion: int("authorizationVersion").default(1).notNull(),
    activeSourceDedupeKey: varchar("activeSourceDedupeKey", { length: 191 }),
    createdRequestId: varchar("createdRequestId", { length: 64 }).notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    startsAt: timestamp("startsAt"),
    endsAt: timestamp("endsAt"),
    publishedAt: timestamp("publishedAt"),
    closedAt: timestamp("closedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    publicCodeUnique: uniqueIndex("funding_campaigns_public_code_uq").on(table.publicCode),
    activeSourceUnique: uniqueIndex("funding_campaigns_active_source_uq").on(table.activeSourceDedupeKey),
    createdRequestUnique: uniqueIndex("funding_campaigns_created_request_uq").on(table.createdRequestId),
    lastRequestUnique: uniqueIndex("funding_campaigns_last_request_uq").on(table.lastRequestId),
    ownerStatusIndex: index("funding_campaigns_owner_status_idx").on(table.ownerAccountId, table.status, table.deletedAt),
    publicFeedIndex: index("funding_campaigns_public_feed_idx").on(table.visibility, table.status, table.publishedAt),
    sourceIndex: index("funding_campaigns_source_idx").on(table.sourceType, table.sourceId),
    deadlineIndex: index("funding_campaigns_deadline_idx").on(table.status, table.endsAt),
  }),
);
export type FundingCampaign = typeof fundingCampaigns.$inferSelect;
export type InsertFundingCampaign = typeof fundingCampaigns.$inferInsert;

/** 新品支持意向：只记录数量意向，不创建订单、支付、库存锁定或投资关系。 */
export const fundingPledges = mysqlTable("funding_pledges",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull().references(() => fundingCampaigns.id),
    supporterAccountId: int("supporterAccountId").notNull().references(() => users.id),
    quantity: int("quantity").default(1).notNull(),
    note: text("note"),
    cityName: varchar("cityName", { length: 100 }),
    status: mysqlEnum("status", ["active", "withdrawn"]).default("active").notNull(),
    authorizationVersion: int("authorizationVersion").default(1).notNull(),
    activeDedupeKey: varchar("activeDedupeKey", { length: 191 }),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    withdrawnAt: timestamp("withdrawnAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    requestUnique: uniqueIndex("funding_pledges_request_uq").on(table.requestId),
    lastRequestUnique: uniqueIndex("funding_pledges_last_request_uq").on(table.lastRequestId),
    activeDedupeUnique: uniqueIndex("funding_pledges_active_dedupe_uq").on(table.activeDedupeKey),
    supporterStatusIndex: index("funding_pledges_supporter_status_idx").on(table.supporterAccountId, table.status),
    campaignStatusIndex: index("funding_pledges_campaign_status_idx").on(table.campaignId, table.status, table.createdAt),
  }),
);
export type FundingPledge = typeof fundingPledges.$inferSelect;
export type InsertFundingPledge = typeof fundingPledges.$inferInsert;

/** 筹措事件：仅追加保存活动状态、支持与撤回历史，禁止静默覆盖关键事实。 */
export const fundingCampaignEvents = mysqlTable("funding_campaign_events",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull().references(() => fundingCampaigns.id),
    sequenceNumber: int("sequenceNumber").notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    actorAccountId: int("actorAccountId").notNull().references(() => users.id),
    fromStatus: varchar("fromStatus", { length: 32 }),
    toStatus: varchar("toStatus", { length: 32 }),
    pledgeId: int("pledgeId").references(() => fundingPledges.id),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    detail: json("detail").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    requestUnique: uniqueIndex("funding_campaign_events_request_uq").on(table.requestId),
    campaignSequenceUnique: uniqueIndex("funding_campaign_events_campaign_sequence_uq").on(table.campaignId, table.sequenceNumber),
    timelineIndex: index("funding_campaign_events_timeline_idx").on(table.campaignId, table.occurredAt),
    pledgeIndex: index("funding_campaign_events_pledge_idx").on(table.pledgeId),
  }),
);
export type FundingCampaignEvent = typeof fundingCampaignEvents.$inferSelect;

// ============ V4 统一内容创作、发现与可信业务关联 ============

export const contentPosts = mysqlTable("content_posts",
  {
    id: int("id").autoincrement().primaryKey(),
    publicCode: varchar("publicCode", { length: 36 }).notNull(),
    authorAccountId: int("authorAccountId").notNull().references(() => users.id),
    authorIdentityId: int("authorIdentityId").references(() => businessIdentities.id),
    organizationId: int("organizationId").references(() => organizations.id),
    contentType: mysqlEnum("contentType", ["post", "video", "article", "question", "product_review", "tutorial", "idea_progress", "funding_update", "repair_case"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    summary: varchar("summary", { length: 500 }),
    body: text("body").notNull(),
    locationLabel: varchar("locationLabel", { length: 100 }),
    visibility: mysqlEnum("visibility", ["public", "followers", "private"]).default("private").notNull(),
    sourceType: mysqlEnum("sourceType", ["personal_experience", "organization_official", "service_case", "platform_verified", "external_public", "ai_assisted", "unverified_claim"]).default("personal_experience").notNull(),
    sourceStatement: varchar("sourceStatement", { length: 500 }),
    aiAssisted: boolean("aiAssisted").default(false).notNull(),
    aiConfirmedAt: timestamp("aiConfirmedAt"),
    allowComments: boolean("allowComments").default(true).notNull(),
    status: mysqlEnum("status", ["draft", "ready_to_publish", "reviewing", "published", "rejected", "recommendation_limited", "unpublished", "author_deleted", "platform_banned"]).default("draft").notNull(),
    moderationReason: varchar("moderationReason", { length: 500 }),
    authorizationVersion: int("authorizationVersion").default(1).notNull(),
    createdRequestId: varchar("createdRequestId", { length: 64 }).notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    publishedAt: timestamp("publishedAt"),
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    publicCodeUnique: uniqueIndex("content_posts_public_code_uq").on(table.publicCode),
    createdRequestUnique: uniqueIndex("content_posts_created_request_uq").on(table.createdRequestId),
    lastRequestUnique: uniqueIndex("content_posts_last_request_uq").on(table.lastRequestId),
    authorStatusIndex: index("content_posts_author_status_idx").on(table.authorAccountId, table.status, table.updatedAt),
    discoveryIndex: index("content_posts_discovery_idx").on(table.status, table.visibility, table.publishedAt),
    typeDiscoveryIndex: index("content_posts_type_discovery_idx").on(table.contentType, table.status, table.publishedAt),
    locationIndex: index("content_posts_location_idx").on(table.locationLabel, table.status, table.publishedAt),
  }),
);
export type ContentPost = typeof contentPosts.$inferSelect;
export type InsertContentPost = typeof contentPosts.$inferInsert;

export const contentMedia = mysqlTable("content_media",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull().references(() => contentPosts.id),
    fileId: int("fileId").notNull().references(() => storedFiles.id),
    mediaType: mysqlEnum("mediaType", ["image", "video"]).notNull(),
    purpose: mysqlEnum("purpose", ["cover", "body"]).default("body").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    status: mysqlEnum("status", ["active", "removed"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    postFileUnique: uniqueIndex("content_media_post_file_uq").on(table.postId, table.fileId),
    postOrderIndex: index("content_media_post_order_idx").on(table.postId, table.status, table.sortOrder),
  }),
);

export const contentRelations = mysqlTable("content_relations",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull().references(() => contentPosts.id),
    relationType: mysqlEnum("relationType", ["demand", "idea", "funding_project", "product", "product_unit", "listing", "repair", "service", "donation", "recycling", "account", "organization"]).notNull(),
    relationId: int("relationId").notNull(),
    relationLabel: varchar("relationLabel", { length: 180 }),
    createdByAccountId: int("createdByAccountId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    relationUnique: uniqueIndex("content_relations_post_relation_uq").on(table.postId, table.relationType, table.relationId),
    targetIndex: index("content_relations_target_idx").on(table.relationType, table.relationId),
  }),
);

export const contentTags = mysqlTable("content_tags",
  {
    id: int("id").autoincrement().primaryKey(),
    normalizedName: varchar("normalizedName", { length: 64 }).notNull(),
    displayName: varchar("displayName", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["active", "disabled"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ nameUnique: uniqueIndex("content_tags_normalized_name_uq").on(table.normalizedName) }),
);

export const contentTagLinks = mysqlTable("content_tag_links",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull().references(() => contentPosts.id),
    tagId: int("tagId").notNull().references(() => contentTags.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    linkUnique: uniqueIndex("content_tag_links_post_tag_uq").on(table.postId, table.tagId),
    tagIndex: index("content_tag_links_tag_idx").on(table.tagId, table.postId),
  }),
);

export const contentInteractions = mysqlTable("content_interactions",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull().references(() => contentPosts.id),
    accountId: int("accountId").notNull().references(() => users.id),
    interactionType: mysqlEnum("interactionType", ["like", "favorite", "share", "view", "product_click", "listing_click", "idea_click"]).notNull(),
    active: boolean("active").default(true).notNull(),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    accountInteractionUnique: uniqueIndex("content_interactions_account_type_uq").on(table.postId, table.accountId, table.interactionType),
    requestUnique: uniqueIndex("content_interactions_request_uq").on(table.requestId),
    postTypeIndex: index("content_interactions_post_type_idx").on(table.postId, table.interactionType, table.active),
  }),
);

export const contentComments = mysqlTable("content_comments",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull().references(() => contentPosts.id),
    authorAccountId: int("authorAccountId").notNull().references(() => users.id),
    parentCommentId: int("parentCommentId"),
    body: text("body").notNull(),
    status: mysqlEnum("status", ["published", "author_deleted", "platform_removed"]).default("published").notNull(),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    requestUnique: uniqueIndex("content_comments_request_uq").on(table.requestId),
    postTimeIndex: index("content_comments_post_time_idx").on(table.postId, table.status, table.createdAt),
  }),
);

export const contentFollows = mysqlTable("content_follows",
  {
    id: int("id").autoincrement().primaryKey(),
    followerAccountId: int("followerAccountId").notNull().references(() => users.id),
    followedAccountId: int("followedAccountId").notNull().references(() => users.id),
    active: boolean("active").default(true).notNull(),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    followUnique: uniqueIndex("content_follows_pair_uq").on(table.followerAccountId, table.followedAccountId),
    requestUnique: uniqueIndex("content_follows_request_uq").on(table.requestId),
    followerIndex: index("content_follows_follower_idx").on(table.followerAccountId, table.active),
    followedIndex: index("content_follows_followed_idx").on(table.followedAccountId, table.active),
  }),
);

export const contentReports = mysqlTable("content_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull().references(() => contentPosts.id),
    reporterAccountId: int("reporterAccountId").notNull().references(() => users.id),
    reasonCode: varchar("reasonCode", { length: 64 }).notNull(),
    detail: varchar("detail", { length: 1000 }),
    status: mysqlEnum("status", ["submitted", "reviewing", "resolved", "dismissed"]).default("submitted").notNull(),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
  },
  (table) => ({
    reporterPostUnique: uniqueIndex("content_reports_reporter_post_uq").on(table.postId, table.reporterAccountId),
    requestUnique: uniqueIndex("content_reports_request_uq").on(table.requestId),
    statusIndex: index("content_reports_status_idx").on(table.status, table.createdAt),
  }),
);

export const contentModerationRecords = mysqlTable("content_moderation_records",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull().references(() => contentPosts.id),
    actorAccountId: int("actorAccountId").references(() => users.id),
    moderationType: mysqlEnum("moderationType", ["automated", "manual"]).notNull(),
    decision: mysqlEnum("decision", ["approved", "rejected", "limited", "banned"]).notNull(),
    reasonCode: varchar("reasonCode", { length: 64 }).notNull(),
    detail: json("detail").$type<Record<string, unknown>>().notNull(),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    requestUnique: uniqueIndex("content_moderation_records_request_uq").on(table.requestId),
    postTimeIndex: index("content_moderation_records_post_time_idx").on(table.postId, table.createdAt),
  }),
);

export const contentMetrics = mysqlTable("content_metrics", {
  postId: int("postId").primaryKey().references(() => contentPosts.id),
  viewCount: int("viewCount").default(0).notNull(),
  likeCount: int("likeCount").default(0).notNull(),
  favoriteCount: int("favoriteCount").default(0).notNull(),
  commentCount: int("commentCount").default(0).notNull(),
  shareCount: int("shareCount").default(0).notNull(),
  productClickCount: int("productClickCount").default(0).notNull(),
  listingClickCount: int("listingClickCount").default(0).notNull(),
  ideaClickCount: int("ideaClickCount").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const contentDrafts = mysqlTable("content_drafts",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull().references(() => contentPosts.id),
    versionNo: int("versionNo").notNull(),
    snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
    savedByAccountId: int("savedByAccountId").notNull().references(() => users.id),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    versionUnique: uniqueIndex("content_drafts_post_version_uq").on(table.postId, table.versionNo),
    requestUnique: uniqueIndex("content_drafts_request_uq").on(table.requestId),
  }),
);

export const creatorProfiles = mysqlTable("creator_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull().references(() => users.id),
    displayName: varchar("displayName", { length: 100 }),
    bio: varchar("bio", { length: 500 }),
    verificationLabel: varchar("verificationLabel", { length: 100 }),
    publishedCount: int("publishedCount").default(0).notNull(),
    followerCount: int("followerCount").default(0).notNull(),
    followingCount: int("followingCount").default(0).notNull(),
    totalViewCount: int("totalViewCount").default(0).notNull(),
    totalLikeCount: int("totalLikeCount").default(0).notNull(),
    totalFavoriteCount: int("totalFavoriteCount").default(0).notNull(),
    totalCommentCount: int("totalCommentCount").default(0).notNull(),
    productClickCount: int("productClickCount").default(0).notNull(),
    ideaClickCount: int("ideaClickCount").default(0).notNull(),
    listingClickCount: int("listingClickCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ accountUnique: uniqueIndex("creator_profiles_account_uq").on(table.accountId) }),
);

/** V4 runnable-commerce extensions reuse listings, orders and sandbox payments. */
export const listingProductLinks = mysqlTable("listing_product_links",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId").notNull().references(() => listings.id),
    productModelId: int("productModelId").notNull().references(() => productModels.id),
    productUnitId: int("productUnitId").references(() => productUnits.id),
    linkedByAccountId: int("linkedByAccountId").notNull().references(() => users.id),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    listingUnique: uniqueIndex("listing_product_links_listing_uq").on(table.listingId),
    requestUnique: uniqueIndex("listing_product_links_request_uq").on(table.requestId),
    productIndex: index("listing_product_links_product_idx").on(table.productModelId, table.listingId),
    unitIndex: index("listing_product_links_unit_idx").on(table.productUnitId, table.listingId),
  }),
);

export const listingSkus = mysqlTable("listing_skus",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId").notNull().references(() => listings.id),
    skuCode: varchar("skuCode", { length: 64 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    attributes: json("attributes").$type<Record<string, string>>().notNull(),
    price: int("price").notNull(),
    stock: int("stock").notNull(),
    status: mysqlEnum("status", ["active", "inactive", "sold_out"]).default("active").notNull(),
    createdRequestId: varchar("createdRequestId", { length: 64 }).notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    listingCodeUnique: uniqueIndex("listing_skus_listing_code_uq").on(table.listingId, table.skuCode),
    createdRequestUnique: uniqueIndex("listing_skus_created_request_uq").on(table.createdRequestId),
    lastRequestUnique: uniqueIndex("listing_skus_last_request_uq").on(table.lastRequestId),
    listingStatusIndex: index("listing_skus_listing_status_idx").on(table.listingId, table.status),
  }),
);

export const userAddresses = mysqlTable("user_addresses",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull().references(() => users.id),
    recipientName: varchar("recipientName", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    province: varchar("province", { length: 64 }).notNull(),
    city: varchar("city", { length: 64 }).notNull(),
    district: varchar("district", { length: 64 }).notNull(),
    addressLine: varchar("addressLine", { length: 255 }).notNull(),
    postalCode: varchar("postalCode", { length: 16 }),
    isDefault: boolean("isDefault").default(false).notNull(),
    status: mysqlEnum("status", ["active", "deleted"]).default("active").notNull(),
    createdRequestId: varchar("createdRequestId", { length: 64 }).notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    createdRequestUnique: uniqueIndex("user_addresses_created_request_uq").on(table.createdRequestId),
    lastRequestUnique: uniqueIndex("user_addresses_last_request_uq").on(table.lastRequestId),
    accountStatusIndex: index("user_addresses_account_status_idx").on(table.accountId, table.status, table.isDefault),
  }),
);

export const shoppingCarts = mysqlTable("shopping_carts",
  {
    id: int("id").autoincrement().primaryKey(),
    buyerAccountId: int("buyerAccountId").notNull().references(() => users.id),
    status: mysqlEnum("status", ["active", "checked_out", "abandoned"]).default("active").notNull(),
    activeDedupeKey: varchar("activeDedupeKey", { length: 64 }),
    checkedOutAt: timestamp("checkedOutAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    activeDedupeUnique: uniqueIndex("shopping_carts_active_dedupe_uq").on(table.activeDedupeKey),
    buyerStatusIndex: index("shopping_carts_buyer_status_idx").on(table.buyerAccountId, table.status),
  }),
);

export const shoppingCartItems = mysqlTable("shopping_cart_items",
  {
    id: int("id").autoincrement().primaryKey(),
    cartId: int("cartId").notNull().references(() => shoppingCarts.id),
    skuId: int("skuId").notNull().references(() => listingSkus.id),
    quantity: int("quantity").notNull(),
    lastRequestId: varchar("lastRequestId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    cartSkuUnique: uniqueIndex("shopping_cart_items_cart_sku_uq").on(table.cartId, table.skuId),
    requestUnique: uniqueIndex("shopping_cart_items_request_uq").on(table.lastRequestId),
    cartIndex: index("shopping_cart_items_cart_idx").on(table.cartId, table.id),
  }),
);

export const commerceCheckoutRequests = mysqlTable("commerce_checkout_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    buyerAccountId: int("buyerAccountId").notNull().references(() => users.id),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    orderId: int("orderId").notNull().references(() => orders.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    requestUnique: uniqueIndex("commerce_checkout_requests_request_uq").on(table.requestId),
    buyerOrderIndex: index("commerce_checkout_requests_buyer_order_idx").on(table.buyerAccountId, table.orderId),
  }),
);

export const orderLineItems = mysqlTable("order_line_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull().references(() => orders.id),
    listingId: int("listingId").notNull().references(() => listings.id),
    skuId: int("skuId").notNull().references(() => listingSkus.id),
    skuCode: varchar("skuCode", { length: 64 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    attributes: json("attributes").$type<Record<string, string>>().notNull(),
    quantity: int("quantity").notNull(),
    unitPrice: int("unitPrice").notNull(),
    lineAmount: int("lineAmount").notNull(),
    productModelId: int("productModelId").references(() => productModels.id),
    productUnitId: int("productUnitId").references(() => productUnits.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    orderSkuUnique: uniqueIndex("order_line_items_order_sku_uq").on(table.orderId, table.skuId),
    orderIndex: index("order_line_items_order_idx").on(table.orderId, table.id),
  }),
);

export const orderShippingSnapshots = mysqlTable("order_shipping_snapshots",
  {
    orderId: int("orderId").primaryKey().references(() => orders.id),
    sourceAddressId: int("sourceAddressId").references(() => userAddresses.id),
    recipientName: varchar("recipientName", { length: 100 }).notNull(),
    phoneMasked: varchar("phoneMasked", { length: 32 }).notNull(),
    phoneEncrypted: varbinary("phoneEncrypted", { length: 512 }).notNull(),
    province: varchar("province", { length: 64 }).notNull(),
    city: varchar("city", { length: 64 }).notNull(),
    district: varchar("district", { length: 64 }).notNull(),
    addressLine: varchar("addressLine", { length: 255 }).notNull(),
    postalCode: varchar("postalCode", { length: 16 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
);
