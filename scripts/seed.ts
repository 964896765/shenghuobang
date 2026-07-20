/**
 * 生活帮可重复演示种子。
 * 只按固定演示手机号和固定演示标题更新/补齐数据，不清库，也不删除用户自行创建的数据。
 */
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import * as dotenv from "dotenv";
import path from "node:path";
import { resolveMysqlUrlFromEnv } from "./lib/mysql-test-config.mjs";
import { hashPassword } from "../server/_core/password";

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
  const connection = await mysql.createConnection(DB_URL);
  console.log("🌱 开始补齐演示种子数据...");
  try {
    await connection.beginTransaction();
    const demoPasswordHash = await hashPassword("Demo123456");
    const [uid1, uid2, uid3, uid4, uid5, uid6] = await Promise.all([
      ensureUser(connection, { phone: "13800000001", name: "张小明" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000002", name: "李工程师" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000003", name: "王工程师" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000004", name: "绿色回收站" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000005", name: "陈老板" }, demoPasswordHash),
      ensureUser(connection, { phone: "13800000006", name: "刘阿姨" }, demoPasswordHash),
    ]);

    const profiles = [
      [uid1, "张小明", "北京", "user", "none", "none", 105],
      [uid2, "李工程师", "北京", "engineer", "active", "none", 118],
      [uid3, "王工程师", "上海", "engineer", "active", "none", 112],
      [uid4, "绿色回收站", "北京", "merchant", "none", "active", 108],
      [uid5, "陈老板", "北京", "merchant", "none", "active", 103],
      [uid6, "刘阿姨", "北京", "user", "none", "none", 100],
    ] as const;
    for (const profile of profiles) {
      await connection.execute(
        `INSERT INTO user_profiles (userId,nickname,cityName,currentRole,engineerStatus,merchantStatus,creditScore)
         VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nickname=VALUES(nickname),cityName=VALUES(cityName),
         currentRole=VALUES(currentRole),engineerStatus=VALUES(engineerStatus),merchantStatus=VALUES(merchantStatus)`,
        [...profile],
      );
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
    await ensureNeed(connection, uid6, "家里空调不制冷,需要维修",
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
    for (const fixture of listingFixtures) {
      const itemId = await ensureItem(connection, { ownerId: fixture.ownerId, title: fixture.title, category: fixture.category, brand: fixture.brand, conditionLevel: fixture.condition, functionStatus: fixture.functionStatus, status: "listed" });
      await ensureListing(connection, { itemId, sellerId: fixture.ownerId, title: fixture.title, category: fixture.category, brand: fixture.brand, conditionLevel: fixture.condition, functionStatus: fixture.functionStatus, description: fixture.description, modes: fixture.modes, primaryMode: fixture.primary, price: fixture.price, minAcceptPrice: fixture.min, giveawayRule: fixture.giveawayRule });
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

    await connection.commit();
    console.log("✅ 演示种子数据已补齐，可安全重复执行");
    console.log(`  用户: ${[uid1, uid2, uid3, uid4, uid5, uid6].join(", ")}`);
    console.log(`  需求: ${nid1}, ${nid3}（另含空调维修演示需求）`);
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
