CREATE TABLE `migration_runs` (
	`migrationRunId` varchar(64) NOT NULL,
	`migrationVersion` varchar(32) NOT NULL,
	`runMode` enum('migrate','rerun','recovery') NOT NULL DEFAULT 'migrate',
	`parentMigrationRunId` varchar(64),
	`runSequence` int NOT NULL,
	`sourceBaseline` varchar(128) NOT NULL,
	`sourceChecksum` char(64) NOT NULL,
	`manifestChecksum` char(64) NOT NULL,
	`configurationChecksum` char(64) NOT NULL,
	`status` enum('pending','running','completed','failed','aborted') NOT NULL DEFAULT 'pending',
	`startedAt` timestamp(3),
	`completedAt` timestamp(3),
	`failedAt` timestamp(3),
	`abortedAt` timestamp(3),
	`heartbeatAt` timestamp(3),
	`processedCount` int NOT NULL DEFAULT 0,
	`succeededCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`skippedCount` int NOT NULL DEFAULT 0,
	`requestedByAccountId` int,
	`failureCode` varchar(64),
	`failureDetail` json,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	`updatedAt` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `migration_runs_migrationRunId` PRIMARY KEY(`migrationRunId`),
	CONSTRAINT `migration_runs_version_baseline_seq_uq` UNIQUE(`migrationVersion`,`sourceBaseline`,`runSequence`),
	CONSTRAINT `migration_runs_parent_not_self_ck` CHECK(`migration_runs`.`parentMigrationRunId` is null or `migration_runs`.`parentMigrationRunId` <> `migration_runs`.`migrationRunId`),
	CONSTRAINT `migration_runs_counts_ck` CHECK(`migration_runs`.`processedCount` >= 0 and `migration_runs`.`succeededCount` >= 0 and `migration_runs`.`failedCount` >= 0 and `migration_runs`.`skippedCount` >= 0 and `migration_runs`.`processedCount` = `migration_runs`.`succeededCount` + `migration_runs`.`failedCount` + `migration_runs`.`skippedCount`),
	CONSTRAINT `migration_runs_terminal_status_ck` CHECK((
        (`migration_runs`.`status` = 'pending' and `migration_runs`.`startedAt` is null and `migration_runs`.`completedAt` is null and `migration_runs`.`failedAt` is null and `migration_runs`.`abortedAt` is null)
        or (`migration_runs`.`status` = 'running' and `migration_runs`.`startedAt` is not null and `migration_runs`.`completedAt` is null and `migration_runs`.`failedAt` is null and `migration_runs`.`abortedAt` is null)
        or (`migration_runs`.`status` = 'completed' and `migration_runs`.`startedAt` is not null and `migration_runs`.`completedAt` is not null and `migration_runs`.`failedAt` is null and `migration_runs`.`abortedAt` is null and `migration_runs`.`failureCode` is null)
        or (`migration_runs`.`status` = 'failed' and `migration_runs`.`startedAt` is not null and `migration_runs`.`completedAt` is null and `migration_runs`.`failedAt` is not null and `migration_runs`.`abortedAt` is null and `migration_runs`.`failureCode` is not null)
        or (`migration_runs`.`status` = 'aborted' and `migration_runs`.`startedAt` is not null and `migration_runs`.`completedAt` is null and `migration_runs`.`failedAt` is null and `migration_runs`.`abortedAt` is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE `migration_checkpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`migrationRunId` varchar(64) NOT NULL,
	`checkpointKey` varchar(191) NOT NULL,
	`phase` enum('schema','seed','backfill','validate','recovery') NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`rangeStartExclusive` varchar(128),
	`rangeEndInclusive` varchar(128),
	`cursorJson` json,
	`status` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
	`processedCount` int NOT NULL DEFAULT 0,
	`succeededCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`skippedCount` int NOT NULL DEFAULT 0,
	`batchSize` int NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 0,
	`checksum` char(64) NOT NULL,
	`startedAt` timestamp(3),
	`completedAt` timestamp(3),
	`failedAt` timestamp(3),
	`lastErrorCode` varchar(64),
	`lastErrorDetail` json,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	`updatedAt` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `migration_checkpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `migration_checkpoints_run_key_uq` UNIQUE(`migrationRunId`,`checkpointKey`),
	CONSTRAINT `migration_checkpoints_counts_ck` CHECK(`migration_checkpoints`.`processedCount` >= 0 and `migration_checkpoints`.`succeededCount` >= 0 and `migration_checkpoints`.`failedCount` >= 0 and `migration_checkpoints`.`skippedCount` >= 0 and `migration_checkpoints`.`processedCount` = `migration_checkpoints`.`succeededCount` + `migration_checkpoints`.`failedCount` + `migration_checkpoints`.`skippedCount`),
	CONSTRAINT `migration_checkpoints_batch_size_ck` CHECK(`migration_checkpoints`.`batchSize` between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE `migration_checkpoints` ADD CONSTRAINT `migration_checkpoints_migrationRunId_migration_runs_migrationRunId_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `migration_runs` ADD CONSTRAINT `migration_runs_requestedByAccountId_users_id_fk` FOREIGN KEY (`requestedByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `migration_runs` ADD CONSTRAINT `migration_runs_parent_fk` FOREIGN KEY (`parentMigrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `migration_checkpoints_run_status_phase_idx` ON `migration_checkpoints` (`migrationRunId`,`status`,`phase`);--> statement-breakpoint
CREATE INDEX `migration_checkpoints_entity_status_idx` ON `migration_checkpoints` (`entityType`,`status`);--> statement-breakpoint
CREATE INDEX `migration_runs_parent_mode_idx` ON `migration_runs` (`parentMigrationRunId`,`runMode`);--> statement-breakpoint
CREATE INDEX `migration_runs_status_heartbeat_idx` ON `migration_runs` (`status`,`heartbeatAt`);--> statement-breakpoint
CREATE INDEX `migration_runs_version_baseline_created_idx` ON `migration_runs` (`migrationVersion`,`sourceBaseline`,`createdAt`);
