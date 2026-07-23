-- V3.3-B1: idea publishing, protected collaboration and deterministic project conversion.
-- Existing quote-created projects keep needId/quoteId; idea-created projects use NULL.
ALTER TABLE `projects` MODIFY COLUMN `needId` int NULL;
--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `quoteId` int NULL;
--> statement-breakpoint
CREATE TABLE `ideas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `creatorAccountId` int NOT NULL,
  `creatorIdentityId` int NOT NULL,
  `title` varchar(160) NOT NULL,
  `summary` varchar(500) NOT NULL,
  `description` text NOT NULL,
  `categoryCode` varchar(64) NOT NULL,
  `tags` json NOT NULL,
  `visibility` enum('public','private','nda') NOT NULL DEFAULT 'public',
  `status` enum('draft','published','collaborating','converted','archived') NOT NULL DEFAULT 'draft',
  `coverFileId` int,
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `publishedAt` timestamp,
  `convertedProjectId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp,
  CONSTRAINT `ideas_id` PRIMARY KEY (`id`),
  CONSTRAINT `ideas_converted_project_uq` UNIQUE (`convertedProjectId`),
  CONSTRAINT `ideas_creator_account_fk` FOREIGN KEY (`creatorAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ideas_creator_identity_fk` FOREIGN KEY (`creatorIdentityId`) REFERENCES `business_identities` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ideas_cover_file_fk` FOREIGN KEY (`coverFileId`) REFERENCES `stored_files` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ideas_converted_project_fk` FOREIGN KEY (`convertedProjectId`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `ideas_creator_status_idx` ON `ideas` (`creatorAccountId`,`status`,`deletedAt`);
--> statement-breakpoint
CREATE INDEX `ideas_public_feed_idx` ON `ideas` (`visibility`,`status`,`publishedAt`);
--> statement-breakpoint
CREATE TABLE `idea_attachments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ideaId` int NOT NULL,
  `fileId` int NOT NULL,
  `attachmentType` enum('cover','reference','design','other') NOT NULL DEFAULT 'other',
  `confidentialityLevel` enum('PUBLIC','INTERNAL','CONFIDENTIAL','NDA','RESTRICTED') NOT NULL DEFAULT 'INTERNAL',
  `sortOrder` int NOT NULL DEFAULT 0,
  `uploadedBy` int NOT NULL,
  `accessPolicyVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `disabledAt` timestamp,
  CONSTRAINT `idea_attachments_id` PRIMARY KEY (`id`),
  CONSTRAINT `idea_attachments_idea_file_uq` UNIQUE (`ideaId`,`fileId`),
  CONSTRAINT `idea_attachments_idea_fk` FOREIGN KEY (`ideaId`) REFERENCES `ideas` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `idea_attachments_file_fk` FOREIGN KEY (`fileId`) REFERENCES `stored_files` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `idea_attachments_uploader_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `idea_attachments_idea_state_idx` ON `idea_attachments` (`ideaId`,`disabledAt`,`sortOrder`);
--> statement-breakpoint
CREATE TABLE `idea_collaboration_invitations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ideaId` int NOT NULL,
  `inviterAccountId` int NOT NULL,
  `invitedAccountId` int NOT NULL,
  `invitedIdentityId` int NOT NULL,
  `requestedRole` enum('designer','engineer','viewer') NOT NULL,
  `status` enum('pending','accepted','declined','revoked','expired') NOT NULL DEFAULT 'pending',
  `activeDedupeKey` varchar(191),
  `message` varchar(1000),
  `ndaRequired` boolean NOT NULL DEFAULT false,
  `expiresAt` timestamp NOT NULL,
  `acceptedAt` timestamp,
  `requestId` varchar(64) NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `idea_collaboration_invitations_id` PRIMARY KEY (`id`),
  CONSTRAINT `idea_invitations_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `idea_invitations_active_dedupe_uq` UNIQUE (`activeDedupeKey`),
  CONSTRAINT `idea_invitations_idea_fk` FOREIGN KEY (`ideaId`) REFERENCES `ideas` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `idea_invitations_inviter_fk` FOREIGN KEY (`inviterAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `idea_invitations_invited_account_fk` FOREIGN KEY (`invitedAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `idea_invitations_invited_identity_fk` FOREIGN KEY (`invitedIdentityId`) REFERENCES `business_identities` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `idea_invitations_recipient_status_idx` ON `idea_collaboration_invitations` (`invitedAccountId`,`status`,`expiresAt`);
--> statement-breakpoint
CREATE INDEX `idea_invitations_idea_status_idx` ON `idea_collaboration_invitations` (`ideaId`,`status`);
--> statement-breakpoint
CREATE TABLE `idea_nda_acceptances` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ideaId` int NOT NULL,
  `accountId` int NOT NULL,
  `identityId` int NOT NULL,
  `ndaVersion` varchar(64) NOT NULL,
  `acceptedAt` timestamp NOT NULL DEFAULT (now()),
  `revokedAt` timestamp,
  `requestId` varchar(64) NOT NULL,
  CONSTRAINT `idea_nda_acceptances_id` PRIMARY KEY (`id`),
  CONSTRAINT `idea_nda_idea_account_identity_uq` UNIQUE (`ideaId`,`accountId`,`identityId`),
  CONSTRAINT `idea_nda_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `idea_nda_idea_fk` FOREIGN KEY (`ideaId`) REFERENCES `ideas` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `idea_nda_account_fk` FOREIGN KEY (`accountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `idea_nda_identity_fk` FOREIGN KEY (`identityId`) REFERENCES `business_identities` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `idea_nda_account_state_idx` ON `idea_nda_acceptances` (`accountId`,`revokedAt`);
--> statement-breakpoint
INSERT INTO `capabilities` (`code`,`domain`,`name`,`description`,`riskLevel`,`defaultAuditMode`,`status`,`replacementCode`,`deletedAt`) VALUES
  ('idea.create','idea','创建创意','创建本人创意草稿','sensitive','allow_and_deny','active',NULL,NULL),
  ('idea.view_public','idea','查看公开创意','查看已发布公开创意','normal','deny','active',NULL,NULL),
  ('idea.view_private','idea','查看受限创意','查看本人或受邀的私密/NDA创意','sensitive','allow_and_deny','active',NULL,NULL),
  ('idea.edit','idea','编辑创意','编辑本人尚未归档的创意','sensitive','allow_and_deny','active',NULL,NULL),
  ('idea.publish','idea','发布创意','发布本人创意','sensitive','allow_and_deny','active',NULL,NULL),
  ('idea.archive','idea','归档创意','归档本人创意','sensitive','allow_and_deny','active',NULL,NULL),
  ('idea.attachment.upload','idea','上传创意附件','向本人创意添加附件','high','allow_and_deny','active',NULL,NULL),
  ('idea.attachment.download','idea','下载创意附件','按保密和NDA规则读取创意附件','high','allow_and_deny','active',NULL,NULL),
  ('idea.collaborator.invite','idea','邀请创意协作者','邀请指定身份参与创意协作','high','allow_and_deny','active',NULL,NULL),
  ('idea.invitation.accept','idea','处理创意邀请','接受或拒绝发给本人的创意邀请','sensitive','allow_and_deny','active',NULL,NULL),
  ('idea.nda.accept','idea','接受创意NDA','接受指定版本的创意保密协议','high','allow_and_deny','active',NULL,NULL),
  ('idea.convert_to_project','idea','创意转项目','将协作创意幂等转换为项目','high','allow_and_deny','active',NULL,NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
  BINARY `capabilities`.`domain` <=> BINARY new.`domain`
  AND BINARY `capabilities`.`name` <=> BINARY new.`name`
  AND BINARY `capabilities`.`description` <=> BINARY new.`description`
  AND BINARY `capabilities`.`riskLevel` <=> BINARY new.`riskLevel`
  AND BINARY `capabilities`.`defaultAuditMode` <=> BINARY new.`defaultAuditMode`
  AND BINARY `capabilities`.`status` <=> BINARY new.`status`,
  `capabilities`.`code`, NULL
);
