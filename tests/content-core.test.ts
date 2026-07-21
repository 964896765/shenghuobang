import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertContentTransition,
  canTransitionContent,
  ContentServiceError,
} from "../server/services/content-service";
import { detectFile, validateMimeAndExtension } from "../server/storage/file-policy";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V4 unified content state flow", () => {
  it("allows the server-owned publish flow", () => {
    expect(() => assertContentTransition("draft", "ready_to_publish")).not.toThrow();
    expect(() => assertContentTransition("ready_to_publish", "reviewing")).not.toThrow();
    expect(() => assertContentTransition("reviewing", "published")).not.toThrow();
    expect(() => assertContentTransition("published", "recommendation_limited")).not.toThrow();
    expect(() => assertContentTransition("published", "unpublished")).not.toThrow();
  });

  it("rejects skipping review and restoring terminal states", () => {
    expect(canTransitionContent("draft", "published")).toBe(false);
    expect(() => assertContentTransition("draft", "published")).toThrow("CONTENT_STATE_TRANSITION_INVALID");
    expect(() => assertContentTransition("author_deleted", "draft")).toThrow(ContentServiceError);
    expect(() => assertContentTransition("platform_banned", "published")).toThrow(ContentServiceError);
  });
});

describe("V4 content persistence and API contracts", () => {
  it("creates one unified content model with idempotency and discovery indexes", () => {
    const migration = source("drizzle/0035_skinny_clint_barton.sql");
    for (const table of [
      "content_posts", "content_media", "content_relations", "content_tags",
      "content_tag_links", "content_interactions", "content_comments", "content_follows",
      "content_reports", "content_moderation_records", "content_metrics", "content_drafts",
      "creator_profiles",
    ]) expect(migration).toContain(`CREATE TABLE \`${table}\``);
    expect(migration).toContain("content_posts_created_request_uq");
    expect(migration).toContain("content_interactions_request_uq");
    expect(migration).toContain("content_comments_request_uq");
    expect(migration).toContain("content_posts_discovery_idx");
  });

  it("exposes create, publish, discover, engagement and reporting operations", () => {
    const router = source("server/routers/content-router.ts");
    const root = source("server/routers.ts");
    for (const operation of [
      "createDraft", "saveDraft", "replaceMedia", "replaceRelations", "aiSuggest",
      "confirmAi", "publish", "detail", "discover", "mine", "creatorDashboard",
      "setLike", "setFavorite", "addComment", "deleteComment", "setFollow", "report",
    ]) expect(router).toContain(`${operation}:`);
    expect(root).toContain("content: contentRouter");
  });

  it("validates private business relations instead of trusting client labels", () => {
    const service = source("server/services/content-service.ts");
    expect(service).toContain("async function validateRelation");
    expect(service).toContain('row.visibility !== "public"');
    expect(service).toContain('type === "idea"');
    expect(service).toContain('type === "product_unit"');
    expect(service).toContain("await validateRelation(accountId");
  });

  it("requires explicit AI confirmation and never labels AI output platform verified", () => {
    const service = source("server/services/content-service.ts");
    expect(service).toContain("requiresConfirmation: true");
    expect(service).toContain("aiConfirmedAt: new Date()");
    expect(service).toContain('sourceType: post.sourceType === "platform_verified" ? post.sourceType : "ai_assisted"');
    expect(service).toContain("AI_CONFIRMATION_REQUIRED");
  });
});

describe("content media policy", () => {
  it("recognizes MP4 container headers and validates the declared type", () => {
    const buffer = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), Buffer.alloc(16)]);
    const detected = detectFile(buffer);
    expect(detected).toEqual({ mimeType: "video/mp4", extension: "mp4" });
    expect(validateMimeAndExtension("demo.mp4", "video/mp4", detected)).toBe("mp4");
  });
});
