CREATE TABLE `business_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`identityTypeId` int NOT NULL,
	`status` enum('active','suspended','closed') NOT NULL DEFAULT 'active',
	`source` enum('system','legacy_backfill','self_service','platform') NOT NULL,
	`createdBy` int,
	`suspendedAt` timestamp,
	`suspendedBy` int,
	`suspensionReason` varchar(500),
	`closedAt` timestamp,
	`version` int NOT NULL DEFAULT 1,
	`migrationRunId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_identities_account_type_uq` UNIQUE(`accountId`,`identityTypeId`)
);
--> statement-breakpoint
CREATE TABLE `identity_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`identityId` int NOT NULL,
	`displayName` varchar(128),
	`professionalTitle` varchar(128),
	`introduction` text,
	`skills` json,
	`cityCode` varchar(32),
	`cityName` varchar(64),
	`contactPhoneEncrypted` varbinary(512),
	`contactPhoneLast4` char(4),
	`contactEmailEncrypted` varbinary(768),
	`publicContactPolicy` enum('hidden','masked','visible') NOT NULL DEFAULT 'hidden',
	`profileData` json,
	`version` int NOT NULL DEFAULT 1,
	`migrationRunId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `identity_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `identity_profiles_identity_uq` UNIQUE(`identityId`)
);
--> statement-breakpoint
ALTER TABLE `business_identities` ADD CONSTRAINT `business_identities_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_identities` ADD CONSTRAINT `business_identities_identityTypeId_identity_types_id_fk` FOREIGN KEY (`identityTypeId`) REFERENCES `identity_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_identities` ADD CONSTRAINT `business_identities_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_identities` ADD CONSTRAINT `business_identities_suspendedBy_users_id_fk` FOREIGN KEY (`suspendedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_identities` ADD CONSTRAINT `business_identities_migrationRunId_migration_runs_migrationRunId_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `identity_profiles` ADD CONSTRAINT `identity_profiles_identityId_business_identities_id_fk` FOREIGN KEY (`identityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `identity_profiles` ADD CONSTRAINT `identity_profiles_migrationRunId_migration_runs_migrationRunId_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_identities_account_status_idx` ON `business_identities` (`accountId`,`status`);--> statement-breakpoint
CREATE INDEX `business_identities_type_status_idx` ON `business_identities` (`identityTypeId`,`status`);--> statement-breakpoint
CREATE INDEX `business_identities_migration_run_idx` ON `business_identities` (`migrationRunId`);--> statement-breakpoint
CREATE INDEX `identity_profiles_city_deleted_idx` ON `identity_profiles` (`cityCode`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `identity_profiles_migration_run_idx` ON `identity_profiles` (`migrationRunId`);