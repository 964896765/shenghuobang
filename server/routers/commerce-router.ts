import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { CommerceServiceError, commerceService } from "../services/commerce-service";

const id = z.number().int().positive();
const requestId = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,64}$/);
const attributes = z.record(z.string().trim().min(1).max(64), z.string().trim().max(180));
const addressFields = {
  recipientName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(32),
  province: z.string().trim().min(1).max(64),
  city: z.string().trim().min(1).max(64),
  district: z.string().trim().min(1).max(64),
  addressLine: z.string().trim().min(1).max(255),
  postalCode: z.string().trim().max(16).nullable().optional(),
  isDefault: z.boolean().optional(),
};

const notFound = new Set(["LISTING_NOT_FOUND", "SKU_NOT_FOUND", "CART_ITEM_NOT_FOUND", "CART_NOT_FOUND", "ADDRESS_NOT_FOUND", "ORDER_NOT_FOUND", "PRODUCT_NOT_FOUND", "PRODUCT_UNIT_NOT_FOUND"]);
const forbidden = new Set(["LISTING_MANAGE_FORBIDDEN", "PRODUCT_RELATION_FORBIDDEN", "PRODUCT_UNIT_RELATION_FORBIDDEN", "BUY_OWN_LISTING_FORBIDDEN"]);
const conflict = new Set(["IDEMPOTENCY_CONFLICT", "SKU_STOCK_INSUFFICIENT", "SKU_UNAVAILABLE", "CART_SELLER_MIXED"]);

function mapError(cause: unknown): never {
  if (cause instanceof TRPCError) throw cause;
  const code = cause instanceof CommerceServiceError ? cause.code : "INTERNAL_SERVER_ERROR";
  if (notFound.has(code)) throw new TRPCError({ code: "NOT_FOUND", message: code });
  if (forbidden.has(code)) throw new TRPCError({ code: "FORBIDDEN", message: code });
  if (conflict.has(code)) throw new TRPCError({ code: "CONFLICT", message: code });
  if (cause instanceof CommerceServiceError) throw new TRPCError({ code: "BAD_REQUEST", message: code });
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: code });
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (cause) { mapError(cause); }
}

export const commerceRouter = router({
  listingDetail: publicProcedure.input(z.object({ listingId: id }).strict())
    .query(({ ctx, input }) => call(() => commerceService.listingDetail(input.listingId, ctx.user?.id))),
  listingsForProduct: publicProcedure.input(z.object({ publicCode: z.string().trim().min(1).max(40) }).strict())
    .query(({ input }) => call(() => commerceService.listingsForProduct(input.publicCode))),
  linkListingProduct: protectedProcedure.input(z.object({ listingId: id, productModelId: id, productUnitId: id.nullable().optional(), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.linkListingProduct(ctx.user.id, input))),
  createSku: protectedProcedure.input(z.object({ listingId: id, skuCode: z.string().trim().min(1).max(64), title: z.string().trim().min(1).max(180), attributes: attributes.optional(), price: id, stock: z.number().int().min(0), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.createSku(ctx.user.id, input))),
  updateSku: protectedProcedure.input(z.object({ skuId: id, title: z.string().trim().min(1).max(180).optional(), attributes: attributes.optional(), price: id.optional(), stock: z.number().int().min(0).optional(), status: z.enum(["active", "inactive"]).optional(), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.updateSku(ctx.user.id, input))),
  addresses: protectedProcedure.query(({ ctx }) => call(() => commerceService.listAddresses(ctx.user.id))),
  createAddress: protectedProcedure.input(z.object({ ...addressFields, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.createAddress(ctx.user.id, input))),
  deleteAddress: protectedProcedure.input(z.object({ addressId: id, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.deleteAddress(ctx.user.id, input.addressId, input.requestId))),
  cart: protectedProcedure.query(({ ctx }) => call(() => commerceService.cart(ctx.user.id))),
  addToCart: protectedProcedure.input(z.object({ skuId: id, quantity: z.number().int().min(1).max(999), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.addToCart(ctx.user.id, input.skuId, input.quantity, input.requestId))),
  updateCartItem: protectedProcedure.input(z.object({ itemId: id, quantity: z.number().int().min(1).max(999), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.updateCartItem(ctx.user.id, input.itemId, input.quantity, input.requestId))),
  removeCartItem: protectedProcedure.input(z.object({ itemId: id, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.removeCartItem(ctx.user.id, input.itemId, input.requestId))),
  checkout: protectedProcedure.input(z.object({ addressId: id, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.checkout(ctx.user.id, input.addressId, input.requestId))),
  buyNow: protectedProcedure.input(z.object({ skuId: id, quantity: z.number().int().min(1).max(999), addressId: id, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => commerceService.buyNow(ctx.user.id, input))),
  orderDetail: protectedProcedure.input(z.object({ orderId: id }).strict())
    .query(({ ctx, input }) => call(() => commerceService.orderDetail(ctx.user.id, input.orderId))),
});
