import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SandboxPaymentProvider } from "../server/payments/sandbox-provider";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V4 marketplace persistence contract", () => {
  it("extends existing listings and orders with SKU, cart, address and immutable order snapshots", () => {
    const migration = source("drizzle/0036_faithful_dreaming_celestial.sql");
    for (const table of [
      "listing_product_links", "listing_skus", "user_addresses", "shopping_carts",
      "shopping_cart_items", "commerce_checkout_requests", "order_line_items", "order_shipping_snapshots",
    ]) expect(migration).toContain(`CREATE TABLE \`${table}\``);
    expect(migration).toContain("listing_skus_listing_code_uq");
    expect(migration).toContain("shopping_carts_active_dedupe_uq");
    expect(migration).toContain("commerce_checkout_requests_request_uq");
  });

  it("locks SKU inventory, rejects mixed sellers and creates the existing order model", () => {
    const service = source("server/services/commerce-service.ts");
    expect(service).toContain('.for("update")');
    expect(service).toContain("CART_SELLER_MIXED");
    expect(service).toContain("SKU_STOCK_INSUFFICIENT");
    expect(service).toContain("tx.insert(orders)");
    expect(service).toContain("tx.insert(orderLineItems)");
    expect(service).toContain("tx.insert(orderShippingSnapshots)");
    expect(service).toContain("tx.insert(commerceCheckoutRequests)");
  });

  it("exposes real catalog, cart, buy-now, checkout, address and order-detail routes", () => {
    const router = source("server/routers/commerce-router.ts");
    for (const operation of ["listingDetail", "listingsForProduct", "createSku", "updateSku", "addresses", "createAddress", "cart", "addToCart", "updateCartItem", "removeCartItem", "checkout", "buyNow", "orderDetail"]) {
      expect(router).toContain(`${operation}:`);
    }
    expect(source("server/routers.ts")).toContain("commerce: commerceRouter");
    expect(source("app/cart.tsx")).toContain("trpc.commerce.checkout.useMutation");
    expect(source("app/listings/[id].tsx")).toContain("trpc.commerce.buyNow.useMutation");
    expect(source("app/payments/[orderId].tsx")).toContain("创建失败场景支付单");
  });
});

describe("payment confirmation order-state guard", () => {
  it("checks pending_payment both before and after the provider call", () => {
    const finance = source("server/services/finance-service.ts");
    const guards = finance.match(/order\.status !== "pending_payment"/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
    expect(finance).toContain("ORDER_NOT_AWAITING_PAYMENT");
  });
});

describe("delivery confirmation concurrency guard", () => {
  it("locks the order before advancing delivery state", () => {
    const service = source("server/services/order-service.ts");
    expect(service).toContain("confirmDeliveryTransaction");
    expect(service).toContain('.for("update")');
    expect(service).toContain('status: "pending_acceptance"');
  });
});

describe("SandboxPaymentProvider outcomes", () => {
  const provider = new SandboxPaymentProvider();
  const base = { paymentNo: "PAY-DEMO-001", amount: "299.00", currency: "CNY" };

  it("returns a deterministic success without contacting a real payment network", async () => {
    const first = await provider.confirmPayment({ ...base, idempotencyKey: "sandbox-success-key" });
    const second = await provider.confirmPayment({ ...base, idempotencyKey: "sandbox-success-key" });
    expect(first.success).toBe(true);
    expect(first.providerTransactionNo).toBe(second.providerTransactionNo);
    expect(first.providerTransactionNo).toMatch(/^SBX-PAY-/);
  });

  it("supports an explicit, deterministic failure path", async () => {
    const result = await provider.confirmPayment({ ...base, idempotencyKey: "simulate-failure-demo" });
    expect(result.success).toBe(false);
    expect(result.failedReason).toBe("SANDBOX_SIMULATED_FAILURE");
    expect(result.providerTransactionNo).toBeUndefined();
  });
});
