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
ALTER TABLE `content_comments` ADD CONSTRAINT `content_comments_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_comments` ADD CONSTRAINT `content_comments_authorAccountId_users_id_fk` FOREIGN KEY (`authorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_drafts` ADD CONSTRAINT `content_drafts_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_drafts` ADD CONSTRAINT `content_drafts_savedByAccountId_users_id_fk` FOREIGN KEY (`savedByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_follows` ADD CONSTRAINT `content_follows_followerAccountId_users_id_fk` FOREIGN KEY (`followerAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_follows` ADD CONSTRAINT `content_follows_followedAccountId_users_id_fk` FOREIGN KEY (`followedAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_interactions` ADD CONSTRAINT `content_interactions_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_interactions` ADD CONSTRAINT `content_interactions_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_media` ADD CONSTRAINT `content_media_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_media` ADD CONSTRAINT `content_media_fileId_stored_files_id_fk` FOREIGN KEY (`fileId`) REFERENCES `stored_files`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_metrics` ADD CONSTRAINT `content_metrics_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_moderation_records` ADD CONSTRAINT `content_moderation_records_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_moderation_records` ADD CONSTRAINT `content_moderation_records_actorAccountId_users_id_fk` FOREIGN KEY (`actorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_posts` ADD CONSTRAINT `content_posts_authorAccountId_users_id_fk` FOREIGN KEY (`authorAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_posts` ADD CONSTRAINT `content_posts_authorIdentityId_business_identities_id_fk` FOREIGN KEY (`authorIdentityId`) REFERENCES `business_identities`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_posts` ADD CONSTRAINT `content_posts_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_relations` ADD CONSTRAINT `content_relations_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_relations` ADD CONSTRAINT `content_relations_createdByAccountId_users_id_fk` FOREIGN KEY (`createdByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_reporterAccountId_users_id_fk` FOREIGN KEY (`reporterAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_tag_links` ADD CONSTRAINT `content_tag_links_postId_content_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `content_posts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `content_tag_links` ADD CONSTRAINT `content_tag_links_tagId_content_tags_id_fk` FOREIGN KEY (`tagId`) REFERENCES `content_tags`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `creator_profiles` ADD CONSTRAINT `creator_profiles_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `content_comments_post_time_idx` ON `content_comments` (`postId`,`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `content_follows_follower_idx` ON `content_follows` (`followerAccountId`,`active`);
--> statement-breakpoint
CREATE INDEX `content_follows_followed_idx` ON `content_follows` (`followedAccountId`,`active`);
--> statement-breakpoint
CREATE INDEX `content_interactions_post_type_idx` ON `content_interactions` (`postId`,`interactionType`,`active`);
--> statement-breakpoint
CREATE INDEX `content_media_post_order_idx` ON `content_media` (`postId`,`status`,`sortOrder`);
--> statement-breakpoint
CREATE INDEX `content_moderation_records_post_time_idx` ON `content_moderation_records` (`postId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `content_posts_author_status_idx` ON `content_posts` (`authorAccountId`,`status`,`updatedAt`);
--> statement-breakpoint
CREATE INDEX `content_posts_discovery_idx` ON `content_posts` (`status`,`visibility`,`publishedAt`);
--> statement-breakpoint
CREATE INDEX `content_posts_type_discovery_idx` ON `content_posts` (`contentType`,`status`,`publishedAt`);
--> statement-breakpoint
CREATE INDEX `content_posts_location_idx` ON `content_posts` (`locationLabel`,`status`,`publishedAt`);
--> statement-breakpoint
CREATE INDEX `content_relations_target_idx` ON `content_relations` (`relationType`,`relationId`);
--> statement-breakpoint
CREATE INDEX `content_reports_status_idx` ON `content_reports` (`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `content_tag_links_tag_idx` ON `content_tag_links` (`tagId`,`postId`);
