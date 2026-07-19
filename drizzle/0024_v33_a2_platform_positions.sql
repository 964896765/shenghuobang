CREATE TABLE `platform_staff_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`positionCode` varchar(64) NOT NULL,
	`status` enum('active','suspended','revoked','expired') NOT NULL DEFAULT 'active',
	`activeDedupeKey` varchar(191),
	`assignedCaseScope` json,
	`validFrom` timestamp NOT NULL DEFAULT (now()),
	`validUntil` timestamp,
	`assignedBy` int NOT NULL,
	`assignmentReason` varchar(500) NOT NULL,
	`suspendedAt` timestamp,
	`revokedAt` timestamp,
	`revokedBy` int,
	`version` int NOT NULL DEFAULT 1,
	`migrationRunId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_staff_positions_id` PRIMARY KEY(`id`),
	CONSTRAINT `platform_staff_positions_active_dedupe_uq` UNIQUE(`activeDedupeKey`)
);
--> statement-breakpoint
ALTER TABLE `platform_staff_positions` ADD CONSTRAINT `platform_staff_positions_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_staff_positions` ADD CONSTRAINT `platform_staff_positions_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_staff_positions` ADD CONSTRAINT `platform_staff_positions_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_staff_positions` ADD CONSTRAINT `platform_staff_positions_migrationRunId_migration_runs_migrationRunId_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `platform_staff_positions_account_status_valid_idx` ON `platform_staff_positions` (`accountId`,`status`,`validUntil`);--> statement-breakpoint
CREATE INDEX `platform_staff_positions_code_status_idx` ON `platform_staff_positions` (`positionCode`,`status`);--> statement-breakpoint
CREATE INDEX `platform_staff_positions_migration_run_idx` ON `platform_staff_positions` (`migrationRunId`);