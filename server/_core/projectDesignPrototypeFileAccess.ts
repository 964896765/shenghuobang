import crypto from "node:crypto";
import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { requireDb } from "../db";
import { authorizeOrThrow } from "../authorization";
import { storageRead } from "../storage";
import { sdk } from "./sdk";
import {
  designVersionFiles,
  designVersions,
  fileAccessLogs,
  milestoneDeliverableSubmissionFiles,
  milestoneDeliverableSubmissions,
  projectFiles,
  projects,
  storedFiles,
} from "../../drizzle/schema";
import {
  createProjectDeliveryFileAccessToken,
  parseProjectDeliveryFileAccessToken,
} from "../storage/project-delivery-file-access-token";

const DESIGN_FILE_PATH = "/api/design-version-files/:designVersionFileId";
const DELIVERABLE_FILE_PATH = "/api/prototype-deliverable-files/:submissionFileId";

export function createDesignVersionFileAccessPath(designVersionFileId: number, token: string) {
  return `/api/design-version-files/${designVersionFileId}?accessToken=${encodeURIComponent(token)}`;
}

export function createPrototypeDeliverableFileAccessPath(submissionFileId: number, token: string) {
  return `/api/prototype-deliverable-files/${submissionFileId}?accessToken=${encodeURIComponent(token)}`;
}

