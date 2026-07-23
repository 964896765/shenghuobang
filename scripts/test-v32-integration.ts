import "dotenv/config";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import {
  assertSafeLocalTestDatabaseServer,
  createMysqlConnectionOptions,
  replaceMysqlDatabaseName,
  resolveMysqlAdminUrlFromEnv,
} from "./lib/mysql-test-config.mjs";

const DATABASE_NAME = "shenghuobang_v32_integration";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`V3.2 集成测试失败：${message}`);
}
async function scalar<T>(connection: mysql.Connection, query: string, params: unknown[] = []) {
  const [rows] = await connection.execute<(RowDataPacket & { value: T })[]>(query, params);
  return rows[0]?.value;
}
async function applyMigration(connection: mysql.Connection, file: string) {
  const sql = (await readFile(path.resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", "");
  await connection.query(sql);
}

async function applyMigrationsAfter(connection: mysql.Connection, afterPrefix: string) {
  const files = (await readdir(path.resolve(process.cwd(), "drizzle")))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()
    .filter((file) => file > afterPrefix);
  for (const file of files) {
    await applyMigration(connection, file);
  }
}

async function main() {
  const { rawUrl: adminRawUrl } = resolveMysqlAdminUrlFromEnv({ consumerName: "v3.2 integration test" });
  assertSafeLocalTestDatabaseServer(adminRawUrl, { consumerName: "v3.2 integration test" });
  const admin = await mysql.createConnection(
    createMysqlConnectionOptions(adminRawUrl, { multipleStatements: true }),
  );
  const testUrl = replaceMysqlDatabaseName(adminRawUrl, DATABASE_NAME);
  const results: string[] = [];
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${DATABASE_NAME}\`;`);
    for (const file of [
      "0000_elite_eternals.sql", "0001_neat_omega_flight.sql", "0002_bizarre_rachel_grey.sql",
      "0003_spotty_captain_flint.sql", "0004_yummy_storm.sql", "0005_silky_squadron_supreme.sql",
      "0006_steady_wild_child.sql",
    ]) await applyMigration(admin, file);

    const [seller] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES (?,?,?,?)", ["v32:seller","18800000301","integration","卖家"]);
    const [buyer] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES (?,?,?,?)", ["v32:buyer","18800000302","integration","买家"]);
    const [historical] = await admin.execute<ResultSetHeader>(
      "INSERT INTO listings (sellerId,title,category,conditionLevel,functionStatus,modes,primaryMode,price,status,itemStatus) VALUES (?,?,?,?,?,JSON_ARRAY('fixed_price','accept_offers'),'fixed_price',100,'published','listed')",
      [seller.insertId,"历史台灯","家居","九成新","功能正常"],
    );
    await applyMigration(admin, "0007_purple_prowler.sql");
    await applyMigration(admin, "0008_confused_orphan.sql");
    await applyMigration(admin, "0009_vengeful_sentinel.sql");
    await applyMigration(admin, "0010_boring_groot.sql");
    await applyMigration(admin, "0011_melted_mac_gargan.sql");
    await applyMigration(admin, "0012_lumpy_molecule_man.sql");
    const legacyPushToken = "ExponentPushToken[v322-upgrade-fixture]";
    await admin.execute(
      "INSERT INTO device_push_tokens (userId,platform,token,deviceId,active) VALUES (?,'android',?,'v322-device',true)",
      [seller.insertId, legacyPushToken],
    );
    await applyMigration(admin, "0013_gorgeous_gargoyle.sql");
    check(
      await scalar<number>(admin, "SELECT COUNT(*) value FROM device_push_tokens WHERE token=? AND active=true", [legacyPushToken]) === 1,
      "V3.2.2 Push Token 在 0013 升级后丢失",
    );
    check(
      await scalar<number>(admin, "SELECT COUNT(*) value FROM information_schema.columns WHERE table_schema=? AND table_name='device_push_tokens' AND column_name IN ('disabledAt','disabledReason','updatedAt')", [DATABASE_NAME]) === 3,
      "0013 Push Token 停用字段未完整创建",
    );
    results.push("V3.2.2 Push Token 数据升级到 0013");
    await applyMigrationsAfter(admin, "0013_gorgeous_gargoyle.sql");
    const itemId = await scalar<number>(admin, "SELECT itemId value FROM listings WHERE id=?", [historical.insertId]);
    check(Number(itemId) > 0, "历史 listing 未回填 itemId");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM item_ownership_history WHERE itemId=? AND transferType='created'", [itemId]) === 1, "历史物品初始所有权未回填");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM listing_modes WHERE listingId=?", [historical.insertId]) === 2, "历史流转方式未拆分");
    results.push("历史 listing 迁移为 item + listing");

    process.env.DATABASE_URL = testUrl;
    const db = await import("../server/db");

    const purchases = await Promise.allSettled([
      db.buyListingNowTransaction(historical.insertId, buyer.insertId),
      db.buyListingNowTransaction(historical.insertId, buyer.insertId),
    ]);
    check(purchases.filter((r) => r.status === "fulfilled").length === 1, "并发购买未做到仅一单成功");
    const orderId = (purchases.find((r): r is PromiseFulfilledResult<{orderId:number;sellerId:number;title:string}> => r.status === "fulfilled"))!.value.orderId;
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM orders WHERE refId=? AND orderType='listing'", [historical.insertId]) === 1, "同一物品生成多个订单");
    results.push("同一物品并发购买仅成功一次");

    await db.cancelOrderTransaction(orderId, buyer.insertId);
    check(await scalar<string>(admin, "SELECT status value FROM items WHERE id=?", [itemId]) === "listed", "取消订单后物品未恢复 listed");
    check(await scalar<string>(admin, "SELECT status value FROM listings WHERE id=?", [historical.insertId]) === "published", "取消订单后发布未恢复 published");
    results.push("取消未支付订单释放物品");

    const purchase = await db.buyListingNowTransaction(historical.insertId, buyer.insertId);
    await admin.execute("UPDATE orders SET status='pending_acceptance' WHERE id=?", [purchase.orderId]);
    await db.completeOrderTransaction(purchase.orderId, buyer.insertId);
    check(await scalar<number>(admin, "SELECT ownerId value FROM items WHERE id=?", [itemId]) === buyer.insertId, "出售后所有权未转移");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM item_ownership_history WHERE itemId=? AND orderId=? AND transferType='sold'", [itemId, purchase.orderId]) === 1, "出售所有权历史缺失");
    results.push("出售完成记录所有权历史");

    const lifecycle = await db.getItemLifecycle(itemId, buyer.insertId);
    check(lifecycle.ownership.length >= 2 && lifecycle.listings.length >= 1, "物品生命周期聚合不完整");
    results.push("物品生命周期可查询");

    const storedId = await db.createStoredFile({ ownerId: buyer.insertId, provider:"local", storageKey:"files/test/report.pdf", originalName:"report.pdf", mimeType:"application/pdf", sizeBytes:4, sha256:"a".repeat(64), privacyLevel:"business", virusScanStatus:"unavailable", status:"available", relatedEntityType:"item", relatedEntityId:itemId });
    await db.addFileAccessLog({ fileId:storedId, userId:buyer.insertId, action:"upload", relatedEntityType:"item", relatedEntityId:itemId });
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM file_access_logs WHERE fileId=? AND action='upload'", [storedId]) === 1, "文件审计记录缺失");
    results.push("文件元数据和审计记录");

    const conv = await db.getOrCreateConversation(seller.insertId, buyer.insertId);
    const messageResult = await db.sendMessage(conv.id, seller.insertId, "v32-integration-message", "V3.2 实时消息");
    const duplicateMessage = await db.sendMessage(conv.id, seller.insertId, "v32-integration-message", "V3.2 实时消息");
    const messageId = messageResult.message.id;
    check(messageResult.created && !duplicateMessage.created && duplicateMessage.message.id === messageId, "客户端消息幂等失败");
    await Promise.all([db.markConversationDelivered(conv.id, buyer.insertId), db.markConversationDelivered(conv.id, buyer.insertId)]);
    await db.markConversationRead(conv.id, buyer.insertId);
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM message_receipts WHERE messageId=? AND userId=?", [messageId,buyer.insertId]) === 1, "消息回执重复或缺失");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM message_receipts WHERE messageId=? AND readAt IS NOT NULL", [messageId]) === 1, "消息已读状态缺失");
    results.push("消息创建、送达和已读幂等");

    const notificationId = await db.createNotification({ userId: buyer.insertId, category: "system", title: "V3.2 幂等通知", content: "只创建一次", refType: "item", refId: itemId, dedupeKey: `v32:item:${itemId}:buyer` });
    const duplicateNotificationId = await db.createNotification({ userId: buyer.insertId, category: "system", title: "V3.2 幂等通知", content: "只创建一次", refType: "item", refId: itemId, dedupeKey: `v32:item:${itemId}:buyer` });
    check(notificationId === duplicateNotificationId, "重复通知未返回原记录");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM notifications WHERE userId=? AND dedupeKey=?", [buyer.insertId, `v32:item:${itemId}:buyer`]) === 1, "通知去重约束失效");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM notification_deliveries WHERE notificationId=? AND channel='in_app'", [notificationId]) === 1, "重复通知产生重复站内投递");
    results.push("通知业务键和投递幂等");

    const reusableToken = "ExpoPushToken[v323-integration-token]";
    await db.registerPushToken({ userId: buyer.insertId, platform: "android", token: reusableToken, deviceId: "v323-device", active: true, lastSeenAt: new Date() });
    await db.registerPushToken({ userId: seller.insertId, platform: "android", token: reusableToken, deviceId: "v323-device", active: true, lastSeenAt: new Date() });
    check(await scalar<number>(admin, "SELECT userId value FROM device_push_tokens WHERE token=?", [reusableToken]) === seller.insertId, "Token 更新后未绑定当前登录用户");
    check(await db.deactivatePushToken(seller.insertId, { deviceId: "v323-device" }, "集成测试登出") === 1, "登出未解除当前设备 Token");
    check(await scalar<number>(admin, "SELECT active value FROM device_push_tokens WHERE token=?", [reusableToken]) === 0, "Token 解除后仍为 active");
    check((await scalar<string>(admin, "SELECT disabledReason value FROM device_push_tokens WHERE token=?", [reusableToken])) === "集成测试登出", "Token 停用原因未保存");
    await db.registerPushToken({ userId: seller.insertId, platform: "android", token: reusableToken, deviceId: "v323-device", active: true, lastSeenAt: new Date() });
    check(await scalar<number>(admin, "SELECT active value FROM device_push_tokens WHERE token=?", [reusableToken]) === 1, "重新登录未激活已有 Token");
    check(await scalar<string | null>(admin, "SELECT disabledReason value FROM device_push_tokens WHERE token=?", [reusableToken]) == null, "重新注册后停用原因未清理");
    results.push("Push Token 注册、换用户更新、登出解除和重新激活");

    const registry = await import("../server/notifications/registry");
    process.env.PUSH_PROVIDER = "expo";
    registry.resetPushProviderForTests();
    const invalidToken = "invalid-push-token-v323";
    await db.registerPushToken({ userId: buyer.insertId, platform: "android", token: invalidToken, deviceId: "v323-invalid-device", active: true, lastSeenAt: new Date() });
    const invalidNotificationId = await db.createNotification({ userId: buyer.insertId, category: "system", title: "无效 Token 验证", dedupeKey: "v323:invalid-token" });
    check(await scalar<number>(admin, "SELECT active value FROM device_push_tokens WHERE token=?", [invalidToken]) === 0, "Expo Provider 无效 Token 未停用");
    check((await scalar<string>(admin, "SELECT disabledReason value FROM device_push_tokens WHERE token=?", [invalidToken]))?.includes("DeviceNotRegistered") === true, "无效 Token 停用原因不完整");
    check(await scalar<string>(admin, "SELECT status value FROM notification_deliveries WHERE notificationId=? AND channel='push'", [invalidNotificationId]) === "failed", "无效 Token 投递尝试未保存");
    process.env.PUSH_PROVIDER = "log";
    registry.resetPushProviderForTests();
    results.push("Expo 无效 Token 投递失败留痕并自动停用");

    await db.createListing({ itemId, sellerId: buyer.insertId, title: "已出售物品不应重发", modes: ["fixed_price"], primaryMode: "fixed_price", price: 100, status: "published" }).then(
      () => { throw new Error("已出售物品仍可创建发布"); },
      () => undefined,
    );
    results.push("已出售物品禁止再次发布");

    const [offerItem] = await admin.execute<ResultSetHeader>("INSERT INTO items (ownerId,title,status) VALUES (?,?,'listed')", [seller.insertId, "报价并发物品"]);
    const [offerListing] = await admin.execute<ResultSetHeader>("INSERT INTO listings (itemId,sellerId,title,modes,primaryMode,status,itemStatus) VALUES (?,?,?,JSON_ARRAY('accept_offers'),'accept_offers','published','listed')", [offerItem.insertId, seller.insertId, "报价并发物品"]);
    const [offer] = await admin.execute<ResultSetHeader>("INSERT INTO offers (listingId,buyerId,amount,status) VALUES (?,?,100,'submitted')", [offerListing.insertId, buyer.insertId]);
    const accepted = await Promise.allSettled([db.acceptOfferTransaction(offerListing.insertId, offer.insertId, seller.insertId), db.acceptOfferTransaction(offerListing.insertId, offer.insertId, seller.insertId)]);
    check(accepted.filter((entry) => entry.status === "fulfilled").length === 1, "并发接受报价生成多笔订单");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM orders WHERE orderType='listing' AND refId=?", [offerListing.insertId]) === 1, "接受报价订单数量异常");
    results.push("并发接受报价仅成功一次");

    const [giftItem] = await admin.execute<ResultSetHeader>("INSERT INTO items (ownerId,title,status) VALUES (?,?,'listed')", [seller.insertId, "赠送并发物品"]);
    const [giftListing] = await admin.execute<ResultSetHeader>("INSERT INTO listings (itemId,sellerId,title,modes,primaryMode,status,itemStatus) VALUES (?,?,?,JSON_ARRAY('giveaway'),'giveaway','published','listed')", [giftItem.insertId, seller.insertId, "赠送并发物品"]);
    const [application] = await admin.execute<ResultSetHeader>("INSERT INTO giveaway_applications (listingId,applicantId,status) VALUES (?,?,'submitted')", [giftListing.insertId, buyer.insertId]);
    const selected = await Promise.allSettled([db.selectGiveawayApplication(giftListing.insertId, application.insertId, seller.insertId), db.selectGiveawayApplication(giftListing.insertId, application.insertId, seller.insertId)]);
    check(selected.filter((entry) => entry.status === "fulfilled").length === 1, "并发选择赠送人生成多笔订单");
    results.push("并发选择赠送人仅成功一次");

    const recyclingRequestId = await db.createRecyclingRequest({ userId: buyer.insertId, title: "集成回收物品", category: "家电", cityName: "北京", status: "quoting" });
    const recyclingItemId = await scalar<number>(admin, "SELECT itemId value FROM recycling_requests WHERE id=?", [recyclingRequestId]);
    const quoteId = await db.createRecyclingQuote({ requestId: recyclingRequestId, merchantUserId: seller.insertId, amount: 20, status: "submitted" });
    const recyclingOrderId = await db.selectRecyclingQuoteTransaction(recyclingRequestId, quoteId, buyer.insertId);
    await admin.execute("UPDATE orders SET status='pending_acceptance' WHERE id=?", [recyclingOrderId]);
    await db.completeOrderTransaction(recyclingOrderId, seller.insertId);
    check(await scalar<string>(admin, "SELECT status value FROM items WHERE id=?", [recyclingItemId]) === "recycled", "回收完成后 item 未转 recycled");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM item_ownership_history WHERE itemId=? AND transferType='recycled' AND orderId=?", [recyclingItemId, recyclingOrderId]) === 1, "回收所有权历史缺失");
    results.push("回收完成写物品终态与历史");

    const [swapItemA] = await admin.execute<ResultSetHeader>("INSERT INTO items (ownerId,title,status) VALUES (?,?,'reserved')", [seller.insertId, "置换物品甲"]);
    const [swapItemB] = await admin.execute<ResultSetHeader>("INSERT INTO items (ownerId,title,status) VALUES (?,?,'reserved')", [buyer.insertId, "置换物品乙"]);
    const [swapListingA] = await admin.execute<ResultSetHeader>("INSERT INTO listings (itemId,sellerId,title,modes,primaryMode,status,itemStatus) VALUES (?,?,?,JSON_ARRAY('swap'),'swap','reserved','reserved')", [swapItemA.insertId, seller.insertId, "置换物品甲"]);
    await admin.execute("INSERT INTO listings (itemId,sellerId,title,modes,primaryMode,status,itemStatus) VALUES (?,?,?,JSON_ARRAY('swap'),'swap','reserved','reserved')", [swapItemB.insertId, buyer.insertId, "置换物品乙"]);
    const [swapOrder] = await admin.execute<ResultSetHeader>("INSERT INTO orders (orderType,buyerId,sellerId,refId,title,amount,status) VALUES ('listing',?,?,?,?,0,'pending_acceptance')", [buyer.insertId, seller.insertId, swapListingA.insertId, "集成置换订单"]);
    const swapResults = await Promise.allSettled([
      db.completeItemSwapTransaction({ orderId: swapOrder.insertId, firstItemId: swapItemA.insertId, secondItemId: swapItemB.insertId, firstOwnerId: seller.insertId, secondOwnerId: buyer.insertId, actorId: buyer.insertId }),
      db.completeItemSwapTransaction({ orderId: swapOrder.insertId, firstItemId: swapItemA.insertId, secondItemId: swapItemB.insertId, firstOwnerId: seller.insertId, secondOwnerId: buyer.insertId, actorId: buyer.insertId }),
    ]);
    check(swapResults.filter((entry) => entry.status === "fulfilled").length === 1, "置换订单被并发完成多次");
    check(await scalar<number>(admin, "SELECT ownerId value FROM items WHERE id=?", [swapItemA.insertId]) === buyer.insertId, "置换物品甲所有权错误");
    check(await scalar<number>(admin, "SELECT ownerId value FROM items WHERE id=?", [swapItemB.insertId]) === seller.insertId, "置换物品乙所有权错误");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM item_ownership_history WHERE orderId=? AND transferType='swapped'", [swapOrder.insertId]) === 2, "置换所有权记录不完整");
    results.push("置换并发只完成一次且双向转移所有权");

    const [workflowItemA] = await admin.execute<ResultSetHeader>("INSERT INTO items (ownerId,title,status) VALUES (?,?,'listed')", [seller.insertId, "正式置换物品甲"]);
    const [workflowItemB] = await admin.execute<ResultSetHeader>("INSERT INTO items (ownerId,title,status) VALUES (?,?,'listed')", [buyer.insertId, "正式置换物品乙"]);
    const [workflowListingA] = await admin.execute<ResultSetHeader>("INSERT INTO listings (itemId,sellerId,title,swapIntent,modes,primaryMode,status,itemStatus) VALUES (?,?,?,?,JSON_ARRAY('swap'),'swap','published','listed')", [workflowItemA.insertId, seller.insertId, "正式置换物品甲", "希望换乙"]);
    const [workflowListingB] = await admin.execute<ResultSetHeader>("INSERT INTO listings (itemId,sellerId,title,swapIntent,modes,primaryMode,status,itemStatus) VALUES (?,?,?,?,JSON_ARRAY('swap'),'swap','published','listed')", [workflowItemB.insertId, buyer.insertId, "正式置换物品乙", "希望换甲"]);
    const createdSwap = await db.createSwapRequestTransaction({ targetListingId: workflowListingA.insertId, offeredListingId: workflowListingB.insertId, requesterId: buyer.insertId });
    const duplicateSwap = await db.createSwapRequestTransaction({ targetListingId: workflowListingA.insertId, offeredListingId: workflowListingB.insertId, requesterId: buyer.insertId });
    check(createdSwap.request.id === duplicateSwap.request.id && duplicateSwap.duplicate, "重复置换请求未复用活动请求");
    await db.respondSwapRequestTransaction({ requestId: createdSwap.request.id, ownerId: seller.insertId, accept: true });
    const firstConfirmation = await db.confirmSwapRequestTransaction(createdSwap.request.id, buyer.insertId);
    check(!firstConfirmation.completed, "单方确认不应提前完成置换");
    const secondConfirmation = await db.confirmSwapRequestTransaction(createdSwap.request.id, seller.insertId);
    check(secondConfirmation.completed, "双方确认后置换未完成");
    check(await scalar<string>(admin, "SELECT status value FROM swap_requests WHERE id=?", [createdSwap.request.id]) === "completed", "置换请求未进入 completed");
    check(await scalar<number>(admin, "SELECT ownerId value FROM items WHERE id=?", [workflowItemA.insertId]) === buyer.insertId, "正式置换目标物品所有权错误");
    check(await scalar<number>(admin, "SELECT ownerId value FROM items WHERE id=?", [workflowItemB.insertId]) === seller.insertId, "正式置换提供物品所有权错误");
    results.push("置换请求去重、接受和双方确认完整走通");

    const cancellableRequestId = await db.createRecyclingRequest({ userId: buyer.insertId, title: "可取消回收物品", category: "家电", cityName: "北京", status: "quoting" });
    const cancellableItemId = await scalar<number>(admin, "SELECT itemId value FROM recycling_requests WHERE id=?", [cancellableRequestId]);
    const firstQuoteId = await db.createRecyclingQuote({ requestId: cancellableRequestId, merchantUserId: seller.insertId, amount: 30, status: "submitted" });
    await db.declineRecyclingQuoteTransaction(cancellableRequestId, firstQuoteId, buyer.insertId);
    check(await scalar<string>(admin, "SELECT status value FROM recycling_quotes WHERE id=?", [firstQuoteId]) === "not_selected", "回收报价拒绝状态错误");
    await db.createRecyclingQuote({ requestId: cancellableRequestId, merchantUserId: seller.insertId, amount: 25, status: "submitted" });
    await db.cancelRecyclingRequestTransaction(cancellableRequestId, buyer.insertId);
    check(await scalar<string>(admin, "SELECT status value FROM recycling_requests WHERE id=?", [cancellableRequestId]) === "cancelled", "回收询价未取消");
    check(await scalar<string>(admin, "SELECT status value FROM items WHERE id=?", [cancellableItemId]) === "idle", "取消回收后物品未释放");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM recycling_quotes WHERE requestId=? AND status='submitted'", [cancellableRequestId]) === 0, "取消回收后仍残留有效报价");
    results.push("回收报价拒绝和取消释放物品完整走通");

    console.log(`V3.2 MySQL 集成测试通过：${results.length} 项`);
    results.forEach((r, i) => console.log(`${i + 1}. ${r}`));
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``).catch(() => undefined);
    await admin.end();
  }
}
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
