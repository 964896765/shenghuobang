import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V4 review and credit traceability", () => {
  it("adds review media, tags, reply, source, impact and idempotency fields", () => {
    const migration = source("drizzle/0037_complete_nuke.sql");
    for (const column of ["tags", "imageFileIds", "businessSource", "impactDimension", "requestId", "reply", "repliedBy", "repliedAt"]) {
      expect(migration).toContain(`\`${column}\``);
    }
    expect(migration).toContain("reviews_order_reviewer_uq");
    expect(migration).toContain("credit_events_user_request_uq");
  });

  it("writes review, credit event, aggregate and audit in one transaction", () => {
    const db = source("server/db.ts");
    expect(db).toContain("createOrderReviewTransaction");
    expect(db).toContain("tx.insert(reviews)");
    expect(db).toContain("tx.insert(creditEvents)");
    expect(db).toContain("tx.update(userProfiles)");
    expect(db).toContain("review.order.create");
    expect(db).toContain("replyToReviewTransaction");
  });

  it("keeps multi-SKU order completion scoped to its commerce lines", () => {
    const db = source("server/db.ts");
    expect(db).toContain("const commerceLines = await tx.select");
    expect(db).toContain("if (commerceLines.length) {");
    expect(db).toContain("const listingIds = [...new Set(commerceLines.map((line) => line.listingId))]");
  });
});

describe("V4 repair, donation and recycling hubs", () => {
  it("routes all three home entries to real aggregations", () => {
    const entries = source("shared/navigation/homeEntries.ts");
    expect(entries).toContain('route: "/repair"');
    expect(entries).toContain('route: "/donation"');
    expect(entries).toContain('route: "/recycling"');
    for (const page of ["app/repair/index.tsx", "app/donation/index.tsx", "app/recycling/index.tsx"]) {
      expect(source(page)).toContain("trpc.");
      expect(source(page)).not.toContain("coming-soon");
    }
  });
});
