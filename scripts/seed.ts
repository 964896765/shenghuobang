/**
 * 生活帮可重复演示种子。
 * 只按固定演示手机号和固定演示标题更新/补齐数据，不清库，也不删除用户自行创建的数据。
 */
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import * as dotenv from "dotenv";
import path from "node:path";
import { resolveMysqlUrlFromEnv } from "./lib/mysql-test-config.mjs";
import { hashPassword } from "../server/_core/password";
import { productPassportEventHash } from "../server/services/product-lifecycle-service";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { rawUrl: DB_URL } = resolveMysqlUrlFromEnv({ consumerName: "seed script" });

type DemoUser = { phone: string; name: string };

async function findId(connection: mysql.Connection, sql: string, params: unknown[]) {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(sql, params);
  return rows[0]?.id;
}

async function insertId(connection: mysql.Connection, sql: string, params: unknown[]) {
  const [result] = await connection.execute<ResultSetHeader>(sql, params);
  return Number(result.insertId);
}

async function ensureUser(connection: mysql.Connection, fixture: DemoUser, passwordHash: string) {
  await connection.execute(
    `INSERT INTO users (openId, phone, passwordHash, name, loginMethod)
     VALUES (?,?,?,?, 'phone_password')
     ON DUPLICATE KEY UPDATE passwordHash=VALUES(passwordHash), name=VALUES(name), loginMethod='phone_password'`,
    [`local:${fixture.phone}`, fixture.phone, passwordHash, fixture.name],
  );
  const id = await findId(connection, "SELECT id FROM users WHERE phone=? LIMIT 1", [fixture.phone]);
  if (!id) throw new Error(`无法创建演示用户 ${fixture.phone}`);
  return id;
}

async function ensureNeed(connection: mysql.Connection, creatorId: number, title: string, insertSql: string, params: unknown[]) {
  const existing = await findId(connection, "SELECT id FROM needs WHERE creatorId=? AND title=? ORDER BY id LIMIT 1", [creatorId, title]);
  return existing ?? insertId(connection, insertSql, params);
}

async function ensureItem(connection: mysql.Connection, input: {
  ownerId: number;
  title: string;
  category: string;
  brand?: string;
  conditionLevel: string;
  functionStatus: string;
  status: "listed" | "recycling";
}) {
  const existing = await findId(connection, "SELECT id FROM items WHERE ownerId=? AND title=? ORDER BY id LIMIT 1", [input.ownerId, input.title]);
  if (existing) return existing;
  return insertId(
    connection,
    "INSERT INTO items (ownerId,title,category,brand,conditionLevel,functionStatus,cityName,status) VALUES (?,?,?,?,?,?,? ,?)",
    [input.ownerId, input.title, input.category, input.brand ?? null, input.conditionLevel, input.functionStatus, "北京", input.status],
  );
}

async function ensureListing(connection: mysql.Connection, input: {
  itemId: number;
  sellerId: number;
  title: string;
  category: string;
  brand?: string;
  conditionLevel: string;
  functionStatus: string;
  description: string;
  modes: string[];
  primaryMode: string;
  price?: number;
  minAcceptPrice?: number;
  giveawayRule?: string;
}) {
  let id = await findId(connection, "SELECT id FROM listings WHERE sellerId=? AND title=? ORDER BY id LIMIT 1", [input.sellerId, input.title]);
  if (!id) {
    id = await insertId(
      connection,
      `INSERT INTO listings
       (itemId,sellerId,title,category,brand,conditionLevel,functionStatus,description,cityName,modes,primaryMode,price,minAcceptPrice,giveawayRule,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published')`,
      [input.itemId, input.sellerId, input.title, input.category, input.brand ?? null, input.conditionLevel, input.functionStatus,
        input.description, "北京", JSON.stringify(input.modes), input.primaryMode, input.price ?? null, input.minAcceptPrice ?? null, input.giveawayRule ?? null],
    );
  } else {
    await connection.execute("UPDATE listings SET itemId=COALESCE(itemId, ?) WHERE id=?", [input.itemId, id]);
  }

  await connection.execute(
    `INSERT INTO item_ownership_history (itemId,fromUserId,toUserId,transferType,note)
     SELECT ?,NULL,?,'created','演示种子创建' FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM item_ownership_history WHERE itemId=? AND transferType='created')`,
    [input.itemId, input.sellerId, input.itemId],
  );
  await connection.execute(
    `INSERT INTO item_status_logs (itemId,toStatus,operatorId,reason)
     SELECT ?,'listed',?,'演示种子发布' FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM item_status_logs WHERE itemId=? AND reason='演示种子发布')`,
    [input.itemId, input.sellerId, input.itemId],
  );
  for (const mode of input.modes) {
    await connection.execute(
      "INSERT INTO listing_modes (listingId,modeCode,active) VALUES (?,?,true) ON DUPLICATE KEY UPDATE active=true",
      [id, mode],
    );
  }
  return id;
}

