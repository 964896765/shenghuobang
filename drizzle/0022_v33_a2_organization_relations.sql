CREATE TABLE `organization_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`inviterMembershipId` int NOT NULL,
	`inviteeAccountId` int,
	`inviteePhoneDigest` char(64),
	`inviteeEmailDigest` char(64),
	`tokenDigest` char(64) NOT NULL,
	`status` enum('pending','accepted','declined','revoked','expired') NOT NULL DEFAULT 'pending',
	`activeDedupeKey` varchar(191),
	`expiresAt` timestamp NOT NULL,
	`acceptedByAccountId` int,
	`acceptedAt` timestamp,
	`requestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organization_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_invitations_token_uq` UNIQUE(`tokenDigest`),
	CONSTRAINT `organization_invitations_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `organization_invitations_active_dedupe_uq` UNIQUE(`activeDedupeKey`),
	CONSTRAINT `organization_invitations_org_id_uq` UNIQUE(`organizationId`,`id`),
	CONSTRAINT `organization_invitations_target_ck` CHECK((`organization_invitations`.`inviteeAccountId` is not null) + (`organization_invitations`.`inviteePhoneDigest` is not null) + (`organization_invitations`.`inviteeEmailDigest` is not null) = 1)
);
--> statement-breakpoint
CREATE TABLE `organization_member_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`membershipId` int NOT NULL,
	`positionId` int NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`assignedBy` int NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`revokedBy` int,
	`revokedAt` timestamp,
	`reason` varchar(500),
	`lastRequestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `organization_member_positions_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_member_positions_member_pos_uq` UNIQUE(`membershipId`,`positionId`)
);
--> statement-breakpoint
CREATE TABLE `organization_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`accountId` int NOT NULL,
	`status` enum('active','suspended','left','removed') NOT NULL DEFAULT 'active',
	`sourceInvitationId` int,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`suspendedAt` timestamp,
	`leftAt` timestamp,
	`removedAt` timestamp,
	`endedBy` int,
	`endReason` varchar(500),
	`lastRequestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organization_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_memberships_org_account_uq` UNIQUE(`organizationId`,`accountId`),
	CONSTRAINT `organization_memberships_org_id_uq` UNIQUE(`organizationId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `organization_owner_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`fromMembershipId` int NOT NULL,
	`toMembershipId` int NOT NULL,
	`status` enum('pending','confirmed','cancelled','expired','completed') NOT NULL DEFAULT 'pending',
	`activeDedupeKey` varchar(191),
	`initiatedBy` int NOT NULL,
	`initiatorConfirmedAt` timestamp,
	`recipientConfirmedAt` timestamp,
	`secondFactorConfirmedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`requestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organization_owner_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_owner_transfers_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `organization_owner_transfers_active_dedupe_uq` UNIQUE(`activeDedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `organization_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` varchar(500),
	`isOwnerPosition` boolean NOT NULL DEFAULT false,
	`isSystem` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `organization_positions_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_positions_org_code_uq` UNIQUE(`organizationId`,`code`),
	CONSTRAINT `organization_positions_org_id_uq` UNIQUE(`organizationId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`organizationType` varchar(64) NOT NULL,
	`registrationCountry` char(2),
	`creatorAccountId` int NOT NULL,
	`description` text,
	`cityCode` varchar(32),
	`cityName` varchar(64),
	`status` enum('active','suspended','dissolving','closed') NOT NULL DEFAULT 'active',
	`suspendedAt` timestamp,
	`closedAt` timestamp,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `position_capabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`positionId` int NOT NULL,
	`capabilityCode` varchar(128) NOT NULL,
	`dataScope` enum('SELF','OWNED_RESOURCE','ORGANIZATION','PROJECT','ASSIGNED_RESOURCE','CITY_OR_REGION','PUBLIC','INVITED_RESOURCE','PLATFORM_ASSIGNED','PLATFORM_ALL') NOT NULL,
	`conditionJson` json,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`grantedBy` int NOT NULL,
	`revokedBy` int,
	`revokedAt` timestamp,
	`lastRequestId` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `position_capabilities_id` PRIMARY KEY(`id`),
	CONSTRAINT `position_capabilities_pos_cap_scope_uq` UNIQUE(`positionId`,`capabilityCode`,`dataScope`)
);
--> statement-breakpoint
ALTER TABLE `organization_invitations` ADD CONSTRAINT `organization_invitations_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_invitations` ADD CONSTRAINT `organization_invitations_inviteeAccountId_users_id_fk` FOREIGN KEY (`inviteeAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_invitations` ADD CONSTRAINT `organization_invitations_acceptedByAccountId_users_id_fk` FOREIGN KEY (`acceptedByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_invitations` ADD CONSTRAINT `organization_invitations_inviter_org_fk` FOREIGN KEY (`organizationId`,`inviterMembershipId`) REFERENCES `organization_memberships`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_member_positions` ADD CONSTRAINT `organization_member_positions_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_member_positions` ADD CONSTRAINT `organization_member_positions_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_member_positions` ADD CONSTRAINT `organization_member_positions_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_member_positions` ADD CONSTRAINT `organization_member_positions_member_org_fk` FOREIGN KEY (`organizationId`,`membershipId`) REFERENCES `organization_memberships`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_member_positions` ADD CONSTRAINT `organization_member_positions_position_org_fk` FOREIGN KEY (`organizationId`,`positionId`) REFERENCES `organization_positions`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_endedBy_users_id_fk` FOREIGN KEY (`endedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_owner_transfers` ADD CONSTRAINT `organization_owner_transfers_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_owner_transfers` ADD CONSTRAINT `organization_owner_transfers_initiatedBy_users_id_fk` FOREIGN KEY (`initiatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_owner_transfers` ADD CONSTRAINT `organization_owner_transfers_from_org_fk` FOREIGN KEY (`organizationId`,`fromMembershipId`) REFERENCES `organization_memberships`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_owner_transfers` ADD CONSTRAINT `organization_owner_transfers_to_org_fk` FOREIGN KEY (`organizationId`,`toMembershipId`) REFERENCES `organization_memberships`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_positions` ADD CONSTRAINT `organization_positions_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_creatorAccountId_users_id_fk` FOREIGN KEY (`creatorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `position_capabilities` ADD CONSTRAINT `position_capabilities_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `position_capabilities` ADD CONSTRAINT `position_capabilities_capabilityCode_capabilities_code_fk` FOREIGN KEY (`capabilityCode`) REFERENCES `capabilities`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `position_capabilities` ADD CONSTRAINT `position_capabilities_grantedBy_users_id_fk` FOREIGN KEY (`grantedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `position_capabilities` ADD CONSTRAINT `position_capabilities_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `position_capabilities` ADD CONSTRAINT `position_capabilities_position_org_fk` FOREIGN KEY (`organizationId`,`positionId`) REFERENCES `organization_positions`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `organization_invitations_org_status_exp_idx` ON `organization_invitations` (`organizationId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `organization_invitations_invitee_status_idx` ON `organization_invitations` (`inviteeAccountId`,`status`);--> statement-breakpoint
CREATE INDEX `organization_member_positions_org_status_idx` ON `organization_member_positions` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `organization_memberships_account_status_idx` ON `organization_memberships` (`accountId`,`status`);--> statement-breakpoint
CREATE INDEX `organization_memberships_org_status_idx` ON `organization_memberships` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `organization_owner_transfers_org_status_idx` ON `organization_owner_transfers` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `organization_positions_org_status_idx` ON `organization_positions` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `organizations_creator_idx` ON `organizations` (`creatorAccountId`);--> statement-breakpoint
CREATE INDEX `organizations_type_status_idx` ON `organizations` (`organizationType`,`status`);--> statement-breakpoint
CREATE INDEX `organizations_city_status_idx` ON `organizations` (`cityCode`,`status`);--> statement-breakpoint
CREATE INDEX `position_capabilities_org_cap_status_idx` ON `position_capabilities` (`organizationId`,`capabilityCode`,`status`);