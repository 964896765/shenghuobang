import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertProductUnitTransition,
  canonicalJson,
  productPassportEventHash,
  ProductLifecycleServiceError,
  type ProductPassportHashInput,
} from "../server/services/product-lifecycle-service";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V4 产品单元状态机", () => {
  it("允许生命周期主路径中的合法迁移", () => {
    expect(() => assertProductUnitTransition("registered", "manufactured")).not.toThrow();
    expect(() => assertProductUnitTransition("manufactured", "in_use")).not.toThrow();
    expect(() => assertProductUnitTransition("in_use", "listed")).not.toThrow();
    expect(() => assertProductUnitTransition("listed", "transferred")).not.toThrow();
    expect(() => assertProductUnitTransition("transferred", "recycling")).not.toThrow();
    expect(() => assertProductUnitTransition("recycling", "recycled")).not.toThrow();
    expect(() => assertProductUnitTransition("recycled", "retired")).not.toThrow();
  });

  it("拒绝跳过业务前置条件或从终态恢复", () => {
    expect(() => assertProductUnitTransition("registered", "listed")).toThrow("RESOURCE_STATE_FORBIDDEN");
    expect(() => assertProductUnitTransition("retired", "in_use")).toThrow("RESOURCE_STATE_FORBIDDEN");
    try {
      assertProductUnitTransition("recycling", "transferred");
    } catch (cause) {
      expect(cause).toBeInstanceOf(ProductLifecycleServiceError);
      expect((cause as ProductLifecycleServiceError).code).toBe("RESOURCE_STATE_FORBIDDEN");
    }
  });

  it("将同状态请求视为可幂等重放的空操作", () => {
    expect(() => assertProductUnitTransition("idle", "idle")).not.toThrow();
  });
});

describe("V4 产品护照哈希链", () => {
  const event: ProductPassportHashInput = {
    productUnitId: 23,
    sequenceNumber: 2,
    eventType: "quality_verified",
    actorAccountId: 7,
    actorOrganizationId: 3,
    fromStatus: "manufactured",
    toStatus: "manufactured",
    visibility: "public",
    sourceType: "verification",
    sourceId: "inspection-2026-001",
    requestId: "product-passport-test-001",
    detail: { score: 96, checks: ["safety", "material"], inspector: { level: "certified", name: "demo" } },
    previousEventHash: "a".repeat(64),
    occurredAt: new Date("2026-07-21T01:02:03.000Z"),
  };

  it("对对象键顺序使用稳定序列化", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("相同事件生成相同的 64 位 SHA-256 摘要", () => {
    const first = productPassportEventHash(event);
    const second = productPassportEventHash({ ...event, detail: { inspector: { name: "demo", level: "certified" }, checks: ["safety", "material"], score: 96 } });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it("前序哈希或事件详情变化会改变摘要", () => {
    const baseline = productPassportEventHash(event);
    expect(productPassportEventHash({ ...event, previousEventHash: "b".repeat(64) })).not.toBe(baseline);
    expect(productPassportEventHash({ ...event, detail: { ...event.detail, score: 95 } })).not.toBe(baseline);
  });
});

describe("V4 产品核心存储与 API 合约", () => {
  it("迁移包含型号、来源、单元、护照事件及关键唯一约束", () => {
    const migration = source("drizzle/0033_v4_product_core.sql");
    expect(migration).toContain("CREATE TABLE `product_models`");
    expect(migration).toContain("CREATE TABLE `product_source_links`");
    expect(migration).toContain("CREATE TABLE `product_units`");
    expect(migration).toContain("CREATE TABLE `product_passport_events`");
    expect(migration).toContain("CONSTRAINT `product_models_created_request_uq` UNIQUE");
    expect(migration).toContain("CONSTRAINT `product_units_linked_item_uq` UNIQUE");
    expect(migration).toContain("CONSTRAINT `product_passport_events_request_uq` UNIQUE");
    expect(migration).toContain("CONSTRAINT `product_passport_events_unit_sequence_uq` UNIQUE");
    expect(migration).toContain("`previousEventHash` char(64)");
    expect(migration).toContain("`eventHash` char(64) NOT NULL");
  });

  it("护照事件只提供追加写入路径，不允许静默更新或删除历史", () => {
    const service = source("server/services/product-lifecycle-service.ts");
    expect(service).toContain("tx.insert(productPassportEvents)");
    expect(service).not.toContain("tx.update(productPassportEvents)");
    expect(service).not.toContain("tx.delete(productPassportEvents)");
  });

  it("产品能力、资源事实和路由已接入中央授权与主 API", () => {
    const migration = source("drizzle/0033_v4_product_core.sql");
    const authorization = source("server/authorization/drizzle-data-source.ts");
    const appRouter = source("server/routers.ts");
    expect(migration).toContain("product.model.create");
    expect(migration).toContain("product.passport.view_owner");
    expect(authorization).toContain('request.resourceType === "product_model"');
    expect(authorization).toContain('request.resourceType === "product_unit"');
    expect(appRouter).toContain("productModels: productModelsRouter");
    expect(appRouter).toContain("productUnits: productUnitsRouter");
  });

  it("公开输出不暴露所有者、内部关联、序列号或内部事件来源", () => {
    const service = source("server/services/product-lifecycle-service.ts");
    const modelStart = service.indexOf("function publicProductModelView");
    const unitStart = service.indexOf("function publicProductUnitView");
    const eventStart = service.indexOf("function publicPassportEventView");
    const modelPublicSource = service.slice(modelStart, unitStart);
    const unitPublicSource = service.slice(unitStart, eventStart);
    const eventPublicSource = service.slice(eventStart, service.indexOf("type ProductDatabase"));
    expect(modelPublicSource).not.toContain("ownerAccountId");
    expect(modelPublicSource).not.toContain("ownerOrganizationId");
    expect(unitPublicSource).not.toContain("linkedItemId");
    expect(unitPublicSource).not.toContain("serialNumber");
    expect(eventPublicSource).not.toContain("actorAccountId");
    expect(eventPublicSource).not.toContain("sourceId");
    expect(eventPublicSource).not.toContain("requestId");
  });
});