async function main() {
  const databaseUrl = new URL(DB_URL);
  databaseUrl.searchParams.set("timezone", "Z");
  const connection = await mysql.createConnection(databaseUrl.toString());
  console.log("🌱 开始补齐演示种子数据...");
  try {
    await connection.beginTransaction();
    const demoPasswordHash = await hashPassword("Demo123456");
    const [uid1, uid2, uid3, uid4, uid5, uid6, uid7] = await Promise.all([
      ensureUser(connection, { phone: "13800000001", name: "张小明" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000002", name: "李工程师" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000003", name: "王工程师" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000004", name: "绿色回收站" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000005", name: "陈老板" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000006", name: "刘阿姨" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000007", name: "安心家居企业号" }, demoPasswordHash),
    ]);

    const profiles = [
      [uid1, "张小明", "北京", "user", "none", "none", 105],
      [uid2, "李工程师", "北京", "engineer", "active", "none", 118],
      [uid3, "王工程师", "上海", "engineer", "active", "none", 112],
      [uid4, "绿色回收站", "北京", "merchant", "none", "active", 108],
      [uid5, "陈老板", "北京", "merchant", "none", "active", 103],
      [uid6, "刘阿姨", "北京", "user", "none", "none", 100],
      [uid7, "安心家居企业号", "北京", "merchant", "none", "active", 115],
    ] as const;
    for (const profile of profiles) {
      await connection.execute(
        `INSERT INTO user_profiles (userId,nickname,cityName,currentRole,engineerStatus,merchantStatus,creditScore)
         VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nickname=VALUES(nickname),cityName=VALUES(cityName),
         currentRole=VALUES(currentRole),engineerStatus=VALUES(engineerStatus),merchantStatus=VALUES(merchantStatus)`,
        [...profile],
      );
    }

    for (const [accountId, identityCode, displayName] of [
      [uid7, "enterprise_representative", "安心家居企业代表"],
      [uid2, "repair_provider", "李师傅维修服务"],
    ] as const) {
      const identityTypeId = await findId(connection, "SELECT id FROM identity_types WHERE code=? AND status='active' LIMIT 1", [identityCode]);
      if (identityTypeId) {
        await connection.execute(
          `INSERT INTO business_identities (accountId,identityTypeId,status,source,createdBy)
           VALUES (?,?,'active','platform',?) ON DUPLICATE KEY UPDATE status='active'`,
          [accountId, identityTypeId, accountId],
        );
        const identityId = await findId(connection, "SELECT id FROM business_identities WHERE accountId=? AND identityTypeId=? LIMIT 1", [accountId, identityTypeId]);
        if (identityId) {
          await connection.execute(
            `INSERT INTO identity_profiles (identityId,displayName,introduction,cityName,profileData)
             VALUES (?,?,?,'北京',?) ON DUPLICATE KEY UPDATE displayName=VALUES(displayName),introduction=VALUES(introduction),profileData=VALUES(profileData)`,
            [identityId, displayName, "可运行产品雏形演示身份", JSON.stringify({ demo: true })],
          );
        }
      }
    }

    for (const engineer of [
      [uid2, "李建国", "资深全栈工程师", "软件开发", 8, "8年全栈开发经验，注重代码质量和用户体验。", ["React", "Node.js", "TypeScript", "MySQL"], "北京", 1, 0, 3000, "professional", 47, 23],
      [uid3, "王志远", "智能家居/嵌入式工程师", "嵌入式/硬件", 5, "专注智能家居和嵌入式开发，可上门安装调试。", ["Arduino", "ESP32", "智能家居", "Python"], "上海", 1, 1, 1500, "basic", 44, 11],
    ] as const) {
      await connection.execute(
        `INSERT INTO engineer_profiles (userId,realName,professionalTitle,primaryCategory,yearsOfExperience,introduction,skills,cityName,supportsRemote,supportsOnsite,startingPrice,verificationLevel,rating,completedProjects)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE realName=VALUES(realName),professionalTitle=VALUES(professionalTitle),
         primaryCategory=VALUES(primaryCategory),yearsOfExperience=VALUES(yearsOfExperience),introduction=VALUES(introduction),skills=VALUES(skills),cityName=VALUES(cityName)`,
        [...engineer.slice(0, 6), JSON.stringify(engineer[6]), ...engineer.slice(7)],
      );
    }

    for (const merchant of [
      [uid4, "绿色家园回收站", ["家电回收", "家具回收", "综合回收"], "专业上门回收旧家电和旧家具。", "北京", "朝阳区望京街道演示地址", 1, 46, 87],
      [uid5, "陈氏数码回收", ["数码回收", "家电回收"], "回收旧手机、平板和笔记本电脑。", "北京", "海淀区中关村演示地址", 1, 44, 52],
    ] as const) {
      await connection.execute(
        `INSERT INTO merchant_profiles (userId,name,categories,description,cityName,addressText,supportsHomeService,rating,completedOrders)
         VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),categories=VALUES(categories),description=VALUES(description),cityName=VALUES(cityName),addressText=VALUES(addressText)`,
        [merchant[0], merchant[1], JSON.stringify(merchant[2]), ...merchant.slice(3)],
      );
    }

    for (const verification of [
      [uid2, "李建国", "资深全栈工程师", "软件开发", 8, ["React", "Node.js", "TypeScript"]],
      [uid3, "王志远", "智能家居/嵌入式工程师", "嵌入式/硬件", 5, ["Arduino", "ESP32", "智能家居"]],
    ] as const) {
      await connection.execute(
        `INSERT INTO engineer_verifications (userId,realName,professionalTitle,primaryCategory,yearsOfExperience,introduction,skills,status,reviewedAt)
         SELECT ?,?,?,?,?, '演示工程师认证资料',?,'approved',NOW() FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM engineer_verifications WHERE userId=? AND status='approved')`,
        [verification[0], verification[1], verification[2], verification[3], verification[4], JSON.stringify(verification[5]), verification[0]],
      );
    }
    for (const verification of [
      [uid4, "绿色家园回收站", ["家电回收", "家具回收", "综合回收"]],
      [uid5, "陈氏数码回收", ["数码回收", "家电回收"]],
    ] as const) {
      await connection.execute(
        `INSERT INTO merchant_verifications (userId,merchantName,categories,description,addressText,status,reviewedAt)
         SELECT ?,?,?,'演示商家认证资料','演示地址','approved',NOW() FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM merchant_verifications WHERE userId=? AND status='approved')`,
        [verification[0], verification[1], JSON.stringify(verification[2]), verification[0]],
      );
    }

    const nid1 = await ensureNeed(connection, uid1, "需要开发一个家庭记账小程序",
      `INSERT INTO needs (creatorId,needType,title,originalDescription,structuredData,category,budgetMin,budgetMax,expectedDeadline,cityName,supportsRemote,status,supportCount,publishedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uid1, "software", "需要开发一个家庭记账小程序", "希望做一个多人共享的家庭记账小程序。", JSON.stringify({ target: "家庭多人共享记账", expectation: "多人协作、分类统计和月度报表" }), "软件开发", 5000, 15000, "1个月内", "北京", 1, "collecting_solutions", 12, new Date(Date.now() - 3 * 86400000)]);
    const repairNeedId = await ensureNeed(connection, uid6, "家里空调不制冷,需要维修",
      `INSERT INTO needs (creatorId,needType,title,originalDescription,structuredData,category,budgetMin,budgetMax,cityName,requiresOnsite,status,supportCount,publishedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uid6, "repair", "家里空调不制冷,需要维修", "空调开机但不制冷。", JSON.stringify({ target: "恢复空调制冷", recommendedProfession: "家电维修技师" }), "家电维修", 200, 800, "北京", 1, "published", 5, new Date(Date.now() - 86400000)]);
    const nid3 = await ensureNeed(connection, uid1, "想给老人房间安装智能门锁和摄像头",
      `INSERT INTO needs (creatorId,needType,title,originalDescription,structuredData,category,budgetMin,budgetMax,cityName,requiresOnsite,status,supportCount,publishedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uid1, "life", "想给老人房间安装智能门锁和摄像头", "需要上门安装并完成远程查看设置。", JSON.stringify({ target: "老人居家安全", expectation: "门锁和摄像头远程查看" }), "智能家居", 1000, 3000, "北京", 1, "selecting_quote", 8, new Date(Date.now() - 5 * 86400000)]);

    for (const solution of [
      [nid1, uid2, "家庭记账需要多人协作和数据同步。", "使用微信小程序与云数据库实现。"],
      [nid3, uid3, "老人居家安防需要简单可靠。", "确认网络和门体后上门安装调试。"],
    ] as const) {
      await connection.execute(
        `INSERT INTO solutions (needId,providerId,providerType,understanding,approach,status)
         SELECT ?,?,'engineer',?,?,'visible' FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM solutions WHERE needId=? AND providerId=?)`,
        [solution[0], solution[1], solution[2], solution[3], solution[0], solution[1]],
      );
    }

    for (const quote of [
      [nid1, uid2, 8800, 25, "完整小程序源码、管理后台、部署和文档", "不含平台认证与云资源费用", "30%预付,70%验收后付", 3, 60, 7],
      [nid3, uid3, 1800, 1, "上门安装并配置远程访问", "不含设备费用", "完成后付全款", 1, 30, 5],
    ] as const) {
      let quoteId = await findId(connection, "SELECT id FROM quotes WHERE needId=? AND engineerId=? ORDER BY id LIMIT 1", [quote[0], quote[1]]);
      if (!quoteId) {
        quoteId = await insertId(connection,
          `INSERT INTO quotes (needId,engineerId,totalPrice,durationDays,deliverables,exclusions,paymentTerms,revisionCount,supportDays,validDays,status,expiresAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,'submitted',?)`, [...quote, new Date(Date.now() + quote[9] * 86400000)]);
      }
      await connection.execute(
        `INSERT IGNORE INTO quote_versions (quoteId,versionNo,totalPrice,durationDays,understanding,deliverables,exclusions,paymentTerms,revisionCount,supportDays,validDays,changeNote,createdBy)
         VALUES (?,1,?,?, '演示需求理解',?,?,?,?,?,?,'首次提交',?)`,
        [quoteId, quote[2], quote[3], quote[4], quote[5], quote[6], quote[7], quote[8], quote[9], quote[1]],
      );
      await connection.execute("UPDATE quotes q SET currentVersionId=(SELECT id FROM quote_versions WHERE quoteId=q.id AND versionNo=1 LIMIT 1) WHERE q.id=? AND q.currentVersionId IS NULL", [quoteId]);
    }

    const listingFixtures = [
      { ownerId: uid1, title: "九成新 iPhone 13 Pro 256G 远峰蓝", category: "手机数码", brand: "Apple", condition: "九成新", functionStatus: "功能正常", description: "自用一年，无磕碰，配件齐全。", modes: ["fixed_price", "accept_offers"], primary: "fixed_price", price: 3800, min: 3500 },
      { ownerId: uid6, title: "免费赠送:旧书一箱(约50本)", category: "图书", condition: "七成新", functionStatus: "功能正常", description: "搬家整理的旧书，需要自取。", modes: ["giveaway"], primary: "giveaway", giveawayRule: "first_come" },
      { ownerId: uid1, title: "宜家 KALLAX 书柜,白色 2x4格", category: "家具", brand: "宜家", condition: "八成新", functionStatus: "功能正常", description: "搬家出售，需要自提。", modes: ["fixed_price", "accept_offers"], primary: "fixed_price", price: 280 },
    ];
    const listingIds: number[] = [];
    const listingItemIds: number[] = [];
    for (const fixture of listingFixtures) {
      const itemId = await ensureItem(connection, { ownerId: fixture.ownerId, title: fixture.title, category: fixture.category, brand: fixture.brand, conditionLevel: fixture.condition, functionStatus: fixture.functionStatus, status: "listed" });
      listingItemIds.push(itemId);
      listingIds.push(await ensureListing(connection, { itemId, sellerId: fixture.ownerId, title: fixture.title, category: fixture.category, brand: fixture.brand, conditionLevel: fixture.condition, functionStatus: fixture.functionStatus, description: fixture.description, modes: fixture.modes, primaryMode: fixture.primary, price: fixture.price, minAcceptPrice: fixture.min, giveawayRule: fixture.giveawayRule }));
    }

    const productFixtures = [
      { publicCode: "DEMO-PHONE-13P", name: "可信二手 iPhone 13 Pro", category: "phone", brand: "Apple", model: "A2639", listingId: listingIds[0], itemId: listingItemIds[0] },
      { publicCode: "DEMO-BOOK-BOX", name: "社区共享图书箱", category: "book", brand: "社区共益", model: "BOX-50", listingId: listingIds[1], itemId: listingItemIds[1] },
      { publicCode: "DEMO-KALLAX-24", name: "KALLAX 2x4 格书柜", category: "furniture", brand: "IKEA", model: "KALLAX-24", listingId: listingIds[2], itemId: listingItemIds[2] },
    ] as const;
    const productIds: number[] = [];
    const unitIds: number[] = [];
    for (const [index, product] of productFixtures.entries()) {
      await connection.execute(
        `INSERT INTO product_models (publicCode,ownerAccountId,name,summary,description,categoryCode,brandName,modelCode,specifications,visibility,status,createdRequestId,lastRequestId,publishedAt)
         VALUES (?,?,?,?,?,?,?,?,?,'public','active',?,?,NOW())
         ON DUPLICATE KEY UPDATE name=VALUES(name),summary=VALUES(summary),description=VALUES(description),specifications=VALUES(specifications),visibility='public',status='active'`,
        [product.publicCode, uid7, product.name, `${product.name}演示产品目录`, "用于内容、追溯与商城闭环演示。", product.category, product.brand, product.model,
          JSON.stringify({ demo: true, quality: "verified_sample" }), `seed-product-create-${index + 1}`, `seed-product-last-${index + 1}`],
      );
      const productId = await findId(connection, "SELECT id FROM product_models WHERE publicCode=? LIMIT 1", [product.publicCode]);
      if (!productId) throw new Error(`无法创建演示产品 ${product.publicCode}`);
      productIds.push(productId);
      await connection.execute(
        `INSERT INTO listing_product_links (listingId,productModelId,linkedByAccountId,requestId)
         VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE productModelId=VALUES(productModelId),linkedByAccountId=VALUES(linkedByAccountId)`,
        [product.listingId, productId, product.listingId === listingIds[1] ? uid6 : uid1, `seed-listing-product-${index + 1}`],
      );
      if (index < 2) {
        const unitCode = index === 0 ? "DEMO-UNIT-PHONE-001" : "DEMO-UNIT-BOOK-001";
        await connection.execute(
          `INSERT INTO product_units (productModelId,linkedItemId,currentOwnerAccountId,publicCode,serialNumber,batchCode,status,trustLevel,passportVisibility,createdRequestId,lastRequestId,manufacturedAt)
           VALUES (?,?,?,?,?,?,'listed','verified','public',?,?,DATE_SUB(NOW(),INTERVAL 1 YEAR))
           ON DUPLICATE KEY UPDATE productModelId=VALUES(productModelId),currentOwnerAccountId=VALUES(currentOwnerAccountId),passportVisibility='public'`,
          [productId, product.itemId, index === 0 ? uid1 : uid6, unitCode, `SN-DEMO-${index + 1}`, "DEMO-2026", `seed-unit-create-${index + 1}`, `seed-unit-last-${index + 1}`],
        );
        const unitId = await findId(connection, "SELECT id FROM product_units WHERE publicCode=? LIMIT 1", [unitCode]);
        if (!unitId) throw new Error(`无法创建演示产品单元 ${unitCode}`);
        unitIds.push(unitId);
        const requestId = `seed-passport-${index + 1}`;
        const detail = { statement: "演示产品单元注册", demo: true };
        const occurredAt = new Date("2025-01-01T00:00:00.000Z");
        const eventHash = productPassportEventHash({
          productUnitId: unitId,
          sequenceNumber: 1,
          eventType: "registered",
          actorAccountId: uid7,
          actorOrganizationId: null,
          fromStatus: null,
          toStatus: "registered",
          visibility: "public",
          sourceType: "seed",
          sourceId: unitCode,
          requestId,
          detail,
          previousEventHash: null,
          occurredAt,
        });
        await connection.execute(
          `INSERT INTO product_passport_events
             (productUnitId,sequenceNumber,eventType,actorAccountId,actorOrganizationId,fromStatus,toStatus,visibility,sourceType,sourceId,requestId,detail,previousEventHash,eventHash,occurredAt)
           VALUES (?,1,'registered',?,NULL,NULL,'registered','public','seed',?,?,?,NULL,?,?)
           ON DUPLICATE KEY UPDATE
             actorAccountId=VALUES(actorAccountId),actorOrganizationId=NULL,fromStatus=NULL,toStatus='registered',
             visibility='public',sourceType='seed',sourceId=VALUES(sourceId),detail=VALUES(detail),
             previousEventHash=NULL,eventHash=VALUES(eventHash),occurredAt=VALUES(occurredAt)`,
          [unitId, uid7, unitCode, requestId, JSON.stringify(detail), eventHash, occurredAt],
        );
        await connection.execute("UPDATE listing_product_links SET productUnitId=? WHERE listingId=?", [unitId, product.listingId]);
      }
    }

    const skuFixtures = [
      [listingIds[0], "PHONE-BLUE-256", "远峰蓝 256G", { color: "远峰蓝", storage: "256G" }, 3800, 3],
      [listingIds[0], "PHONE-SILVER-256", "银色 256G", { color: "银色", storage: "256G" }, 3900, 2],
      [listingIds[1], "BOOK-MIX-50", "综合图书约 50 本", { category: "综合", count: "约50本" }, 0, 1],
      [listingIds[2], "KALLAX-WHITE-24", "白色 2x4 格", { color: "白色", size: "2x4格" }, 280, 2],
    ] as const;
    const skuIds: number[] = [];
    for (const [index, sku] of skuFixtures.entries()) {
      await connection.execute(
        `INSERT INTO listing_skus (listingId,skuCode,title,attributes,price,stock,status,createdRequestId,lastRequestId)
         VALUES (?,?,?,?,?,?,'active',?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),attributes=VALUES(attributes),price=VALUES(price),stock=GREATEST(stock,VALUES(stock)),status='active'`,
        [sku[0], sku[1], sku[2], JSON.stringify(sku[3]), sku[4], sku[5], `seed-sku-create-${index + 1}`, `seed-sku-last-${index + 1}`],
      );
      const skuId = await findId(connection, "SELECT id FROM listing_skus WHERE listingId=? AND skuCode=? LIMIT 1", [sku[0], sku[1]]);
      if (!skuId) throw new Error(`无法创建演示 SKU ${sku[1]}`);
      skuIds.push(skuId);
    }

    const recyclingTitle = "旧洗衣机回收(海尔滚筒,2016年)";
    const recyclingItemId = await ensureItem(connection, { ownerId: uid6, title: recyclingTitle, category: "家电", conditionLevel: "老旧", functionStatus: "可运行但噪音大", status: "recycling" });
    await connection.execute(
      `INSERT INTO item_ownership_history (itemId,fromUserId,toUserId,transferType,note)
       SELECT ?,NULL,?,'created','由演示回收询价创建' FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM item_ownership_history WHERE itemId=? AND transferType='created')`,
      [recyclingItemId, uid6, recyclingItemId],
    );
    await connection.execute(
      `INSERT INTO item_status_logs (itemId,toStatus,operatorId,reason)
       SELECT ?,'recycling',?,'演示回收询价' FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM item_status_logs WHERE itemId=? AND reason='演示回收询价')`,
      [recyclingItemId, uid6, recyclingItemId],
    );
    await connection.execute(
      `INSERT INTO recycling_requests (itemId,userId,title,category,conditionDesc,cityName,expectedPrice,status)
       SELECT ?,?,?, '家电','能正常使用但噪音较大。','北京',200,'quoting' FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM recycling_requests WHERE userId=? AND title=?)`,
      [recyclingItemId, uid6, recyclingTitle, uid6, recyclingTitle],
    );

    const contentFixtures = [
      ["DEMO-CONTENT-REVIEW-1", uid1, "product_review", "iPhone 13 Pro 一年真实体验", "电池、影像和日常流畅度的长期体验", "连续使用一年后，系统依然流畅，影像稳定；电池健康需要按真实使用强度评估。", "北京", "personal_experience", "作者本人长期使用记录"],
      ["DEMO-CONTENT-REVIEW-2", uid6, "product_review", "共享图书箱领取体验", "一次真实的社区赠送与循环使用记录", "领取过程清晰，图书状况与发布描述一致，我会在阅读后继续把图书分享给邻居。", "北京", "personal_experience", "领取人真实体验"],
      ["DEMO-CONTENT-POST-1", uid1, "post", "旧手机进入可信流转的第一天", "从产品身份到商品发布均保留关联", "我先核对产品型号和序列号，再把具体 ProductUnit 关联到商品，买家可以分别查看内容、产品定义和追溯事实。", "北京", "personal_experience", "作者实操记录"],
      ["DEMO-CONTENT-POST-2", uid7, "post", "安心家居产品透明说明", "企业官方内容不等同于平台验证", "这是企业账号对演示产品材料、使用范围和服务边界的公开说明，平台验证状态请以产品护照事实区为准。", "北京", "organization_official", "安心家居企业公开说明"],
      ["DEMO-CONTENT-VIDEO-1", uid2, "video", "空调不制冷的三步安全检查", "先断电、查滤网、记录故障现象", "本视频内容演示维修前的安全检查。涉及拆机、制冷剂或电路操作时，请联系具备资质的维修服务者。", "北京", "service_case", "李师傅维修服务案例整理"],
      ["DEMO-CONTENT-IDEA-1", uid1, "idea_progress", "共享家电档案创意进展 01", "已完成需求访谈与首版产品身份字段", "本周完成三位家庭用户访谈，下一步验证维修记录由谁提交、如何让所有者确认。", "北京", "personal_experience", "创意发起人阶段记录"],
      ["DEMO-CONTENT-REPAIR-1", uid2, "repair_case", "空调不制冷：滤网堵塞维修案例", "经授权公开的服务过程，不包含客户精确地址", "现场检查确认滤网严重堵塞，清洁并复测后出风温差恢复正常。未更换零件，服务记录与产品事实分开保存。", "北京", "service_case", "服务者脱敏案例记录"],
    ] as const;
    const contentIds: number[] = [];
    for (const [index, post] of contentFixtures.entries()) {
      await connection.execute(
        `INSERT INTO content_posts (publicCode,authorAccountId,contentType,title,summary,body,locationLabel,visibility,sourceType,sourceStatement,allowComments,status,createdRequestId,lastRequestId,publishedAt)
         VALUES (?,?,?,?,?,?,?,'public',?,?,true,'published',?,?,DATE_SUB(NOW(),INTERVAL ? DAY))
         ON DUPLICATE KEY UPDATE title=VALUES(title),summary=VALUES(summary),body=VALUES(body),visibility='public',status='published',sourceStatement=VALUES(sourceStatement)`,
        [post[0], post[1], post[2], post[3], post[4], post[5], post[6], post[7], post[8], `seed-content-create-${index + 1}`, `seed-content-last-${index + 1}`, 7 - index],
      );
      const postId = await findId(connection, "SELECT id FROM content_posts WHERE publicCode=? LIMIT 1", [post[0]]);
      if (!postId) throw new Error(`无法创建演示内容 ${post[0]}`);
      contentIds.push(postId);
      await connection.execute(
        `INSERT INTO content_metrics (postId,viewCount,likeCount,favoriteCount,commentCount,shareCount,productClickCount,listingClickCount,ideaClickCount)
         VALUES (?,?,?,?,?,0,0,0,0) ON DUPLICATE KEY UPDATE viewCount=VALUES(viewCount),likeCount=VALUES(likeCount),favoriteCount=VALUES(favoriteCount),commentCount=VALUES(commentCount)`,
        [postId, 80 + index * 17, index < 2 ? 6 : 3, index < 2 ? 2 : 1, index === 0 ? 1 : 0],
      );
    }
    for (const [postId, productId, label, creator] of [
      [contentIds[0], productIds[0], productFixtures[0].name, uid1],
      [contentIds[1], productIds[1], productFixtures[1].name, uid6],
      [contentIds[2], productIds[0], productFixtures[0].name, uid1],
      [contentIds[3], productIds[2], productFixtures[2].name, uid7],
    ] as const) {
      await connection.execute(
        `INSERT INTO content_relations (postId,relationType,relationId,relationLabel,createdByAccountId)
         VALUES (?,'product',?,?,?) ON DUPLICATE KEY UPDATE relationLabel=VALUES(relationLabel)`,
        [postId, productId, label, creator],
      );
    }
    await connection.execute(
      `INSERT INTO content_relations (postId,relationType,relationId,relationLabel,createdByAccountId)
       VALUES (?,'repair',?,'家里空调不制冷,需要维修',?) ON DUPLICATE KEY UPDATE relationLabel=VALUES(relationLabel)`,
      [contentIds[6], repairNeedId, uid2],
    );
    await connection.execute(
      `INSERT INTO content_interactions (postId,accountId,interactionType,active,requestId)
       VALUES (? ,?,'like',true,'seed-like-1'),(? ,?,'favorite',true,'seed-favorite-1')
       ON DUPLICATE KEY UPDATE active=true`,
      [contentIds[0], uid6, contentIds[0], uid6],
    );
    await connection.execute(
      `INSERT INTO content_comments (postId,authorAccountId,body,status,requestId)
       VALUES (?,?,'这个长期体验对我选择成色和容量很有帮助。','published','seed-comment-1')
       ON DUPLICATE KEY UPDATE body=VALUES(body),status='published'`,
      [contentIds[0], uid6],
    );
    await connection.execute(
      `INSERT INTO content_follows (followerAccountId,followedAccountId,active,requestId)
       VALUES (?, ?, true, 'seed-follow-1') ON DUPLICATE KEY UPDATE active=true`,
      [uid6, uid1],
    );
    for (const [accountId, name, count] of [[uid1, "张小明", 3], [uid2, "李师傅维修服务", 2], [uid7, "安心家居企业号", 1], [uid6, "刘阿姨", 1]] as const) {
      await connection.execute(
        `INSERT INTO creator_profiles (accountId,displayName,bio,publishedCount,followerCount,followingCount,totalViewCount,totalLikeCount,totalFavoriteCount,totalCommentCount,productClickCount,ideaClickCount,listingClickCount)
         VALUES (?,?,?, ?,0,0,100,6,2,1,2,0,1)
         ON DUPLICATE KEY UPDATE displayName=VALUES(displayName),bio=VALUES(bio),publishedCount=VALUES(publishedCount)`,
        [accountId, name, "可运行产品雏形演示创作者", count],
      );
    }

    await connection.execute(
      `INSERT INTO shopping_carts (buyerAccountId,status,activeDedupeKey)
       VALUES (?,'active',?) ON DUPLICATE KEY UPDATE status='active'`,
      [uid6, `active:${uid6}`],
    );
    const cartId = await findId(connection, "SELECT id FROM shopping_carts WHERE activeDedupeKey=? LIMIT 1", [`active:${uid6}`]);
    if (!cartId) throw new Error("无法创建演示购物车");
    await connection.execute(
      `INSERT INTO shopping_cart_items (cartId,skuId,quantity,lastRequestId)
       VALUES (?,?,1,'seed-cart-item-1') ON DUPLICATE KEY UPDATE quantity=1,lastRequestId=VALUES(lastRequestId)`,
      [cartId, skuIds[3]],
    );
    await connection.execute(
      `INSERT INTO orders (orderType,buyerId,sellerId,refId,title,amount,status,paidAt,completedAt,buyerReviewed)
       SELECT 'listing',?,?,?,'[演示] iPhone 13 Pro 商城订单',3800,'completed',DATE_SUB(NOW(),INTERVAL 2 DAY),DATE_SUB(NOW(),INTERVAL 1 DAY),true FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM orders WHERE buyerId=? AND title='[演示] iPhone 13 Pro 商城订单')`,
      [uid6, uid1, listingIds[0], uid6],
    );
    const orderId = await findId(connection, "SELECT id FROM orders WHERE buyerId=? AND title='[演示] iPhone 13 Pro 商城订单' LIMIT 1", [uid6]);
    if (!orderId) throw new Error("无法创建演示订单");
    await connection.execute(
      `INSERT INTO order_line_items (orderId,listingId,skuId,skuCode,title,attributes,quantity,unitPrice,lineAmount,productModelId,productUnitId)
       VALUES (?,?,?,?,?,?,1,3800,3800,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title)`,
      [orderId, listingIds[0], skuIds[0], skuFixtures[0][1], skuFixtures[0][2], JSON.stringify(skuFixtures[0][3]), productIds[0], unitIds[0]],
    );
    await connection.execute(
      `INSERT INTO payments (paymentNo,orderId,payerId,amount,currency,provider,providerTransactionNo,status,idempotencyKey,paidAt)
       VALUES ('PAY-DEMO-COMMERCE-001',?,?,3800.00,'CNY','sandbox','SBX-DEMO-COMMERCE-001','success','seed-payment-success-1',DATE_SUB(NOW(),INTERVAL 2 DAY))
       ON DUPLICATE KEY UPDATE status='success',provider='sandbox',paidAt=VALUES(paidAt)`,
      [orderId, uid6],
    );
    const paymentId = await findId(connection, "SELECT id FROM payments WHERE paymentNo='PAY-DEMO-COMMERCE-001' LIMIT 1", []);
    if (!paymentId) throw new Error("无法创建演示沙箱支付单");
    await connection.execute(
      `INSERT INTO payment_attempts (paymentId,attemptNo,provider,providerRequestId,status,requestData,responseData,completedAt)
       VALUES (?,1,'sandbox','seed-payment-attempt-1','success',?, ?,DATE_SUB(NOW(),INTERVAL 2 DAY))
       ON DUPLICATE KEY UPDATE status='success',responseData=VALUES(responseData),completedAt=VALUES(completedAt)`,
      [paymentId, JSON.stringify({ demo: true }), JSON.stringify({ providerTransactionNo: "SBX-DEMO-COMMERCE-001" })],
    );
    await connection.execute(
      `INSERT INTO payment_events (paymentId,eventType,amount,currency,externalEventNo,detail)
       VALUES (?,'payment_succeeded',3800.00,'CNY','seed-payment-event-1',?) ON DUPLICATE KEY UPDATE detail=VALUES(detail)`,
      [paymentId, JSON.stringify({ provider: "sandbox", demo: true })],
    );
    await connection.execute(
      `INSERT INTO reviews (orderId,reviewerId,revieweeId,overallRating,dimensions,tags,imageFileIds,content,businessSource,impactDimension,requestId)
       VALUES (?,?,?,5,?,?,'[]','商品与描述一致，支付、物流和产品关联都清楚。','order:listing','trade_reliability','seed-order-review-1')
       ON DUPLICATE KEY UPDATE overallRating=5,content=VALUES(content),tags=VALUES(tags)`,
      [orderId, uid6, uid1, JSON.stringify({ description: 5, delivery: 5 }), JSON.stringify(["描述准确", "交付及时"])],
    );
    const reviewId = await findId(connection, "SELECT id FROM reviews WHERE reviewerId=? AND requestId='seed-order-review-1' LIMIT 1", [uid6]);
    await connection.execute(
      `INSERT INTO credit_events (userId,actorAccountId,eventType,scoreChange,reason,businessSource,impactDimension,refType,refId,requestId)
       VALUES (?,?,'review_received',1,'收到5星演示评价','order:listing','trade_reliability','review',?,'credit:seed-order-review-1')
       ON DUPLICATE KEY UPDATE reason=VALUES(reason)`,
      [uid1, uid6, reviewId ?? null],
    );

    await connection.commit();
    console.log("✅ 演示种子数据已补齐，可安全重复执行");
    console.log(`  用户: ${[uid1, uid2, uid3, uid4, uid5, uid6, uid7].join(", ")}`);
    console.log(`  需求: ${nid1}, ${nid3}（另含空调维修演示需求）`);
    console.log(`  产品: ${productIds.join(", ")}；产品单元: ${unitIds.join(", ")}；内容: ${contentIds.join(", ")}；订单: ${orderId}`);
    console.log("  演示密码: Demo123456");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().then(() => process.exit(0), (error) => {
  console.error("❌ 种子数据写入失败:", error);
  process.exit(1);
});
