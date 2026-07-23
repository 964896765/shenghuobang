import { createCipheriv, createHash, randomBytes } from "node:crypto";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  commerceCheckoutRequests,
  listingProductLinks,
  listings,
  listingSkus,
  orderLineItems,
  orders,
  orderShippingSnapshots,
  orderStatusLogs,
  productModels,
  productUnits,
  shoppingCartItems,
  shoppingCarts,
  userAddresses,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { requireDb } from "../db";
import { writeAudit } from "./audit-service";

export class CommerceServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "CommerceServiceError";
  }
}

function requestId(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(normalized)) throw new CommerceServiceError("REQUEST_ID_INVALID");
  return normalized;
}

function text(value: string, max: number, code: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new CommerceServiceError(code);
  return normalized;
}

function optionalText(value: string | null | undefined, max: number, code: string) {
  if (value == null) return null;
  const normalized = value.trim();
  if (normalized.length > max) throw new CommerceServiceError(code);
  return normalized || null;
}

function positiveInteger(value: number, code: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new CommerceServiceError(code);
  return value;
}

function nonNegativeInteger(value: number, code: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new CommerceServiceError(code);
  return value;
}

function encryptPhone(value: string) {
  const secret = ENV.cookieSecret || "shenghuobang-local-commerce-prototype";
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

function maskPhone(value: string) {
  const normalized = value.replace(/\s+/g, "");
  return normalized.length >= 7 ? `${normalized.slice(0, 3)}****${normalized.slice(-4)}` : "***";
}

async function audit(accountId: number, action: string, resourceType: string, resourceId: number, detail?: Record<string, unknown>) {
  await writeAudit({ actorId: accountId, actorRole: "user", action, resourceType, resourceId, detail });
}

type AddressInput = {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode?: string | null;
  isDefault?: boolean;
  requestId: string;
};

type SkuInput = {
  listingId: number;
  skuCode: string;
  title: string;
  attributes?: Record<string, string>;
  price: number;
  stock: number;
  requestId: string;
};

export class CommerceService {
  async linkListingProduct(accountId: number, input: { listingId: number; productModelId: number; productUnitId?: number | null; requestId: string }) {
    const rid = requestId(input.requestId);
    const db = await requireDb();
    const existingRequest = await db.select().from(listingProductLinks).where(eq(listingProductLinks.requestId, rid)).limit(1);
    if (existingRequest[0]) return existingRequest[0];
    const listingRows = await db.select().from(listings).where(eq(listings.id, input.listingId)).limit(1);
    const listing = listingRows[0];
    if (!listing) throw new CommerceServiceError("LISTING_NOT_FOUND");
    if (listing.sellerId !== accountId) throw new CommerceServiceError("LISTING_MANAGE_FORBIDDEN");
    const modelRows = await db.select().from(productModels).where(and(eq(productModels.id, input.productModelId), isNull(productModels.deletedAt))).limit(1);
    const model = modelRows[0];
    if (!model || (model.ownerAccountId !== accountId && (model.visibility !== "public" || model.status !== "active"))) throw new CommerceServiceError("PRODUCT_RELATION_FORBIDDEN");
    if (input.productUnitId) {
      const unitRows = await db.select().from(productUnits).where(and(eq(productUnits.id, input.productUnitId), eq(productUnits.productModelId, input.productModelId))).limit(1);
      if (!unitRows[0] || unitRows[0].currentOwnerAccountId !== accountId) throw new CommerceServiceError("PRODUCT_UNIT_RELATION_FORBIDDEN");
    }
    await db.insert(listingProductLinks).values({ listingId: input.listingId, productModelId: input.productModelId, productUnitId: input.productUnitId ?? null, linkedByAccountId: accountId, requestId: rid })
      .onDuplicateKeyUpdate({ set: { productModelId: input.productModelId, productUnitId: input.productUnitId ?? null, linkedByAccountId: accountId, requestId: rid } });
    const rows = await db.select().from(listingProductLinks).where(eq(listingProductLinks.listingId, input.listingId)).limit(1);
    await audit(accountId, "commerce.link_listing_product", "listing", input.listingId, { productModelId: input.productModelId, productUnitId: input.productUnitId });
    return rows[0];
  }

  async createSku(accountId: number, input: SkuInput) {
    const rid = requestId(input.requestId);
    const db = await requireDb();
    const replay = await db.select().from(listingSkus).where(eq(listingSkus.createdRequestId, rid)).limit(1);
    if (replay[0]) return replay[0];
    const listingRows = await db.select().from(listings).where(eq(listings.id, input.listingId)).limit(1);
    if (!listingRows[0]) throw new CommerceServiceError("LISTING_NOT_FOUND");
    if (listingRows[0].sellerId !== accountId) throw new CommerceServiceError("LISTING_MANAGE_FORBIDDEN");
    const stock = nonNegativeInteger(input.stock, "SKU_STOCK_INVALID");
    const inserted = await db.insert(listingSkus).values({
      listingId: input.listingId,
      skuCode: text(input.skuCode, 64, "SKU_CODE_INVALID"),
      title: text(input.title, 180, "SKU_TITLE_INVALID"),
      attributes: input.attributes ?? {},
      price: positiveInteger(input.price, "SKU_PRICE_INVALID"),
      stock,
      status: stock === 0 ? "sold_out" : "active",
      createdRequestId: rid,
      lastRequestId: rid,
    });
    const rows = await db.select().from(listingSkus).where(eq(listingSkus.id, Number(inserted[0].insertId))).limit(1);
    await audit(accountId, "commerce.create_sku", "listing_sku", rows[0].id, { listingId: input.listingId, price: input.price, stock });
    return rows[0];
  }

  async updateSku(accountId: number, input: { skuId: number; title?: string; attributes?: Record<string, string>; price?: number; stock?: number; status?: "active" | "inactive"; requestId: string }) {
    const rid = requestId(input.requestId);
    const db = await requireDb();
    const rows = await db.select({ sku: listingSkus, sellerId: listings.sellerId }).from(listingSkus).innerJoin(listings, eq(listingSkus.listingId, listings.id)).where(eq(listingSkus.id, input.skuId)).limit(1);
    if (!rows[0]) throw new CommerceServiceError("SKU_NOT_FOUND");
    if (rows[0].sellerId !== accountId) throw new CommerceServiceError("LISTING_MANAGE_FORBIDDEN");
    if (rows[0].sku.lastRequestId === rid) return rows[0].sku;
    const stock = input.stock === undefined ? rows[0].sku.stock : nonNegativeInteger(input.stock, "SKU_STOCK_INVALID");
    const status = stock === 0 ? "sold_out" : input.status ?? (rows[0].sku.status === "sold_out" ? "active" : rows[0].sku.status);
    await db.update(listingSkus).set({
      title: input.title === undefined ? undefined : text(input.title, 180, "SKU_TITLE_INVALID"),
      attributes: input.attributes,
      price: input.price === undefined ? undefined : positiveInteger(input.price, "SKU_PRICE_INVALID"),
      stock,
      status,
      lastRequestId: rid,
    }).where(eq(listingSkus.id, input.skuId));
    const updated = await db.select().from(listingSkus).where(eq(listingSkus.id, input.skuId)).limit(1);
    await audit(accountId, "commerce.update_sku", "listing_sku", input.skuId, { stock, status });
    return updated[0];
  }

  async listingDetail(listingId: number, viewerAccountId?: number) {
    const db = await requireDb();
    const rows = await db.select({ listing: listings, link: listingProductLinks, modelPublicCode: productModels.publicCode, productName: productModels.name, unitPublicCode: productUnits.publicCode })
      .from(listings).leftJoin(listingProductLinks, eq(listings.id, listingProductLinks.listingId)).leftJoin(productModels, eq(listingProductLinks.productModelId, productModels.id)).leftJoin(productUnits, eq(listingProductLinks.productUnitId, productUnits.id))
      .where(eq(listings.id, listingId)).limit(1);
    const row = rows[0];
    if (!row || row.listing.status === "deleted" || (["draft", "closed"].includes(row.listing.status) && row.listing.sellerId !== viewerAccountId)) throw new CommerceServiceError("LISTING_NOT_FOUND");
    const skus = await db.select().from(listingSkus).where(and(eq(listingSkus.listingId, listingId), viewerAccountId === row.listing.sellerId ? undefined : inArray(listingSkus.status, ["active", "sold_out"]))).orderBy(listingSkus.id);
    return { ...row, skus };
  }

  async listingsForProduct(publicCodeValue: string) {
    const publicCode = text(publicCodeValue, 40, "PRODUCT_PUBLIC_CODE_INVALID");
    const db = await requireDb();
    const models = await db.select({ id: productModels.id }).from(productModels).where(and(eq(productModels.publicCode, publicCode), eq(productModels.status, "active"), eq(productModels.visibility, "public"), isNull(productModels.deletedAt))).limit(1);
    if (!models[0]) throw new CommerceServiceError("PRODUCT_NOT_FOUND");
    const rows = await db.select({ listing: listings, sku: listingSkus }).from(listingProductLinks).innerJoin(listings, eq(listingProductLinks.listingId, listings.id)).innerJoin(listingSkus, eq(listings.id, listingSkus.listingId))
      .where(and(eq(listingProductLinks.productModelId, models[0].id), eq(listings.status, "published"), eq(listingSkus.status, "active"))).orderBy(listings.id, listingSkus.price);
    return rows;
  }

  async createAddress(accountId: number, input: AddressInput) {
    const rid = requestId(input.requestId);
    const db = await requireDb();
    const replay = await db.select().from(userAddresses).where(eq(userAddresses.createdRequestId, rid)).limit(1);
    if (replay[0]) return replay[0];
    const values = {
      accountId,
      recipientName: text(input.recipientName, 100, "ADDRESS_RECIPIENT_INVALID"),
      phone: text(input.phone, 32, "ADDRESS_PHONE_INVALID"),
      province: text(input.province, 64, "ADDRESS_PROVINCE_INVALID"),
      city: text(input.city, 64, "ADDRESS_CITY_INVALID"),
      district: text(input.district, 64, "ADDRESS_DISTRICT_INVALID"),
      addressLine: text(input.addressLine, 255, "ADDRESS_LINE_INVALID"),
      postalCode: optionalText(input.postalCode, 16, "ADDRESS_POSTAL_INVALID"),
      isDefault: input.isDefault ?? false,
      createdRequestId: rid,
      lastRequestId: rid,
    };
    const inserted = await db.transaction(async (tx) => {
      if (values.isDefault) await tx.update(userAddresses).set({ isDefault: false }).where(and(eq(userAddresses.accountId, accountId), eq(userAddresses.status, "active")));
      const result = await tx.insert(userAddresses).values(values);
      return Number(result[0].insertId);
    });
    const rows = await db.select().from(userAddresses).where(eq(userAddresses.id, inserted)).limit(1);
    await audit(accountId, "commerce.create_address", "user_address", inserted, { city: values.city, isDefault: values.isDefault });
    return rows[0];
  }

  async listAddresses(accountId: number) {
    const db = await requireDb();
    return db.select().from(userAddresses).where(and(eq(userAddresses.accountId, accountId), eq(userAddresses.status, "active"))).orderBy(desc(userAddresses.isDefault), desc(userAddresses.updatedAt));
  }

  async deleteAddress(accountId: number, addressId: number, ridValue: string) {
    requestId(ridValue);
    const db = await requireDb();
    const rows = await db.select().from(userAddresses).where(and(eq(userAddresses.id, addressId), eq(userAddresses.accountId, accountId))).limit(1);
    if (!rows[0]) return { deleted: true, idempotent: true };
    if (rows[0].status === "deleted") return { deleted: true, idempotent: true };
    await db.update(userAddresses).set({ status: "deleted", isDefault: false, lastRequestId: ridValue }).where(eq(userAddresses.id, addressId));
    await audit(accountId, "commerce.delete_address", "user_address", addressId);
    return { deleted: true, idempotent: false };
  }

  private async activeCartId(accountId: number) {
    const db = await requireDb();
    const rows = await db.select({ id: shoppingCarts.id }).from(shoppingCarts).where(and(eq(shoppingCarts.buyerAccountId, accountId), eq(shoppingCarts.status, "active"), eq(shoppingCarts.activeDedupeKey, `buyer:${accountId}`))).limit(1);
    if (rows[0]) return rows[0].id;
    const inserted = await db.insert(shoppingCarts).values({ buyerAccountId: accountId, status: "active", activeDedupeKey: `buyer:${accountId}` }).onDuplicateKeyUpdate({ set: { buyerAccountId: accountId } });
    if (Number(inserted[0].insertId)) return Number(inserted[0].insertId);
    const replay = await db.select({ id: shoppingCarts.id }).from(shoppingCarts).where(eq(shoppingCarts.activeDedupeKey, `buyer:${accountId}`)).limit(1);
    if (!replay[0]) throw new CommerceServiceError("CART_CREATE_FAILED");
    return replay[0].id;
  }

  async cart(accountId: number) {
    const db = await requireDb();
    const cartId = await this.activeCartId(accountId);
    const items = await db.select({ cartItem: shoppingCartItems, sku: listingSkus, listing: listings, modelPublicCode: productModels.publicCode })
      .from(shoppingCartItems).innerJoin(listingSkus, eq(shoppingCartItems.skuId, listingSkus.id)).innerJoin(listings, eq(listingSkus.listingId, listings.id))
      .leftJoin(listingProductLinks, eq(listings.id, listingProductLinks.listingId)).leftJoin(productModels, eq(listingProductLinks.productModelId, productModels.id))
      .where(eq(shoppingCartItems.cartId, cartId)).orderBy(shoppingCartItems.id);
    return { cartId, items, totalAmount: items.reduce((sum, item) => sum + item.sku.price * item.cartItem.quantity, 0), totalQuantity: items.reduce((sum, item) => sum + item.cartItem.quantity, 0) };
  }

  async addToCart(accountId: number, skuId: number, quantityValue: number, ridValue: string) {
    const rid = requestId(ridValue);
    const quantity = positiveInteger(quantityValue, "CART_QUANTITY_INVALID");
    const db = await requireDb();
    const duplicate = await db.select().from(shoppingCartItems).where(eq(shoppingCartItems.lastRequestId, rid)).limit(1);
    if (duplicate[0]) return this.cart(accountId);
    const skuRows = await db.select({ sku: listingSkus, listing: listings }).from(listingSkus).innerJoin(listings, eq(listingSkus.listingId, listings.id)).where(eq(listingSkus.id, skuId)).limit(1);
    const row = skuRows[0];
    if (!row || row.sku.status !== "active" || row.listing.status !== "published") throw new CommerceServiceError("SKU_UNAVAILABLE");
    if (row.listing.sellerId === accountId) throw new CommerceServiceError("BUY_OWN_LISTING_FORBIDDEN");
    const cartId = await this.activeCartId(accountId);
    const current = await db.select().from(shoppingCartItems).where(and(eq(shoppingCartItems.cartId, cartId), eq(shoppingCartItems.skuId, skuId))).limit(1);
    const nextQuantity = (current[0]?.quantity ?? 0) + quantity;
    if (nextQuantity > row.sku.stock) throw new CommerceServiceError("SKU_STOCK_INSUFFICIENT");
    await db.insert(shoppingCartItems).values({ cartId, skuId, quantity: nextQuantity, lastRequestId: rid }).onDuplicateKeyUpdate({ set: { quantity: nextQuantity, lastRequestId: rid } });
    await audit(accountId, "commerce.add_to_cart", "shopping_cart", cartId, { skuId, quantity });
    return this.cart(accountId);
  }

  async updateCartItem(accountId: number, itemId: number, quantityValue: number, ridValue: string) {
    const rid = requestId(ridValue);
    const quantity = positiveInteger(quantityValue, "CART_QUANTITY_INVALID");
    const db = await requireDb();
    const rows = await db.select({ item: shoppingCartItems, cart: shoppingCarts, stock: listingSkus.stock }).from(shoppingCartItems).innerJoin(shoppingCarts, eq(shoppingCartItems.cartId, shoppingCarts.id)).innerJoin(listingSkus, eq(shoppingCartItems.skuId, listingSkus.id)).where(eq(shoppingCartItems.id, itemId)).limit(1);
    const row = rows[0];
    if (!row || row.cart.buyerAccountId !== accountId || row.cart.status !== "active") throw new CommerceServiceError("CART_ITEM_NOT_FOUND");
    if (row.item.lastRequestId === rid) return this.cart(accountId);
    if (quantity > row.stock) throw new CommerceServiceError("SKU_STOCK_INSUFFICIENT");
    await db.update(shoppingCartItems).set({ quantity, lastRequestId: rid }).where(eq(shoppingCartItems.id, itemId));
    await audit(accountId, "commerce.update_cart_item", "shopping_cart", row.cart.id, { itemId, quantity });
    return this.cart(accountId);
  }

  async removeCartItem(accountId: number, itemId: number, ridValue: string) {
    requestId(ridValue);
    const db = await requireDb();
    const rows = await db.select({ item: shoppingCartItems, cart: shoppingCarts }).from(shoppingCartItems).innerJoin(shoppingCarts, eq(shoppingCartItems.cartId, shoppingCarts.id)).where(eq(shoppingCartItems.id, itemId)).limit(1);
    if (!rows[0]) return this.cart(accountId);
    if (rows[0].cart.buyerAccountId !== accountId || rows[0].cart.status !== "active") throw new CommerceServiceError("CART_ITEM_NOT_FOUND");
    await db.delete(shoppingCartItems).where(eq(shoppingCartItems.id, itemId));
    await audit(accountId, "commerce.remove_cart_item", "shopping_cart", rows[0].cart.id, { itemId });
    return this.cart(accountId);
  }

  async checkout(accountId: number, addressId: number, ridValue: string, specifiedCartId?: number) {
    const rid = requestId(ridValue);
    const db = await requireDb();
    const replay = await db.select().from(commerceCheckoutRequests).where(eq(commerceCheckoutRequests.requestId, rid)).limit(1);
    if (replay[0]) {
      if (replay[0].buyerAccountId !== accountId) throw new CommerceServiceError("IDEMPOTENCY_CONFLICT");
      return { orderId: replay[0].orderId, idempotent: true };
    }
    const addressRows = await db.select().from(userAddresses).where(and(eq(userAddresses.id, addressId), eq(userAddresses.accountId, accountId), eq(userAddresses.status, "active"))).limit(1);
    const address = addressRows[0];
    if (!address) throw new CommerceServiceError("ADDRESS_NOT_FOUND");
    const cartId = specifiedCartId ?? await this.activeCartId(accountId);
    const orderId = await db.transaction(async (tx) => {
      const cartRows = await tx.select().from(shoppingCarts).where(and(eq(shoppingCarts.id, cartId), eq(shoppingCarts.buyerAccountId, accountId), eq(shoppingCarts.status, "active"))).for("update").limit(1);
      if (!cartRows[0]) throw new CommerceServiceError("CART_NOT_FOUND");
      const items = await tx.select({ item: shoppingCartItems, sku: listingSkus, listing: listings, link: listingProductLinks })
        .from(shoppingCartItems).innerJoin(listingSkus, eq(shoppingCartItems.skuId, listingSkus.id)).innerJoin(listings, eq(listingSkus.listingId, listings.id)).leftJoin(listingProductLinks, eq(listings.id, listingProductLinks.listingId))
        .where(eq(shoppingCartItems.cartId, cartId)).orderBy(shoppingCartItems.id);
      if (!items.length) throw new CommerceServiceError("CART_EMPTY");
      const sellerIds = [...new Set(items.map((item) => item.listing.sellerId))];
      if (sellerIds.length !== 1) throw new CommerceServiceError("CART_SELLER_MIXED");
      if (sellerIds[0] === accountId) throw new CommerceServiceError("BUY_OWN_LISTING_FORBIDDEN");
      let amount = 0;
      for (const item of items) {
        const locked = await tx.select().from(listingSkus).where(eq(listingSkus.id, item.sku.id)).for("update").limit(1);
        if (!locked[0] || locked[0].status !== "active" || item.listing.status !== "published" || locked[0].stock < item.item.quantity) throw new CommerceServiceError("SKU_STOCK_INSUFFICIENT");
        amount += locked[0].price * item.item.quantity;
      }
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new CommerceServiceError("ORDER_AMOUNT_INVALID");
      const orderResult = await tx.insert(orders).values({ orderType: "listing", buyerId: accountId, sellerId: sellerIds[0], refId: items[0].listing.id, title: items.length === 1 ? items[0].sku.title : `${items[0].sku.title} 等 ${items.length} 件`, amount, status: "pending_payment" });
      const createdOrderId = Number(orderResult[0].insertId);
      await tx.insert(orderStatusLogs).values({ orderId: createdOrderId, fromStatus: null, toStatus: "pending_payment", note: "购物车结算创建订单" });
      await tx.insert(orderLineItems).values(items.map((item) => ({ orderId: createdOrderId, listingId: item.listing.id, skuId: item.sku.id, skuCode: item.sku.skuCode, title: item.sku.title, attributes: item.sku.attributes, quantity: item.item.quantity, unitPrice: item.sku.price, lineAmount: item.sku.price * item.item.quantity, productModelId: item.link?.productModelId ?? null, productUnitId: item.link?.productUnitId ?? null })));
      for (const item of items) {
        const remaining = item.sku.stock - item.item.quantity;
        await tx.update(listingSkus).set({ stock: remaining, status: remaining === 0 ? "sold_out" : "active", lastRequestId: `${rid}:sku:${item.sku.id}`.slice(0, 64) }).where(eq(listingSkus.id, item.sku.id));
      }
      await tx.insert(orderShippingSnapshots).values({ orderId: createdOrderId, sourceAddressId: address.id, recipientName: address.recipientName, phoneMasked: maskPhone(address.phone), phoneEncrypted: encryptPhone(address.phone), province: address.province, city: address.city, district: address.district, addressLine: address.addressLine, postalCode: address.postalCode });
      await tx.insert(commerceCheckoutRequests).values({ buyerAccountId: accountId, requestId: rid, orderId: createdOrderId });
      await tx.update(shoppingCarts).set({ status: "checked_out", activeDedupeKey: null, checkedOutAt: new Date() }).where(eq(shoppingCarts.id, cartId));
      return createdOrderId;
    });
    await audit(accountId, "commerce.checkout", "order", orderId, { cartId, addressId });
    return { orderId, idempotent: false };
  }

  async buyNow(accountId: number, input: { skuId: number; quantity: number; addressId: number; requestId: string }) {
    const rid = requestId(input.requestId);
    const db = await requireDb();
    const replay = await db.select().from(commerceCheckoutRequests).where(eq(commerceCheckoutRequests.requestId, rid)).limit(1);
    if (replay[0]) return { orderId: replay[0].orderId, idempotent: true };
    const cartResult = await db.insert(shoppingCarts).values({ buyerAccountId: accountId, status: "active", activeDedupeKey: null });
    const cartId = Number(cartResult[0].insertId);
    await db.insert(shoppingCartItems).values({ cartId, skuId: input.skuId, quantity: positiveInteger(input.quantity, "CART_QUANTITY_INVALID"), lastRequestId: `${rid}:item`.slice(0, 64) });
    return this.checkout(accountId, input.addressId, rid, cartId);
  }

  async orderDetail(accountId: number, orderId: number) {
    const db = await requireDb();
    const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = rows[0];
    if (!order || (order.buyerId !== accountId && order.sellerId !== accountId)) throw new CommerceServiceError("ORDER_NOT_FOUND");
    const [items, shipping, logs] = await Promise.all([
      db.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId)).orderBy(orderLineItems.id),
      db.select({ orderId: orderShippingSnapshots.orderId, recipientName: orderShippingSnapshots.recipientName, phoneMasked: orderShippingSnapshots.phoneMasked, province: orderShippingSnapshots.province, city: orderShippingSnapshots.city, district: orderShippingSnapshots.district, addressLine: orderShippingSnapshots.addressLine, postalCode: orderShippingSnapshots.postalCode }).from(orderShippingSnapshots).where(eq(orderShippingSnapshots.orderId, orderId)).limit(1),
      db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, orderId)).orderBy(desc(orderStatusLogs.createdAt)),
    ]);
    return { order, items, shipping: shipping[0] ?? null, logs, myRole: order.buyerId === accountId ? "buyer" as const : "seller" as const };
  }

  async cancelCommerceOrder(accountId: number, orderId: number) {
    const db = await requireDb();
    const result = await db.transaction(async (tx) => {
      const orderRows = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
      const order = orderRows[0];
      if (!order) throw new CommerceServiceError("ORDER_NOT_FOUND");
      const lines = await tx.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId));
      if (!lines.length) return null;
      if (order.buyerId !== accountId && order.sellerId !== accountId) throw new CommerceServiceError("ORDER_CANCEL_FORBIDDEN");
      if (!['pending_confirmation', 'pending_payment'].includes(order.status)) throw new CommerceServiceError("ORDER_CANCEL_STATE_INVALID");
      await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, orderId));
      await tx.insert(orderStatusLogs).values({ orderId, fromStatus: order.status, toStatus: "cancelled", note: "订单已取消，SKU 库存已释放" });
      for (const line of lines) {
        await tx.update(listingSkus).set({ stock: sql`${listingSkus.stock} + ${line.quantity}`, status: "active", lastRequestId: `cancel:${orderId}:sku:${line.skuId}`.slice(0, 64) }).where(eq(listingSkus.id, line.skuId));
      }
      return { ...order, status: "cancelled" as const };
    });
    if (result) await audit(accountId, "commerce.cancel_order", "order", orderId, { inventoryReleased: true });
    return result;
  }
}

export const commerceService = new CommerceService();
