CREATE TABLE `capability_grants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int,
	`businessIdentityId` int,
	`organizationMembershipId` int,
	`projectMembershipId` int,
	`platformStaffPositionId` int,
	`capabilityCode` varchar(128) NOT NULL,
	`dataScope` enum('SELF','OWNED_RESOURCE','ORGANIZATION','PROJECT','ASSIGNED_RESOURCE','CITY_OR_REGION','PUBLIC','INVITED_RESOURCE','PLATFORM_ASSIGNED','PLATFORM_ALL') NOT NULL,
	`resourceType` varchar(64),
	`resourceId` varchar(64),
	`conditionJson` json,
	`status` enum('active','revoked','expired') NOT NULL DEFAULT 'active',
	`validFrom` timestamp NOT NULL DEFAULT (now()),
	`validUntil` timestamp,
	`grantedBy` int NOT NULL,
	`grantReason` varchar(500) NOT NULL,
	`revokedBy` int,
	`revokedAt` timestamp,
	`revokeReason` varchar(500),
	`activeDedupeKey` varchar(191),
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capability_grants_id` PRIMARY KEY(`id`),
	CONSTRAINT `capability_grants_active_dedupe_uq` UNIQUE(`activeDedupeKey`),
	CONSTRAINT `capability_grants_subject_ck` CHECK((`capability_grants`.`accountId` is not null) + (`capability_grants`.`businessIdentityId` is not null) + (`capability_grants`.`organizationMembershipId` is not null) + (`capability_grants`.`projectMembershipId` is not null) + (`capability_grants`.`platformStaffPositionId` is not null) = 1)
);
--> statement-breakpoint
CREATE TABLE `permission_audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` char(36) NOT NULL,
	`requestId` varchar(64),
	`idempotencyKey` varchar(191),
	`actorAccountId` int,
	`actorType` enum('account','system') NOT NULL,
	`activeIdentityId` int,
	`organizationId` int,
	`projectId` int,
	`platformStaffPositionId` int,
	`capabilityCode` varchar(128),
	`resourceType` varchar(64) NOT NULL,
	`resourceId` varchar(64),
	`decision` enum('allow','deny','changed') NOT NULL,
	`reasonCode` varchar(64) NOT NULL,
	`resolvedDataScope` varchar(32),
	`confidentiality` varchar(32),
	`fieldMask` json,
	`policyVersion` varchar(64) NOT NULL,
	`contextData` json,
	`ipAddress` varchar(64),
	`userAgent` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `permission_audit_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `permission_audit_events_event_uq` UNIQUE(`eventId`),
	CONSTRAINT `permission_audit_events_idempotency_uq` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `workspace_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`workspaceType` enum('personal','identity','organization','platform') NOT NULL DEFAULT 'personal',
	`identityId` int,
	`organizationId` int,
	`platformStaffPositionId` int,
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	`version` int NOT NULL DEFAULT 1,
	`migrationRunId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_preferences_account_uq` UNIQUE(`accountId`),
	CONSTRAINT `workspace_preferences_target_ck` CHECK((
        (`workspace_preferences`.`workspaceType` = 'personal' and `workspace_preferences`.`identityId` is null and `workspace_preferences`.`organizationId` is null and `workspace_preferences`.`platformStaffPositionId` is null)
        or (`workspace_preferences`.`workspaceType` = 'identity' and `workspace_preferences`.`identityId` is not null and `workspace_preferences`.`organizationId` is null and `workspace_preferences`.`platformStaffPositionId` is null)
        or (`workspace_preferences`.`workspaceType` = 'organization' and `workspace_preferences`.`identityId` is null and `workspace_preferences`.`organizationId` is not null and `workspace_preferences`.`platformStaffPositionId` is null)
        or (`workspace_preferences`.`workspaceType` = 'platform' and `workspace_preferences`.`identityId` is null and `workspace_preferences`.`organizationId` is null and `workspace_preferences`.`platformStaffPositionId` is not null)
      ))
);
--> statement-breakpoint
ALTER TABLE `capability_grants` ADD CONSTRAINT `capability_grants_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capability_grants` ADD CONSTRAINT `capability_grants_businessIdentityId_business_identities_id_fk` FOREIGN KEY (`businessIdentityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capability_grants` ADD CONSTRAINT `capability_grants_organizationMembershipId_organization_memberships_id_fk` FOREIGN KEY (`organizationMembershipId`) REFERENCES `organization_memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capability_grants` ADD CONSTRAINT `capability_grants_projectMembershipId_project_memberships_id_fk` FOREIGN KEY (`projectMembershipId`) REFERENCES `project_memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capability_grants` ADD CONSTRAINT `capability_grants_platformStaffPositionId_platform_staff_positions_id_fk` FOREIGN KEY (`platformStaffPositionId`) REFERENCES `platform_staff_positions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capability_grants` ADD CONSTRAINT `capability_grants_capabilityCode_capabilities_code_fk` FOREIGN KEY (`capabilityCode`) REFERENCES `capabilities`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capability_grants` ADD CONSTRAINT `capability_grants_grantedBy_users_id_fk` FOREIGN KEY (`grantedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capability_grants` ADD CONSTRAINT `capability_grants_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_audit_events` ADD CONSTRAINT `permission_audit_events_actorAccountId_users_id_fk` FOREIGN KEY (`actorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_audit_events` ADD CONSTRAINT `permission_audit_events_activeIdentityId_business_identities_id_fk` FOREIGN KEY (`activeIdentityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_audit_events` ADD CONSTRAINT `permission_audit_events_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_audit_events` ADD CONSTRAINT `permission_audit_events_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_audit_events` ADD CONSTRAINT `permission_audit_events_platformStaffPositionId_platform_staff_positions_id_fk` FOREIGN KEY (`platformStaffPositionId`) REFERENCES `platform_staff_positions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_audit_events` ADD CONSTRAINT `permission_audit_events_capabilityCode_capabilities_code_fk` FOREIGN KEY (`capabilityCode`) REFERENCES `capabilities`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_preferences` ADD CONSTRAINT `workspace_preferences_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_preferences` ADD CONSTRAINT `workspace_preferences_identityId_business_identities_id_fk` FOREIGN KEY (`identityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_preferences` ADD CONSTRAINT `workspace_preferences_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_preferences` ADD CONSTRAINT `workspace_preferences_platformStaffPositionId_platform_staff_positions_id_fk` FOREIGN KEY (`platformStaffPositionId`) REFERENCES `platform_staff_positions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_preferences` ADD CONSTRAINT `workspace_preferences_migrationRunId_migration_runs_migrationRunId_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `capability_grants_cap_status_valid_idx` ON `capability_grants` (`capabilityCode`,`status`,`validUntil`);--> statement-breakpoint
CREATE INDEX `capability_grants_account_status_idx` ON `capability_grants` (`accountId`,`status`);--> statement-breakpoint
CREATE INDEX `capability_grants_identity_status_idx` ON `capability_grants` (`businessIdentityId`,`status`);--> statement-breakpoint
CREATE INDEX `capability_grants_org_member_status_idx` ON `capability_grants` (`organizationMembershipId`,`status`);--> statement-breakpoint
CREATE INDEX `capability_grants_project_member_status_idx` ON `capability_grants` (`projectMembershipId`,`status`);--> statement-breakpoint
CREATE INDEX `capability_grants_platform_pos_status_idx` ON `capability_grants` (`platformStaffPositionId`,`status`);--> statement-breakpoint
CREATE INDEX `permission_audit_events_actor_created_idx` ON `permission_audit_events` (`actorAccountId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `permission_audit_events_resource_created_idx` ON `permission_audit_events` (`resourceType`,`resourceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `permission_audit_events_cap_decision_created_idx` ON `permission_audit_events` (`capabilityCode`,`decision`,`createdAt`);--> statement-breakpoint
CREATE INDEX `permission_audit_events_org_created_idx` ON `permission_audit_events` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `permission_audit_events_project_created_idx` ON `permission_audit_events` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `workspace_preferences_identity_idx` ON `workspace_preferences` (`identityId`);--> statement-breakpoint
CREATE INDEX `workspace_preferences_organization_idx` ON `workspace_preferences` (`organizationId`);--> statement-breakpoint
CREATE INDEX `workspace_preferences_migration_run_idx` ON `workspace_preferences` (`migrationRunId`);