-- Dedicated deterministic import run for anomaly rows created before A2.1.
-- This run is failed, never completed, when any imported anomaly is BLOCKING.
INSERT INTO `migration_runs` (
  `migrationRunId`,
  `migrationVersion`,
  `runMode`,
  `parentMigrationRunId`,
  `runSequence`,
  `sourceBaseline`,
  `sourceChecksum`,
  `manifestChecksum`,
  `configurationChecksum`,
  `status`,
  `startedAt`,
  `processedCount`,
  `succeededCount`,
  `failedCount`,
  `skippedCount`,
  `version`
) VALUES (
  'v33a2-20260719T000000000Z-8eb607c9930b',
  'v3.3-a2.0.0',
  'migrate',
  NULL,
  1,
  'v3.2.4+migrations-0000-0014',
  'ab799d4d12573da833d484492385425758f0f954a50c2dd1a9abeba7122b9952',
  '95d0178c6e304247b4ba9d7370f21831026e7b6e08e93aaec7bebd9ecb2fb983',
  'ad8bb33b3da02ad6dcfd70a5fb677fd54107c4c183c1c088a6c23923c625a4e0',
  'running',
  '2026-07-19 00:00:00.000',
  0,
  0,
  0,
  0,
  1
) AS new
ON DUPLICATE KEY UPDATE `migrationRunId` = `migration_runs`.`migrationRunId`;
--> statement-breakpoint
UPDATE `migration_anomalies`
SET
  `migrationRunId` = COALESCE(
    `migrationRunId`,
    'v33a2-20260719T000000000Z-8eb607c9930b'
  ),
  `severity` = CASE `code`
    WHEN 'orphan_user' THEN 'BLOCKING'
    WHEN 'cancelled_default_idle' THEN 'INFO'
    WHEN 'missing_valid_mode' THEN 'WARNING'
    WHEN 'missing_item' THEN 'BLOCKING'
    ELSE 'BLOCKING'
  END,
  `handling` = CASE `code`
    WHEN 'orphan_user' THEN 'ABORT_RUN'
    WHEN 'cancelled_default_idle' THEN 'CONTINUE'
    WHEN 'missing_valid_mode' THEN 'MIN_PRIVILEGE'
    WHEN 'missing_item' THEN 'ABORT_RUN'
    ELSE 'ABORT_RUN'
  END,
  `status` = CASE `code`
    WHEN 'cancelled_default_idle' THEN 'resolved'
    ELSE 'open'
  END,
  `detailChecksum` = LOWER(SHA2(COALESCE(CAST(`detail` AS CHAR CHARACTER SET utf8mb4), 'null'), 256)),
  `fingerprint` = LOWER(SHA2(CONCAT_WS(
    '|',
    `migrationVersion`,
    'v3.2.4+migrations-0000-0014',
    `entityType`,
    COALESCE(CAST(`entityId` AS CHAR), '-'),
    `code`,
    LOWER(SHA2(COALESCE(CAST(`detail` AS CHAR CHARACTER SET utf8mb4), 'null'), 256))
  ), 256))
WHERE `migrationRunId` IS NULL
   OR `migrationRunId` = 'v33a2-20260719T000000000Z-8eb607c9930b';
--> statement-breakpoint
CREATE TEMPORARY TABLE `_v33_a2_anomaly_backfill_guard` (
  `ok` tinyint NOT NULL,
  CONSTRAINT `_v33_a2_anomaly_backfill_guard_ck` CHECK (`ok` = 1)
);
--> statement-breakpoint
INSERT INTO `_v33_a2_anomaly_backfill_guard` (`ok`)
SELECT IF(
  NOT EXISTS (
    SELECT 1
    FROM `migration_anomalies`
    WHERE `migrationRunId` IS NULL
       OR `severity` IS NULL
       OR `handling` IS NULL
       OR `status` IS NULL
       OR `detailChecksum` IS NULL
       OR `fingerprint` IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `migration_anomalies`
    GROUP BY `migrationRunId`, `fingerprint`
    HAVING COUNT(*) > 1
  ),
  1,
  0
);
--> statement-breakpoint
DROP TEMPORARY TABLE `_v33_a2_anomaly_backfill_guard`;
--> statement-breakpoint
UPDATE `migration_runs` AS run
JOIN (
  SELECT
    COUNT(*) AS `processedCount`,
    COALESCE(SUM(`severity` <> 'BLOCKING'), 0) AS `succeededCount`,
    COALESCE(SUM(`severity` = 'BLOCKING'), 0) AS `blockingCount`
  FROM `migration_anomalies`
  WHERE `migrationRunId` = 'v33a2-20260719T000000000Z-8eb607c9930b'
) AS summary
SET
  run.`processedCount` = summary.`processedCount`,
  run.`succeededCount` = summary.`succeededCount`,
  run.`failedCount` = summary.`blockingCount`,
  run.`skippedCount` = 0,
  run.`status` = IF(summary.`blockingCount` > 0, 'failed', 'completed'),
  run.`completedAt` = IF(summary.`blockingCount` > 0, NULL, CURRENT_TIMESTAMP(3)),
  run.`failedAt` = IF(summary.`blockingCount` > 0, CURRENT_TIMESTAMP(3), NULL),
  run.`failureCode` = IF(
    summary.`blockingCount` > 0,
    'MIG-LEGACY-ANOMALY-BLOCKING',
    NULL
  ),
  run.`failureDetail` = IF(
    summary.`blockingCount` > 0,
    JSON_OBJECT(
      'ruleCode',
      'MIG-LEGACY-ANOMALY-BLOCKING',
      'blockingCount',
      summary.`blockingCount`
    ),
    NULL
  )
WHERE run.`migrationRunId` = 'v33a2-20260719T000000000Z-8eb607c9930b'
  AND run.`status` = 'running';
--> statement-breakpoint
ALTER TABLE `migration_anomalies` MODIFY COLUMN `migrationRunId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `migration_anomalies` MODIFY COLUMN `severity` enum('INFO','WARNING','BLOCKING') NOT NULL;--> statement-breakpoint
ALTER TABLE `migration_anomalies` MODIFY COLUMN `fingerprint` char(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `migration_anomalies` MODIFY COLUMN `handling` enum('CONTINUE','MIN_PRIVILEGE','SKIP_ENTITY','MANUAL_REVIEW','ABORT_RUN') NOT NULL;--> statement-breakpoint
ALTER TABLE `migration_anomalies` MODIFY COLUMN `status` enum('open','resolved','waived') NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE `migration_anomalies` MODIFY COLUMN `detailChecksum` char(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD CONSTRAINT `migration_anomalies_run_fingerprint_uq` UNIQUE(`migrationRunId`,`fingerprint`);--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD CONSTRAINT `migration_anomalies_blocking_handling_ck` CHECK (`migration_anomalies`.`severity` <> 'BLOCKING' or `migration_anomalies`.`handling` = 'ABORT_RUN');--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD CONSTRAINT `migration_anomalies_run_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD CONSTRAINT `migration_anomalies_resolvedByAccountId_users_id_fk` FOREIGN KEY (`resolvedByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `migration_anomalies_run_severity_status_idx` ON `migration_anomalies` (`migrationRunId`,`severity`,`status`);--> statement-breakpoint
CREATE INDEX `migration_anomalies_entity_code_idx` ON `migration_anomalies` (`entityType`,`entityId`,`code`);
