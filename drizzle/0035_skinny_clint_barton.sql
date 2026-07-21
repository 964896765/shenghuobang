CREATE TABLE `content_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`authorAccountId` int NOT NULL,
	`parentCommentId` int,
	`body` text NOT NULL,
	`status` enum('published','author_deleted','platform_removed') NOT NULL DEFAULT 'published',
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` timestamp,
	CONSTRAINT `content_comments_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_comments_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `content_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`versionNo` int NOT NULL,
	`snapshot` json NOT NULL,
	`savedByAccountId` int NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_drafts_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_drafts_post_version_uq` UNIQUE(`postId`,`versionNo`),
	CONSTRAINT `content_drafts_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `content_follows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`followerAccountId` int NOT NULL,
	`followedAccountId` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_follows_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_follows_pair_uq` UNIQUE(`followerAccountId`,`followedAccountId`),
	CONSTRAINT `content_follows_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `content_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`accountId` int NOT NULL,
	`interactionType` enum('like','favorite','share','view','product_click','listing_click','idea_click') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_interactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_interactions_account_type_uq` UNIQUE(`postId`,`accountId`,`interactionType`),
	CONSTRAINT `content_interactions_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `content_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`fileId` int NOT NULL,
	`mediaType` enum('image','video') NOT NULL,
	`purpose` enum('cover','body') NOT NULL DEFAULT 'body',
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('active','removed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_media_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_media_post_file_uq` UNIQUE(`postId`,`fileId`)
);
--> statement-breakpoint
CREATE TABLE `content_metrics` (
	`postId` int NOT NULL,
	`viewCount` int NOT NULL DEFAULT 0,
	`likeCount` int NOT NULL DEFAULT 0,
	`favoriteCount` int NOT NULL DEFAULT 0,
	`commentCount` int NOT NULL DEFAULT 0,
	`shareCount` int NOT NULL DEFAULT 0,
	`productClickCount` int NOT NULL DEFAULT 0,
	`listingClickCount` int NOT NULL DEFAULT 0,
	`ideaClickCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_metrics_postId` PRIMARY KEY(`postId`)
);
--> statement-breakpoint
CREATE TABLE `content_moderation_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`actorAccountId` int,
	`moderationType` enum('automated','manual') NOT NULL,
	`decision` enum('approved','rejected','limited','banned') NOT NULL,
	`reasonCode` varchar(64) NOT NULL,
	`detail` json NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_moderation_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_moderation_records_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `content_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicCode` varchar(36) NOT NULL,
	`authorAccountId` int NOT NULL,
	`authorIdentityId` int,
	`organizationId` int,
	`contentType` enum('post','video','article','question','product_review','tutorial','idea_progress','funding_update','repair_case') NOT NULL,
	`title` varchar(180) NOT NULL,
	`summary` varchar(500),
	`body` text NOT NULL,
	`locationLabel` varchar(100),
	`visibility` enum('public','followers','private') NOT NULL DEFAULT 'private',
	`sourceType` enum('personal_experience','organization_official','service_case','platform_verified','external_public','ai_assisted','unverified_claim') NOT NULL DEFAULT 'personal_experience',
	`sourceStatement` varchar(500),
	`aiAssisted` boolean NOT NULL DEFAULT false,
	`aiConfirmedAt` timestamp,
	`allowComments` boolean NOT NULL DEFAULT true,
	`status` enum('draft','ready_to_publish','reviewing','published','rejected','recommendation_limited','unpublished','author_deleted','platform_banned') NOT NULL DEFAULT 'draft',
	`moderationReason` varchar(500),
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`createdRequestId` varchar(64) NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`publishedAt` timestamp,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_posts_public_code_uq` UNIQUE(`publicCode`),
	CONSTRAINT `content_posts_created_request_uq` UNIQUE(`createdRequestId`),
	CONSTRAINT `content_posts_last_request_uq` UNIQUE(`lastRequestId`)
);
--> statement-breakpoint
CREATE TABLE `content_relations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`relationType` enum('demand','idea','funding_project','product','product_unit','listing','repair','service','donation','recycling','account','organization') NOT NULL,
	`relationId` int NOT NULL,
	`relationLabel` varchar(180),
	`createdByAccountId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_relations_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_relations_post_relation_uq` UNIQUE(`postId`,`relationType`,`relationId`)
);
--> statement-breakpoint
CREATE TABLE `content_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`reporterAccountId` int NOT NULL,
	`reasonCode` varchar(64) NOT NULL,
	`detail` varchar(1000),
	`status` enum('submitted','reviewing','resolved','dismissed') NOT NULL DEFAULT 'submitted',
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `content_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_reports_reporter_post_uq` UNIQUE(`postId`,`reporterAccountId`),
	CONSTRAINT `content_reports_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `content_tag_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`tagId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_tag_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_tag_links_post_tag_uq` UNIQUE(`postId`,`tagId`)
);
--> statement-breakpoint
CREATE TABLE `content_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`normalizedName` varchar(64) NOT NULL,
	`displayName` varchar(64) NOT NULL,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_tags_normalized_name_uq` UNIQUE(`normalizedName`)
);
--> statement-breakpoint
CREATE TABLE `creator_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`displayName` varchar(100),
	`bio` varchar(500),
	`verificationLabel` varchar(100),
	`publishedCount` int NOT NULL DEFAULT 0,
	`followerCount` int NOT NULL DEFAULT 0,
	`followingCount` int NOT NULL DEFAULT 0,
	`totalViewCount` int NOT NULL DEFAULT 0,
	`totalLikeCount` int NOT NULL DEFAULT 0,
	`totalFavoriteCount` int NOT NULL DEFAULT 0,
	`totalCommentCount` int NOT NULL DEFAULT 0,
	`productClickCount` int NOT NULL DEFAULT 0,
	`ideaClickCount` int NOT NULL DEFAULT 0,
	`listingClickCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creator_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `creator_profiles_account_uq` UNIQUE(`accountId`)
);
--> statement-breakpoint
CREATE TABLE `design_version_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`designVersionId` int NOT NULL,
	`projectFileId` int NOT NULL,
	`fileRole` enum('source','preview','reference','specification','other') NOT NULL DEFAULT 'other',
	`sortOrder` int NOT NULL DEFAULT 0,
	`uploadedByProjectMembershipId` int NOT NULL,
	`disabledAt` timestamp,
	`accessPolicyVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `design_version_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_version_files_version_file_uq` UNIQUE(`designVersionId`,`projectFileId`)
);
--> statement-breakpoint
CREATE TABLE `design_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`versionNo` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`summary` varchar(500) NOT NULL,
	`changeNotes` text,
	`status` enum('draft','submitted','superseded','withdrawn') NOT NULL DEFAULT 'draft',
	`createdByProjectMembershipId` int NOT NULL,
	`submittedByProjectMembershipId` int,
	`submittedAt` timestamp,
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_versions_project_version_uq` UNIQUE(`projectId`,`versionNo`),
	CONSTRAINT `design_versions_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `funding_campaign_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`sequenceNumber` int NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`actorAccountId` int NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32),
	`pledgeId` int,
	`requestId` varchar(64) NOT NULL,
	`detail` json NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `funding_campaign_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `funding_campaign_events_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `funding_campaign_events_campaign_sequence_uq` UNIQUE(`campaignId`,`sequenceNumber`)
);
--> statement-breakpoint
CREATE TABLE `funding_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicCode` varchar(32) NOT NULL,
	`ownerAccountId` int NOT NULL,
	`sourceType` enum('need','idea','project','product_model') NOT NULL,
	`sourceId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`summary` varchar(500) NOT NULL,
	`description` text NOT NULL,
	`categoryCode` varchar(64) NOT NULL,
	`coverUrl` varchar(1000),
	`goalQuantity` int NOT NULL,
	`pledgedQuantity` int NOT NULL DEFAULT 0,
	`activePledgeCount` int NOT NULL DEFAULT 0,
	`evidence` json NOT NULL,
	`verificationSummary` text,
	`riskSummary` text NOT NULL,
	`visibility` enum('public','owner_only') NOT NULL DEFAULT 'owner_only',
	`status` enum('draft','reviewing','active','succeeded','failed','cancelled','closed') NOT NULL DEFAULT 'draft',
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`activeSourceDedupeKey` varchar(191),
	`createdRequestId` varchar(64) NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`publishedAt` timestamp,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `funding_campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `funding_campaigns_public_code_uq` UNIQUE(`publicCode`),
	CONSTRAINT `funding_campaigns_active_source_uq` UNIQUE(`activeSourceDedupeKey`),
	CONSTRAINT `funding_campaigns_created_request_uq` UNIQUE(`createdRequestId`),
	CONSTRAINT `funding_campaigns_last_request_uq` UNIQUE(`lastRequestId`)
);
--> statement-breakpoint
CREATE TABLE `funding_pledges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`supporterAccountId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`note` text,
	`cityName` varchar(100),
	`status` enum('active','withdrawn') NOT NULL DEFAULT 'active',
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`activeDedupeKey` varchar(191),
	`requestId` varchar(64) NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`withdrawnAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `funding_pledges_id` PRIMARY KEY(`id`),
	CONSTRAINT `funding_pledges_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `funding_pledges_last_request_uq` UNIQUE(`lastRequestId`),
	CONSTRAINT `funding_pledges_active_dedupe_uq` UNIQUE(`activeDedupeKey`)
);
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
	CONSTRAINT `idea_attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `idea_attachments_idea_file_uq` UNIQUE(`ideaId`,`fileId`)
);
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
	CONSTRAINT `idea_collaboration_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `idea_invitations_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `idea_invitations_active_dedupe_uq` UNIQUE(`activeDedupeKey`)
);
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
	CONSTRAINT `idea_nda_acceptances_id` PRIMARY KEY(`id`),
	CONSTRAINT `idea_nda_idea_account_identity_uq` UNIQUE(`ideaId`,`accountId`,`identityId`),
	CONSTRAINT `idea_nda_request_uq` UNIQUE(`requestId`)
);
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
	CONSTRAINT `ideas_id` PRIMARY KEY(`id`),
	CONSTRAINT `ideas_converted_project_uq` UNIQUE(`convertedProjectId`)
);
--> statement-breakpoint
CREATE TABLE `milestone_acceptance_rounds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`milestoneId` int NOT NULL,
	`submissionId` int NOT NULL,
	`roundNo` int NOT NULL,
	`status` enum('pending_review','accepted','revision_requested','superseded') NOT NULL DEFAULT 'pending_review',
	`reviewerProjectMembershipId` int,
	`decisionNote` text,
	`requestId` varchar(64) NOT NULL,
	`decidedAt` timestamp,
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `milestone_acceptance_rounds_id` PRIMARY KEY(`id`),
	CONSTRAINT `milestone_acceptance_rounds_submission_uq` UNIQUE(`submissionId`),
	CONSTRAINT `milestone_acceptance_rounds_milestone_round_uq` UNIQUE(`milestoneId`,`roundNo`),
	CONSTRAINT `milestone_acceptance_rounds_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `milestone_deliverable_submission_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`projectFileId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`disabledAt` timestamp,
	`accessPolicyVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `milestone_deliverable_submission_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `milestone_deliverable_submission_files_submission_file_uq` UNIQUE(`submissionId`,`projectFileId`)
);
--> statement-breakpoint
CREATE TABLE `milestone_deliverable_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`milestoneId` int NOT NULL,
	`submissionVersion` int NOT NULL,
	`note` text NOT NULL,
	`submittedByProjectMembershipId` int NOT NULL,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`requestId` varchar(64) NOT NULL,
	`status` enum('submitted','superseded') NOT NULL DEFAULT 'submitted',
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `milestone_deliverable_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `milestone_deliverable_submissions_milestone_version_uq` UNIQUE(`milestoneId`,`submissionVersion`),
	CONSTRAINT `milestone_deliverable_submissions_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `milestone_revision_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`milestoneId` int NOT NULL,
	`acceptanceRoundId` int NOT NULL,
	`reason` text NOT NULL,
	`requirementsJson` json,
	`assignedProjectMembershipId` int,
	`dueAt` timestamp,
	`status` enum('open','resubmitted','closed') NOT NULL DEFAULT 'open',
	`createdByProjectMembershipId` int NOT NULL,
	`resolvedBySubmissionId` int,
	`requestId` varchar(64) NOT NULL,
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `milestone_revision_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `milestone_revision_requests_round_uq` UNIQUE(`acceptanceRoundId`),
	CONSTRAINT `milestone_revision_requests_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `product_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicCode` varchar(32) NOT NULL,
	`ownerAccountId` int NOT NULL,
	`ownerOrganizationId` int,
	`name` varchar(160) NOT NULL,
	`summary` varchar(500) NOT NULL,
	`description` text,
	`categoryCode` varchar(64) NOT NULL,
	`brandName` varchar(128),
	`modelCode` varchar(128),
	`versionLabel` varchar(64) NOT NULL DEFAULT 'v1',
	`specifications` json NOT NULL,
	`visibility` enum('public','owner_only','restricted') NOT NULL DEFAULT 'owner_only',
	`status` enum('draft','active','retired','archived') NOT NULL DEFAULT 'draft',
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`createdRequestId` varchar(64) NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`publishedAt` timestamp,
	`retiredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `product_models_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_models_public_code_uq` UNIQUE(`publicCode`),
	CONSTRAINT `product_models_created_request_uq` UNIQUE(`createdRequestId`),
	CONSTRAINT `product_models_last_request_uq` UNIQUE(`lastRequestId`)
);
--> statement-breakpoint
CREATE TABLE `product_passport_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productUnitId` int NOT NULL,
	`sequenceNumber` int NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`actorAccountId` int,
	`actorOrganizationId` int,
	`fromStatus` varchar(32),
	`toStatus` varchar(32),
	`visibility` enum('public','owner','internal') NOT NULL DEFAULT 'owner',
	`sourceType` varchar(64),
	`sourceId` varchar(64),
	`requestId` varchar(64) NOT NULL,
	`detail` json NOT NULL,
	`previousEventHash` char(64),
	`eventHash` char(64) NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_passport_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_passport_events_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `product_passport_events_unit_sequence_uq` UNIQUE(`productUnitId`,`sequenceNumber`)
);
--> statement-breakpoint
CREATE TABLE `product_source_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productModelId` int NOT NULL,
	`sourceType` enum('need','idea','project','legacy_item','funding_campaign') NOT NULL,
	`sourceId` int NOT NULL,
	`relationType` enum('derived_from','validated_by','produced_by','migrated_from') NOT NULL DEFAULT 'derived_from',
	`createdByAccountId` int NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_source_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_source_links_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `product_source_links_relation_uq` UNIQUE(`productModelId`,`sourceType`,`sourceId`,`relationType`)
);
--> statement-breakpoint
CREATE TABLE `product_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productModelId` int NOT NULL,
	`linkedItemId` int,
	`currentOwnerAccountId` int,
	`publicCode` varchar(40) NOT NULL,
	`serialNumber` varchar(128),
	`batchCode` varchar(96),
	`status` enum('registered','manufactured','in_use','idle','listed','under_service','transferred','recycling','recycled','retired') NOT NULL DEFAULT 'registered',
	`trustLevel` enum('self_declared','verified','certified') NOT NULL DEFAULT 'self_declared',
	`passportVisibility` enum('public','owner_only','restricted') NOT NULL DEFAULT 'owner_only',
	`authorizationVersion` int NOT NULL DEFAULT 1,
	`createdRequestId` varchar(64) NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`manufacturedAt` timestamp,
	`activatedAt` timestamp,
	`retiredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_units_public_code_uq` UNIQUE(`publicCode`),
	CONSTRAINT `product_units_created_request_uq` UNIQUE(`createdRequestId`),
	CONSTRAINT `product_units_last_request_uq` UNIQUE(`lastRequestId`),
	CONSTRAINT `product_units_linked_item_uq` UNIQUE(`linkedItemId`),
	CONSTRAINT `product_units_model_serial_uq` UNIQUE(`productModelId`,`serialNumber`)
);
--> statement-breakpoint
CREATE TABLE `project_intentions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`accountId` int NOT NULL,
	`intentionType` enum('follow','trial','purchase_interest','collaboration_interest') NOT NULL,
	`note` text,
	`status` enum('active','withdrawn') NOT NULL DEFAULT 'active',
	`activeDedupeKey` varchar(191),
	`requestId` varchar(64) NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_intentions_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_intentions_request_uq` UNIQUE(`requestId`),
	CONSTRAINT `project_intentions_active_dedupe_uq` UNIQUE(`activeDedupeKey`)
);
--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `needId` int;--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `quoteId` int;--> statement-breakpoint
ALTER TABLE `milestones` ADD `milestoneType` enum('general','prototype') DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `milestones` ADD `prototypeTaskType` enum('designer','engineer');--> statement-breakpoint
ALTER TABLE `milestones` ADD `startedAt` timestamp;--> statement-breakpoint
ALTER TABLE `milestones` ADD `startedByProjectMembershipId` int;--> statement-breakpoint
ALTER TABLE `content_comments` ADD CONSTRAINT `content_comments_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_comments` ADD CONSTRAINT `content_comments_authorAccountId_users_id_fk` FOREIGN KEY (`authorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_drafts` ADD CONSTRAINT `content_drafts_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_drafts` ADD CONSTRAINT `content_drafts_savedByAccountId_users_id_fk` FOREIGN KEY (`savedByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_follows` ADD CONSTRAINT `content_follows_followerAccountId_users_id_fk` FOREIGN KEY (`followerAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_follows` ADD CONSTRAINT `content_follows_followedAccountId_users_id_fk` FOREIGN KEY (`followedAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_interactions` ADD CONSTRAINT `content_interactions_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_interactions` ADD CONSTRAINT `content_interactions_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_media` ADD CONSTRAINT `content_media_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_media` ADD CONSTRAINT `content_media_fileId_stored_files_id_fk` FOREIGN KEY (`fileId`) REFERENCES `stored_files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_metrics` ADD CONSTRAINT `content_metrics_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_moderation_records` ADD CONSTRAINT `content_moderation_records_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_moderation_records` ADD CONSTRAINT `content_moderation_records_actorAccountId_users_id_fk` FOREIGN KEY (`actorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_posts` ADD CONSTRAINT `content_posts_authorAccountId_users_id_fk` FOREIGN KEY (`authorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_posts` ADD CONSTRAINT `content_posts_authorIdentityId_business_identities_id_fk` FOREIGN KEY (`authorIdentityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_posts` ADD CONSTRAINT `content_posts_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_relations` ADD CONSTRAINT `content_relations_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_relations` ADD CONSTRAINT `content_relations_createdByAccountId_users_id_fk` FOREIGN KEY (`createdByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_reporterAccountId_users_id_fk` FOREIGN KEY (`reporterAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_tag_links` ADD CONSTRAINT `content_tag_links_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_tag_links` ADD CONSTRAINT `content_tag_links_tagId_content_tags_id_fk` FOREIGN KEY (`tagId`) REFERENCES `content_tags`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creator_profiles` ADD CONSTRAINT `creator_profiles_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_version_files` ADD CONSTRAINT `design_version_files_designVersionId_design_versions_id_fk` FOREIGN KEY (`designVersionId`) REFERENCES `design_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_version_files` ADD CONSTRAINT `design_version_files_projectFileId_project_files_id_fk` FOREIGN KEY (`projectFileId`) REFERENCES `project_files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_version_files` ADD CONSTRAINT `design_version_files_uploadedByProjectMembershipId_project_memberships_id_fk` FOREIGN KEY (`uploadedByProjectMembershipId`) REFERENCES `project_memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_versions` ADD CONSTRAINT `design_versions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_versions` ADD CONSTRAINT `design_versions_creator_project_membership_fk` FOREIGN KEY (`projectId`,`createdByProjectMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_versions` ADD CONSTRAINT `design_versions_submitter_project_membership_fk` FOREIGN KEY (`projectId`,`submittedByProjectMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `funding_campaign_events` ADD CONSTRAINT `funding_campaign_events_campaignId_funding_campaigns_id_fk` FOREIGN KEY (`campaignId`) REFERENCES `funding_campaigns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `funding_campaign_events` ADD CONSTRAINT `funding_campaign_events_actorAccountId_users_id_fk` FOREIGN KEY (`actorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `funding_campaign_events` ADD CONSTRAINT `funding_campaign_events_pledgeId_funding_pledges_id_fk` FOREIGN KEY (`pledgeId`) REFERENCES `funding_pledges`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `funding_campaigns` ADD CONSTRAINT `funding_campaigns_ownerAccountId_users_id_fk` FOREIGN KEY (`ownerAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `funding_pledges` ADD CONSTRAINT `funding_pledges_campaignId_funding_campaigns_id_fk` FOREIGN KEY (`campaignId`) REFERENCES `funding_campaigns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `funding_pledges` ADD CONSTRAINT `funding_pledges_supporterAccountId_users_id_fk` FOREIGN KEY (`supporterAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_attachments` ADD CONSTRAINT `idea_attachments_ideaId_ideas_id_fk` FOREIGN KEY (`ideaId`) REFERENCES `ideas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_attachments` ADD CONSTRAINT `idea_attachments_fileId_stored_files_id_fk` FOREIGN KEY (`fileId`) REFERENCES `stored_files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_attachments` ADD CONSTRAINT `idea_attachments_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_collaboration_invitations` ADD CONSTRAINT `idea_collaboration_invitations_ideaId_ideas_id_fk` FOREIGN KEY (`ideaId`) REFERENCES `ideas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_collaboration_invitations` ADD CONSTRAINT `idea_collaboration_invitations_inviterAccountId_users_id_fk` FOREIGN KEY (`inviterAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_collaboration_invitations` ADD CONSTRAINT `idea_collaboration_invitations_invitedAccountId_users_id_fk` FOREIGN KEY (`invitedAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_collaboration_invitations` ADD CONSTRAINT `idea_collaboration_invitations_invitedIdentityId_business_identities_id_fk` FOREIGN KEY (`invitedIdentityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_nda_acceptances` ADD CONSTRAINT `idea_nda_acceptances_ideaId_ideas_id_fk` FOREIGN KEY (`ideaId`) REFERENCES `ideas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_nda_acceptances` ADD CONSTRAINT `idea_nda_acceptances_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_nda_acceptances` ADD CONSTRAINT `idea_nda_acceptances_identityId_business_identities_id_fk` FOREIGN KEY (`identityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_creatorAccountId_users_id_fk` FOREIGN KEY (`creatorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_creatorIdentityId_business_identities_id_fk` FOREIGN KEY (`creatorIdentityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_coverFileId_stored_files_id_fk` FOREIGN KEY (`coverFileId`) REFERENCES `stored_files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_convertedProjectId_projects_id_fk` FOREIGN KEY (`convertedProjectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_acceptance_rounds` ADD CONSTRAINT `milestone_acceptance_rounds_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_acceptance_rounds` ADD CONSTRAINT `milestone_acceptance_rounds_milestoneId_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_acceptance_rounds` ADD CONSTRAINT `milestone_acceptance_rounds_submissionId_milestone_deliverable_submissions_id_fk` FOREIGN KEY (`submissionId`) REFERENCES `milestone_deliverable_submissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_acceptance_rounds` ADD CONSTRAINT `milestone_acceptance_rounds_reviewer_project_membership_fk` FOREIGN KEY (`projectId`,`reviewerProjectMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_deliverable_submission_files` ADD CONSTRAINT `milestone_deliverable_submission_files_submissionId_milestone_deliverable_submissions_id_fk` FOREIGN KEY (`submissionId`) REFERENCES `milestone_deliverable_submissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_deliverable_submission_files` ADD CONSTRAINT `milestone_deliverable_submission_files_projectFileId_project_files_id_fk` FOREIGN KEY (`projectFileId`) REFERENCES `project_files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_deliverable_submissions` ADD CONSTRAINT `milestone_deliverable_submissions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_deliverable_submissions` ADD CONSTRAINT `milestone_deliverable_submissions_milestoneId_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_deliverable_submissions` ADD CONSTRAINT `milestone_deliverable_submissions_submitter_project_membership_fk` FOREIGN KEY (`projectId`,`submittedByProjectMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_revision_requests` ADD CONSTRAINT `milestone_revision_requests_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_revision_requests` ADD CONSTRAINT `milestone_revision_requests_milestoneId_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_revision_requests` ADD CONSTRAINT `milestone_revision_requests_acceptanceRoundId_milestone_acceptance_rounds_id_fk` FOREIGN KEY (`acceptanceRoundId`) REFERENCES `milestone_acceptance_rounds`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_revision_requests` ADD CONSTRAINT `milestone_revision_requests_resolvedBySubmissionId_milestone_deliverable_submissions_id_fk` FOREIGN KEY (`resolvedBySubmissionId`) REFERENCES `milestone_deliverable_submissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_revision_requests` ADD CONSTRAINT `milestone_revision_requests_assignee_project_membership_fk` FOREIGN KEY (`projectId`,`assignedProjectMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestone_revision_requests` ADD CONSTRAINT `milestone_revision_requests_creator_project_membership_fk` FOREIGN KEY (`projectId`,`createdByProjectMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_models` ADD CONSTRAINT `product_models_ownerAccountId_users_id_fk` FOREIGN KEY (`ownerAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_models` ADD CONSTRAINT `product_models_ownerOrganizationId_organizations_id_fk` FOREIGN KEY (`ownerOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_passport_events` ADD CONSTRAINT `product_passport_events_productUnitId_product_units_id_fk` FOREIGN KEY (`productUnitId`) REFERENCES `product_units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_passport_events` ADD CONSTRAINT `product_passport_events_actorAccountId_users_id_fk` FOREIGN KEY (`actorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_passport_events` ADD CONSTRAINT `product_passport_events_actorOrganizationId_organizations_id_fk` FOREIGN KEY (`actorOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_source_links` ADD CONSTRAINT `product_source_links_productModelId_product_models_id_fk` FOREIGN KEY (`productModelId`) REFERENCES `product_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_source_links` ADD CONSTRAINT `product_source_links_createdByAccountId_users_id_fk` FOREIGN KEY (`createdByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_units` ADD CONSTRAINT `product_units_productModelId_product_models_id_fk` FOREIGN KEY (`productModelId`) REFERENCES `product_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_units` ADD CONSTRAINT `product_units_linkedItemId_items_id_fk` FOREIGN KEY (`linkedItemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_units` ADD CONSTRAINT `product_units_currentOwnerAccountId_users_id_fk` FOREIGN KEY (`currentOwnerAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_intentions` ADD CONSTRAINT `project_intentions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_intentions` ADD CONSTRAINT `project_intentions_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `content_comments_post_time_idx` ON `content_comments` (`postId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `content_follows_follower_idx` ON `content_follows` (`followerAccountId`,`active`);--> statement-breakpoint
CREATE INDEX `content_follows_followed_idx` ON `content_follows` (`followedAccountId`,`active`);--> statement-breakpoint
CREATE INDEX `content_interactions_post_type_idx` ON `content_interactions` (`postId`,`interactionType`,`active`);--> statement-breakpoint
CREATE INDEX `content_media_post_order_idx` ON `content_media` (`postId`,`status`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `content_moderation_records_post_time_idx` ON `content_moderation_records` (`postId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `content_posts_author_status_idx` ON `content_posts` (`authorAccountId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `content_posts_discovery_idx` ON `content_posts` (`status`,`visibility`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `content_posts_type_discovery_idx` ON `content_posts` (`contentType`,`status`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `content_posts_location_idx` ON `content_posts` (`locationLabel`,`status`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `content_relations_target_idx` ON `content_relations` (`relationType`,`relationId`);--> statement-breakpoint
CREATE INDEX `content_reports_status_idx` ON `content_reports` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `content_tag_links_tag_idx` ON `content_tag_links` (`tagId`,`postId`);--> statement-breakpoint
CREATE INDEX `design_version_files_version_state_idx` ON `design_version_files` (`designVersionId`,`disabledAt`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `design_versions_project_status_idx` ON `design_versions` (`projectId`,`status`,`submittedAt`);--> statement-breakpoint
CREATE INDEX `funding_campaign_events_timeline_idx` ON `funding_campaign_events` (`campaignId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `funding_campaign_events_pledge_idx` ON `funding_campaign_events` (`pledgeId`);--> statement-breakpoint
CREATE INDEX `funding_campaigns_owner_status_idx` ON `funding_campaigns` (`ownerAccountId`,`status`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `funding_campaigns_public_feed_idx` ON `funding_campaigns` (`visibility`,`status`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `funding_campaigns_source_idx` ON `funding_campaigns` (`sourceType`,`sourceId`);--> statement-breakpoint
CREATE INDEX `funding_campaigns_deadline_idx` ON `funding_campaigns` (`status`,`endsAt`);--> statement-breakpoint
CREATE INDEX `funding_pledges_supporter_status_idx` ON `funding_pledges` (`supporterAccountId`,`status`);--> statement-breakpoint
CREATE INDEX `funding_pledges_campaign_status_idx` ON `funding_pledges` (`campaignId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idea_attachments_idea_state_idx` ON `idea_attachments` (`ideaId`,`disabledAt`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `idea_invitations_recipient_status_idx` ON `idea_collaboration_invitations` (`invitedAccountId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `idea_invitations_idea_status_idx` ON `idea_collaboration_invitations` (`ideaId`,`status`);--> statement-breakpoint
CREATE INDEX `idea_nda_account_state_idx` ON `idea_nda_acceptances` (`accountId`,`revokedAt`);--> statement-breakpoint
CREATE INDEX `ideas_creator_status_idx` ON `ideas` (`creatorAccountId`,`status`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `ideas_public_feed_idx` ON `ideas` (`visibility`,`status`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `milestone_acceptance_rounds_milestone_status_idx` ON `milestone_acceptance_rounds` (`milestoneId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `milestone_deliverable_submission_files_submission_state_idx` ON `milestone_deliverable_submission_files` (`submissionId`,`disabledAt`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `milestone_deliverable_submissions_project_milestone_status_idx` ON `milestone_deliverable_submissions` (`projectId`,`milestoneId`,`status`,`submittedAt`);--> statement-breakpoint
CREATE INDEX `milestone_revision_requests_milestone_status_idx` ON `milestone_revision_requests` (`milestoneId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `product_models_owner_status_idx` ON `product_models` (`ownerAccountId`,`status`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `product_models_organization_status_idx` ON `product_models` (`ownerOrganizationId`,`status`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `product_models_public_feed_idx` ON `product_models` (`visibility`,`status`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `product_passport_events_unit_timeline_idx` ON `product_passport_events` (`productUnitId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `product_passport_events_source_idx` ON `product_passport_events` (`sourceType`,`sourceId`);--> statement-breakpoint
CREATE INDEX `product_source_links_source_idx` ON `product_source_links` (`sourceType`,`sourceId`);--> statement-breakpoint
CREATE INDEX `product_units_model_status_idx` ON `product_units` (`productModelId`,`status`);--> statement-breakpoint
CREATE INDEX `product_units_owner_status_idx` ON `product_units` (`currentOwnerAccountId`,`status`);--> statement-breakpoint
CREATE INDEX `project_intentions_account_project_status_idx` ON `project_intentions` (`accountId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `project_intentions_project_type_status_idx` ON `project_intentions` (`projectId`,`intentionType`,`status`);--> statement-breakpoint
ALTER TABLE `milestones` ADD CONSTRAINT `milestones_starter_project_membership_fk` FOREIGN KEY (`projectId`,`startedByProjectMembershipId`) REFERENCES `project_memberships`(`projectId`,`id`) ON DELETE no action ON UPDATE no action;