export function registerProjectDesignPrototypeFileAccess(app: Express) {
  app.get(DESIGN_FILE_PATH, async (req, res) => {
    const accessToken = typeof req.query.accessToken === "string" ? req.query.accessToken : "";
    const claims = parseProjectDeliveryFileAccessToken(accessToken);
    if (!claims?.designVersionId) return res.status(401).json({ message: "无效访问凭证" });
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user || user.id !== claims.accountId) return res.status(401).json({ message: "请先登录" });
    const db = await requireDb();
    const [row] = await db.select({
      linkId: designVersionFiles.id,
      linkPolicyVersion: designVersionFiles.accessPolicyVersion,
      linkDisabledAt: designVersionFiles.disabledAt,
      versionId: designVersions.id,
      versionStatus: designVersions.status,
      versionAuthorizationVersion: designVersions.authorizationVersion,
      projectId: projects.id,
      projectAuthorizationVersion: projects.authorizationVersion,
      projectStatus: projects.status,
      projectFileId: projectFiles.id,
      projectFileStatus: projectFiles.status,
      projectFilePolicyVersion: projectFiles.accessPolicyVersion,
      storageKey: projectFiles.storageKey,
      fileId: storedFiles.id,
      fileStatus: storedFiles.status,
      filePolicyVersion: storedFiles.accessPolicyVersion,
      fileName: storedFiles.originalName,
      mimeType: storedFiles.mimeType,
    }).from(designVersionFiles)
      .innerJoin(designVersions, eq(designVersions.id, designVersionFiles.designVersionId))
      .innerJoin(projects, eq(projects.id, designVersions.projectId))
      .innerJoin(projectFiles, eq(projectFiles.id, designVersionFiles.projectFileId))
      .innerJoin(storedFiles, eq(storedFiles.storageKey, projectFiles.storageKey))
      .where(eq(designVersionFiles.id, Number(req.params.designVersionFileId)))
      .limit(1);
    if (!row || row.versionId !== claims.designVersionId || row.projectId !== claims.projectId || row.projectFileId !== claims.projectFileId || row.fileId !== claims.fileId) {
      return res.status(404).json({ message: "文件不存在" });
    }
    if (row.linkDisabledAt || row.versionStatus === "withdrawn" || row.projectFileStatus !== "available" || row.fileStatus !== "available") {
      return res.status(403).json({ message: "文件不可用" });
    }
    if (row.projectAuthorizationVersion !== claims.projectAuthorizationVersion ||
      row.versionAuthorizationVersion !== claims.entityAuthorizationVersion ||
      row.linkPolicyVersion !== claims.entityFileAccessPolicyVersion ||
      row.projectFilePolicyVersion !== claims.projectFileAccessPolicyVersion ||
      row.filePolicyVersion !== claims.storedFileAccessPolicyVersion) {
      return res.status(403).json({ message: "访问凭证已失效" });
    }
    await authorizeOrThrow(user.id, {
      capabilityCode: "project.design_file.download",
      projectId: row.projectId,
      resourceType: "project_file",
      resourceId: String(row.projectFileId),
      expectedResourceVersion: row.projectFilePolicyVersion,
      purpose: "project_design_file_download",
    });
    const object = await storageRead(row.storageKey);
    await db.insert(fileAccessLogs).values({
      fileId: row.fileId,
      userId: user.id,
      action: claims.purpose,
      relatedEntityType: "project",
      relatedEntityId: row.projectId,
      result: "success",
      reason: "design_version_file_access",
    });
    res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${claims.purpose === "preview" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.fileName || "design-file")}`);
    res.send(object);
  });

  app.get(DELIVERABLE_FILE_PATH, async (req, res) => {
    const accessToken = typeof req.query.accessToken === "string" ? req.query.accessToken : "";
    const claims = parseProjectDeliveryFileAccessToken(accessToken);
    if (!claims?.milestoneSubmissionId) return res.status(401).json({ message: "无效访问凭证" });
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user || user.id !== claims.accountId) return res.status(401).json({ message: "请先登录" });
    const db = await requireDb();
    const [row] = await db.select({
      linkId: milestoneDeliverableSubmissionFiles.id,
      linkPolicyVersion: milestoneDeliverableSubmissionFiles.accessPolicyVersion,
      linkDisabledAt: milestoneDeliverableSubmissionFiles.disabledAt,
      submissionId: milestoneDeliverableSubmissions.id,
      submissionStatus: milestoneDeliverableSubmissions.status,
      submissionAuthorizationVersion: milestoneDeliverableSubmissions.authorizationVersion,
      projectId: projects.id,
      projectAuthorizationVersion: projects.authorizationVersion,
      projectStatus: projects.status,
      projectFileId: projectFiles.id,
      projectFileStatus: projectFiles.status,
      projectFilePolicyVersion: projectFiles.accessPolicyVersion,
      storageKey: projectFiles.storageKey,
      fileId: storedFiles.id,
      fileStatus: storedFiles.status,
      filePolicyVersion: storedFiles.accessPolicyVersion,
      fileName: storedFiles.originalName,
      mimeType: storedFiles.mimeType,
    }).from(milestoneDeliverableSubmissionFiles)
      .innerJoin(milestoneDeliverableSubmissions, eq(milestoneDeliverableSubmissions.id, milestoneDeliverableSubmissionFiles.submissionId))
      .innerJoin(projects, eq(projects.id, milestoneDeliverableSubmissions.projectId))
      .innerJoin(projectFiles, eq(projectFiles.id, milestoneDeliverableSubmissionFiles.projectFileId))
      .innerJoin(storedFiles, eq(storedFiles.storageKey, projectFiles.storageKey))
      .where(eq(milestoneDeliverableSubmissionFiles.id, Number(req.params.submissionFileId)))
      .limit(1);
    if (!row || row.submissionId !== claims.milestoneSubmissionId || row.projectId !== claims.projectId || row.projectFileId !== claims.projectFileId || row.fileId !== claims.fileId) {
      return res.status(404).json({ message: "文件不存在" });
    }
    if (row.linkDisabledAt || row.submissionStatus !== "submitted" || row.projectFileStatus !== "available" || row.fileStatus !== "available") {
      return res.status(403).json({ message: "文件不可用" });
    }
    if (row.projectAuthorizationVersion !== claims.projectAuthorizationVersion ||
      row.submissionAuthorizationVersion !== claims.entityAuthorizationVersion ||
      row.linkPolicyVersion !== claims.entityFileAccessPolicyVersion ||
      row.projectFilePolicyVersion !== claims.projectFileAccessPolicyVersion ||
      row.filePolicyVersion !== claims.storedFileAccessPolicyVersion) {
      return res.status(403).json({ message: "访问凭证已失效" });
    }
    await authorizeOrThrow(user.id, {
      capabilityCode: "project.file.download",
      projectId: row.projectId,
      resourceType: "project_file",
      resourceId: String(row.projectFileId),
      expectedResourceVersion: row.projectFilePolicyVersion,
      purpose: "project_prototype_deliverable_download",
    });
    const object = await storageRead(row.storageKey);
    await db.insert(fileAccessLogs).values({
      fileId: row.fileId,
      userId: user.id,
      action: claims.purpose,
      relatedEntityType: "project",
      relatedEntityId: row.projectId,
      result: "success",
      reason: "prototype_deliverable_file_access",
    });
    res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${claims.purpose === "preview" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.fileName || "prototype-deliverable")}`);
    res.send(object);
  });
}

export function buildDesignVersionFileAccessToken(input: {
  accountId: number;
  projectId: number;
  designVersionId: number;
  projectFileId: number;
  fileId: number;
  purpose: "download" | "preview";
  projectAuthorizationVersion: number;
  entityAuthorizationVersion: number;
  entityFileAccessPolicyVersion: number;
  projectFileAccessPolicyVersion: number;
  storedFileAccessPolicyVersion: number;
}) {
  return createProjectDeliveryFileAccessToken({
    ...input,
    expires: Math.floor(Date.now() / 1000) + 300,
    nonce: crypto.randomUUID(),
  });
}

export function buildPrototypeDeliverableFileAccessToken(input: {
  accountId: number;
  projectId: number;
  milestoneSubmissionId: number;
  projectFileId: number;
  fileId: number;
  purpose: "download" | "preview";
  projectAuthorizationVersion: number;
  entityAuthorizationVersion: number;
  entityFileAccessPolicyVersion: number;
  projectFileAccessPolicyVersion: number;
  storedFileAccessPolicyVersion: number;
}) {
  return createProjectDeliveryFileAccessToken({
    ...input,
    expires: Math.floor(Date.now() / 1000) + 300,
    nonce: crypto.randomUUID(),
  });
}
