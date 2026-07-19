CREATE TABLE `device_push_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` enum('ios','android','web') NOT NULL,
	`token` varchar(512) NOT NULL,
	`deviceId` varchar(128),
	`active` boolean NOT NULL DEFAULT true,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `device_push_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_push_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `file_access_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`action` enum('upload','download','preview','disable') NOT NULL,
	`relatedEntityType` varchar(32),
	`relatedEntityId` int,
	`ipAddress` varchar(64),
	`deviceId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_accessories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`conditionNote` varchar(255),
	CONSTRAINT `item_accessories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_defects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`defectType` varchar(64),
	`description` text NOT NULL,
	`severity` enum('minor','moderate','major') NOT NULL DEFAULT 'minor',
	`markerData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_defects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`fileId` int,
	`url` text,
	`mediaType` enum('image','video') NOT NULL DEFAULT 'image',
	`purpose` enum('cover','detail','defect') NOT NULL DEFAULT 'detail',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_ownership_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`fromUserId` int,
	`toUserId` int,
	`transferType` enum('created','sold','swapped','given_away','recycled','admin_correction') NOT NULL,
	`orderId` int,
	`note` varchar(255),
	`transferredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_ownership_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_service_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`serviceType` enum('repair','maintenance','inspection','refurbishment','upgrade') NOT NULL,
	`providerUserId` int,
	`description` text NOT NULL,
	`amount` int,
	`servicedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_service_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_status_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32) NOT NULL,
	`operatorId` int,
	`reason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_status_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`category` varchar(64) DEFAULT '其他',
	`brand` varchar(64),
	`model` varchar(128),
	`conditionLevel` varchar(32) DEFAULT '九成新',
	`functionStatus` varchar(32) DEFAULT '功能正常',
	`purchasePrice` int,
	`purchasedAt` timestamp,
	`cityName` varchar(64) DEFAULT '北京',
	`status` enum('in_use','idle','listed','reserved','sold','swapped','given_away','recycling','recycled','under_repair','archived') NOT NULL DEFAULT 'idle',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listing_modes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`modeCode` enum('fixed_price','accept_offers','swap','giveaway','recycle','rental') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`configuration` json,
	CONSTRAINT `listing_modes_id` PRIMARY KEY(`id`),
	CONSTRAINT `listing_modes_listing_mode_unique` UNIQUE(`listingId`,`modeCode`)
);
--> statement-breakpoint
CREATE TABLE `message_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`deliveredAt` timestamp,
	`readAt` timestamp,
	CONSTRAINT `message_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_receipts_message_user_unique` UNIQUE(`messageId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` int NOT NULL,
	`channel` enum('in_app','push') NOT NULL DEFAULT 'in_app',
	`provider` varchar(32) NOT NULL DEFAULT 'log',
	`status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
	`providerMessageId` varchar(128),
	`errorMessage` varchar(500),
	`attemptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stored_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`provider` enum('local','s3') NOT NULL DEFAULT 'local',
	`storageKey` varchar(500) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`sizeBytes` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`privacyLevel` enum('public','business','sensitive','high_sensitive') NOT NULL DEFAULT 'business',
	`virusScanStatus` enum('pending','clean','rejected','unavailable') NOT NULL DEFAULT 'pending',
	`status` enum('uploading','available','disabled','archived') NOT NULL DEFAULT 'available',
	`relatedEntityType` varchar(32),
	`relatedEntityId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stored_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `stored_files_storage_key_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
ALTER TABLE `listings` ADD `itemId` int;--> statement-breakpoint
ALTER TABLE `device_push_tokens` ADD CONSTRAINT `device_push_tokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `file_access_logs` ADD CONSTRAINT `file_access_logs_fileId_stored_files_id_fk` FOREIGN KEY (`fileId`) REFERENCES `stored_files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `file_access_logs` ADD CONSTRAINT `file_access_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_accessories` ADD CONSTRAINT `item_accessories_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_defects` ADD CONSTRAINT `item_defects_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_media` ADD CONSTRAINT `item_media_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_ownership_history` ADD CONSTRAINT `item_ownership_history_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_ownership_history` ADD CONSTRAINT `item_ownership_history_fromUserId_users_id_fk` FOREIGN KEY (`fromUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_ownership_history` ADD CONSTRAINT `item_ownership_history_toUserId_users_id_fk` FOREIGN KEY (`toUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_ownership_history` ADD CONSTRAINT `item_ownership_history_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_service_history` ADD CONSTRAINT `item_service_history_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_service_history` ADD CONSTRAINT `item_service_history_providerUserId_users_id_fk` FOREIGN KEY (`providerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_status_logs` ADD CONSTRAINT `item_status_logs_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_status_logs` ADD CONSTRAINT `item_status_logs_operatorId_users_id_fk` FOREIGN KEY (`operatorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listing_modes` ADD CONSTRAINT `listing_modes_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_receipts` ADD CONSTRAINT `message_receipts_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_receipts` ADD CONSTRAINT `message_receipts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_notificationId_notifications_id_fk` FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stored_files` ADD CONSTRAINT `stored_files_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `item_ownership_item_time_idx` ON `item_ownership_history` (`itemId`,`transferredAt`);--> statement-breakpoint
CREATE INDEX `items_owner_status_idx` ON `items` (`ownerId`,`status`);--> statement-breakpoint
CREATE INDEX `stored_files_sha_idx` ON `stored_files` (`sha256`);--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `legacyListingId` int NULL;
--> statement-breakpoint
INSERT INTO `items` (`ownerId`,`title`,`category`,`brand`,`conditionLevel`,`functionStatus`,`cityName`,`status`,`createdAt`,`updatedAt`,`legacyListingId`)
SELECT `sellerId`,`title`,`category`,`brand`,`conditionLevel`,`functionStatus`,`cityName`,
  CASE `itemStatus`
    WHEN 'reserved' THEN 'reserved' WHEN 'sold' THEN 'sold' WHEN 'swapped' THEN 'swapped'
    WHEN 'given_away' THEN 'given_away' WHEN 'recycling' THEN 'recycling' WHEN 'recycled' THEN 'recycled'
    ELSE 'listed' END,
  `createdAt`,`updatedAt`,`id`
FROM `listings` WHERE `itemId` IS NULL;
--> statement-breakpoint
UPDATE `listings` l JOIN `items` i ON i.`legacyListingId` = l.`id` SET l.`itemId` = i.`id` WHERE l.`itemId` IS NULL;
--> statement-breakpoint
INSERT INTO `item_ownership_history` (`itemId`,`fromUserId`,`toUserId`,`transferType`,`note`,`transferredAt`)
SELECT i.`id`,NULL,i.`ownerId`,'created','V3.2 迁移自历史旧物发布',i.`createdAt` FROM `items` i WHERE i.`legacyListingId` IS NOT NULL;
--> statement-breakpoint
INSERT IGNORE INTO `listing_modes` (`listingId`,`modeCode`,`active`)
SELECT l.`id`, jt.modeCode, true FROM `listings` l
JOIN JSON_TABLE(COALESCE(l.`modes`, JSON_ARRAY(l.`primaryMode`)), '$[*]' COLUMNS(modeCode VARCHAR(32) PATH '$')) jt
WHERE jt.modeCode IN ('fixed_price','accept_offers','swap','giveaway','recycle','rental');
--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `legacyListingId`;
--> statement-breakpoint
ALTER TABLE `listings` MODIFY `itemId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `listings_item_status_idx` ON `listings` (`itemId`,`status`);
