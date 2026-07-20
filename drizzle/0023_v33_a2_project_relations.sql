CREATE TABLE `project_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`inviterMembershipId` int NOT NULL,
	`inviteeAccountId` int,
	`inviteeOrganizationId` int,
	`proposedRoleCode` varchar(64) NOT NULL,
	`confidentialityClearance` enum('PUBLIC','INTERNAL','CONFIDENTIAL','NDA','RESTRICTED') NOT NULL DEFAULT 'INTERNAL',
	`tokenDigest` char(64) NOT NULL,
	`status` enum('pending','accepted','declined','revoked','expired') NOT NULL DEFAULT 'pending',
	`activeDedupeKey` varchar(191),
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`requestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_invitations_token_uq` UNIQUE(`tokenDigest`),
	CONSTRAINT `project_invitations_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `project_invitations_active_dedupe_uq` UNIQUE(`activeDedupeKey`),
	CONSTRAINT `project_invitations_project_id_uq` UNIQUE(`projectId`,`id`),
	CONSTRAINT `project_invitations_target_ck` CHECK((`project_invitations`.`inviteeAccountId` is not null) + (`project_invitations`.`inviteeOrganizationId` is not null) = 1)
);
--> statement-breakpoint
CREATE TABLE `project_membership_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`projectMembershipId` int NOT NULL,
	`roleCode` varchar(64) NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`assignedBy` int NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`revokedBy` int,
	`revokedAt` timestamp,
	`reason` varchar(500),
	`lastRequestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`migrationRunId` varchar(64),
	CONSTRAINT `project_membership_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_membership_roles_member_role_uq` UNIQUE(`projectMembershipId`,`roleCode`)
);
--> statement-breakpoint
CREATE TABLE `project_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`accountId` int NOT NULL,
	`businessIdentityId` int,
	`sourceOrganizationId` int,
	`status` enum('active','suspended','left','removed') NOT NULL DEFAULT 'active',
	`sourceInvitationId` int,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`suspendedAt` timestamp,
	`leftAt` timestamp,
	`removedAt` timestamp,
	`endedBy` int,
	`endReason` varchar(500),
	`confidentialityClearance` enum('PUBLIC','INTERNAL','CONFIDENTIAL','NDA','RESTRICTED') NOT NULL DEFAULT 'INTERNAL',
	`lastRequestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`migrationRunId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_memberships_project_account_uq` UNIQUE(`projectId`,`accountId`),
	CONSTRAINT `project_memberships_project_id_uq` UNIQUE(`projectId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `project_role_capabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roleCode` varchar(64) NOT NULL,
	`capabilityCode` varchar(128) NOT NULL,
	`dataScope` enum('SELF','OWNED_RESOURCE','ORGANIZATION','PROJECT','ASSIGNED_RESOURCE','CITY_OR_REGION','PUBLIC','INVITED_RESOURCE','PLATFORM_ASSIGNED','PLATFORM_ALL') NOT NULL DEFAULT 'PROJECT',
	`conditionJson` json,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`lastRequestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `project_role_capabilities_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_role_capabilities_role_cap_scope_uq` UNIQUE(`roleCode`,`capabilityCode`,`dataScope`)
);
--> statement-breakpoint
ALTER TABLE `project_invitations` ADD CONSTRAINT `project_invitations_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_invitations` ADD CONSTRAINT `project_invitations_inviteeAccountId_users_id_fk` FOREIGN KEY (`inviteeAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_invitations` ADD CONSTRAINT `project_invitations_inviteeOrganizationId_organizations_id_fk` FOREIGN KEY (`inviteeOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_invitations` ADD CONSTRAINT `project_invitations_proposedRoleCode_project_roles_code_fk` FOREIGN KEY (`proposedRoleCode`) REFERENCES `project_roles`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_invitations` ADD CONSTRAINT `project_invitations_inviter_project_fk` FOREIGN KEY (`projectId`,`inviterMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_membership_roles` ADD CONSTRAINT `project_membership_roles_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_membership_roles` ADD CONSTRAINT `project_membership_roles_roleCode_project_roles_code_fk` FOREIGN KEY (`roleCode`) REFERENCES `project_roles`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_membership_roles` ADD CONSTRAINT `project_membership_roles_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_membership_roles` ADD CONSTRAINT `project_membership_roles_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_membership_roles` ADD CONSTRAINT `project_membership_roles_run_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_membership_roles` ADD CONSTRAINT `project_membership_roles_member_project_fk` FOREIGN KEY (`projectId`,`projectMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_businessIdentityId_business_identities_id_fk` FOREIGN KEY (`businessIdentityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_sourceOrganizationId_organizations_id_fk` FOREIGN KEY (`sourceOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_endedBy_users_id_fk` FOREIGN KEY (`endedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_run_fk` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`migrationRunId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_role_capabilities` ADD CONSTRAINT `project_role_capabilities_roleCode_project_roles_code_fk` FOREIGN KEY (`roleCode`) REFERENCES `project_roles`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_role_capabilities` ADD CONSTRAINT `project_role_capabilities_capabilityCode_capabilities_code_fk` FOREIGN KEY (`capabilityCode`) REFERENCES `capabilities`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_invitations_project_status_exp_idx` ON `project_invitations` (`projectId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `project_membership_roles_project_role_status_idx` ON `project_membership_roles` (`projectId`,`roleCode`,`status`);--> statement-breakpoint
CREATE INDEX `project_membership_roles_migration_run_idx` ON `project_membership_roles` (`migrationRunId`);--> statement-breakpoint
CREATE INDEX `project_memberships_account_status_idx` ON `project_memberships` (`accountId`,`status`);--> statement-breakpoint
CREATE INDEX `project_memberships_project_status_idx` ON `project_memberships` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `project_memberships_org_project_status_idx` ON `project_memberships` (`sourceOrganizationId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `project_memberships_migration_run_idx` ON `project_memberships` (`migrationRunId`);--> statement-breakpoint
CREATE INDEX `project_role_capabilities_cap_status_idx` ON `project_role_capabilities` (`capabilityCode`,`status`);
