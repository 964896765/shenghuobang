import { eq } from "drizzle-orm";

import { orders } from "../../drizzle/schema";
import { requireDb } from "../db";

/**
 * Atomically advances an order to pending_acceptance.
 *
 * The row lock makes delivery confirmation safe to retry from a mobile client:
 * the first request wins and a concurrent/repeated request observes the new
 * state and is rejected instead of writing duplicate status logs.
 */
export async function confirmDeliveryTransaction(orderId: number, sellerId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    const order = rows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.sellerId !== sellerId) throw new Error("ONLY_SELLER_CAN_CONFIRM_DELIVERY");
    // A mobile request may have committed just before the connection dropped.
    // Treat the already-advanced state as an idempotent retry and let the
    // caller avoid writing a second status log or notification.
    if (order.status === "pending_acceptance") return { order, transitioned: false };
    if (!["pending_delivery", "pending_confirmation"].includes(order.status)) {
      throw new Error("ORDER_DELIVERY_STATE_INVALID");
    }
    await tx.update(orders).set({ status: "pending_acceptance" }).where(eq(orders.id, orderId));
    // The caller records the notification/log after the transaction commits.
    // Return the pre-transition snapshot so existing presentation code can
    // continue to use the order title and participant fields.
    return { order, transitioned: true };
  });
}
