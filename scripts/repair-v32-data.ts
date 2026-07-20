import "dotenv/config";
import mysql from "mysql2/promise";

const REPAIR_RUN_ID = "v32_data_repair";

export async function runV32DataRepair(connection: mysql.Connection) {
  await connection.execute(
    `INSERT INTO migration_runs
      (migrationRunId, migrationVersion, runMode, runSequence, sourceBaseline, sourceChecksum, manifestChecksum, configurationChecksum, status, startedAt, completedAt)
      VALUES (?, 'v3.2.1', 'recovery', 1, 'legacy-v32', ?, ?, ?, 'completed', NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE migrationRunId = migrationRunId`,
    [REPAIR_RUN_ID, "a".repeat(64), "b".repeat(64), "c".repeat(64)],
  );

  await connection.query(`
    INSERT INTO migration_anomalies (migrationVersion,migrationRunId,severity,entityType,entityId,code,fingerprint,handling,detail,detailChecksum)
    SELECT 'v3.2.1',?, 'WARNING','listing',l.id,'missing_valid_mode',
      SHA2(CONCAT('v3.2.1|listing|',l.id,'|missing_valid_mode'),256),
      'MANUAL_REVIEW',
      JSON_OBJECT('primaryMode',l.primaryMode,'action','primary_mode_backfill'),
      SHA2(JSON_OBJECT('primaryMode',l.primaryMode,'action','primary_mode_backfill'),256)
    FROM listings l
    WHERE NOT EXISTS (SELECT 1 FROM listing_modes lm WHERE lm.listingId=l.id AND lm.active=true)
      AND NOT EXISTS (SELECT 1 FROM migration_anomalies ma WHERE ma.migrationVersion='v3.2.1' AND ma.entityType='listing' AND ma.entityId=l.id AND ma.code='missing_valid_mode')
  `, [REPAIR_RUN_ID]);
  await connection.query(`
    INSERT IGNORE INTO listing_modes (listingId,modeCode,active)
    SELECT id,CASE WHEN primaryMode IN ('fixed_price','accept_offers','swap','giveaway','recycle','rental') THEN primaryMode ELSE 'fixed_price' END,true
    FROM listings l WHERE NOT EXISTS (SELECT 1 FROM listing_modes lm WHERE lm.listingId=l.id AND lm.active=true)
  `);
  await connection.query(`
    INSERT INTO item_ownership_history (itemId,fromUserId,toUserId,transferType,note,transferredAt)
    SELECT i.id,NULL,i.ownerId,'created','V3.2.1 修复缺失初始所有权',i.createdAt
    FROM items i WHERE NOT EXISTS (SELECT 1 FROM item_ownership_history h WHERE h.itemId=i.id)
  `);
  await connection.query(`
    INSERT INTO migration_anomalies (migrationVersion,migrationRunId,severity,entityType,entityId,code,fingerprint,handling,detail,detailChecksum)
    SELECT 'v3.2.1',?, 'WARNING','recycling_request',r.id,'missing_item',
      SHA2(CONCAT('v3.2.1|recycling_request|',r.id,'|missing_item'),256),
      'MANUAL_REVIEW',
      JSON_OBJECT('action','manual_review_required'),
      SHA2(JSON_OBJECT('action','manual_review_required'),256)
    FROM recycling_requests r WHERE r.itemId IS NULL
      AND NOT EXISTS (SELECT 1 FROM migration_anomalies ma WHERE ma.migrationVersion='v3.2.1' AND ma.entityType='recycling_request' AND ma.entityId=r.id AND ma.code='missing_item')
  `, [REPAIR_RUN_ID]);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });
  try { await runV32DataRepair(connection); }
  finally { await connection.end(); }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/repair-v32-data.ts")) {
  main().then(() => console.log("V3.2 data repair completed"), (error) => { console.error(error); process.exit(1); });
}
