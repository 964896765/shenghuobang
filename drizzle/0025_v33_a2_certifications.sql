CREATE TABLE `certification_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`certificationId` int NOT NULL,
	`fileId` int NOT NULL,
	`documentType` varchar(64) NOT NULL,
	`versionNo` int NOT NULL DEFAULT 1,
	`status` enum('available','superseded','disabled') NOT NULL DEFAULT 'available',
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`disabledAt` timestamp,
	`disabledBy` int,
	`migrationRunId` varchar(64),
	CONSTRAINT `certification_documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `certification_documents_type_version_uq` UNIQUE(`certificationId`,`documentType`,`versionNo`),
	CONSTRAINT `certification_documents_cert_file_uq` UNIQUE(`certificationId`,`fileId`)
);
--> statement-breakpoint
CREATE TABLE `certification_review_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`certificationId` int NOT NULL,
	`stage` enum('submission','initial_review','final_review','revocation','expiry') NOT NULL,
	`action` enum('submit','resubmit','start_review','request_info','approve','reject','revoke','expire') NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32) NOT NULL,
	`actorId` int,
	`platformStaffPositionId` int,
	`reasonCode` varchar(64),
	`reason` varchar(500),
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`migrationRunId` varchar(64),
	CONSTRAINT `certification_review_actions_id` PRIMARY KEY(`id`),
	CONSTRAINT `certification_review_actions_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `certifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationNo` varchar(64) NOT NULL,
	`certificationTypeId` int NOT NULL,
	`subjectIdentityId` int,
	`subjectOrganizationId` int,
	`status` enum('not_applied','pending','additional_info_required','approved','rejected','revoked','expired') NOT NULL DEFAULT 'not_applied',
	`applicationData` json,
	`activeDedupeKey` varchar(191),
	`submittedAt` timestamp,
	`approvedAt` timestamp,
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	`revokedBy` int,
	`decisionReasonCode` varchar(64),
	`decisionReason` varchar(500),
	`legacySourceType` varchar(64),
	`legacySourceId` int,
	`version` int NOT NULL DEFAULT 1,
	`migrationRunId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `certifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `certifications_application_no_uq` UNIQUE(`applicationNo`),
	CONSTRAINT `certifications_active_dedupe_uq` UNIQUE(`activeDedupeKey`),
	CONSTRAINT `certifications_legacy_source_uq` UNIQUE(`legacySourceType`,`legacySourceId`),
	CONSTRAINT `certifications_subject_ck` CHECK((`certifications`.`subjectIdentityId` is not null) + (`certifications`.`subjectOrganizationId` is not null) = 1)
);
--> statement-breakpoint
ALTER TABLE `certification_documents` ADD CONSTRAINT `certification_documents_certificationId_certifications_id_fk` FOREIGN KEY (`certificationId`) REFERENCES `certifications`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certification_documents` ADD CONSTRAINT `certification_documents_fileId_stored_files_id_fk` FOREIGN KEY (`fileId`) REFERENCES `stored_files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certification_documents` ADD CONSTRAINT `certification_documents_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certification_documents` ADD CONSTRAINT `certification_documents_disabledBy_users_id_fk` FOREIGN KEY (`disabledBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certification_documents` ADD CONSTRAINT `certification_documents_migrationRunId_migration_runs_migrationRunId_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certification_review_actions` ADD CONSTRAINT `certification_review_actions_certificationId_certifications_id_fk` FOREIGN KEY (`certificationId`) REFERENCES `certifications`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certification_review_actions` ADD CONSTRAINT `certification_review_actions_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certification_review_actions` ADD CONSTRAINT `certification_review_actions_platformStaffPositionId_platform_staff_positions_id_fk` FOREIGN KEY (`platformStaffPositionId`) REFERENCES `platform_staff_positions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certification_review_actions` ADD CONSTRAINT `certification_review_actions_migrationRunId_migration_runs_migrationRunId_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certifications` ADD CONSTRAINT `certifications_certificationTypeId_certification_types_id_fk` FOREIGN KEY (`certificationTypeId`) REFERENCES `certification_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certifications` ADD CONSTRAINT `certifications_subjectIdentityId_business_identities_id_fk` FOREIGN KEY (`subjectIdentityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certifications` ADD CONSTRAINT `certifications_subjectOrganizationId_organizations_id_fk` FOREIGN KEY (`subjectOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certifications` ADD CONSTRAINT `certifications_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certifications` ADD CONSTRAINT `certifications_migrationRunId_migration_runs_migrationRunId_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `certification_documents_cert_status_idx` ON `certification_documents` (`certificationId`,`status`);--> statement-breakpoint
CREATE INDEX `certification_documents_migration_run_idx` ON `certification_documents` (`migrationRunId`);--> statement-breakpoint
CREATE INDEX `cert_review_actions_cert_created_idx` ON `certification_review_actions` (`certificationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cert_review_actions_actor_stage_created_idx` ON `certification_review_actions` (`actorId`,`stage`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cert_review_actions_migration_run_idx` ON `certification_review_actions` (`migrationRunId`);--> statement-breakpoint
CREATE INDEX `certifications_identity_type_status_idx` ON `certifications` (`subjectIdentityId`,`certificationTypeId`,`status`);--> statement-breakpoint
CREATE INDEX `certifications_org_type_status_idx` ON `certifications` (`subjectOrganizationId`,`certificationTypeId`,`status`);--> statement-breakpoint
CREATE INDEX `certifications_status_expiry_idx` ON `certifications` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `certifications_migration_run_idx` ON `certifications` (`migrationRunId`);