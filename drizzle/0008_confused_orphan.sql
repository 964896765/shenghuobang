CREATE TABLE `app_schema_versions` (
	`version` varchar(32) NOT NULL,
	`appliedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_schema_versions_version` PRIMARY KEY(`version`)
);
--> statement-breakpoint
CREATE TABLE `migration_anomalies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`migrationVersion` varchar(32) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` int,
	`code` varchar(64) NOT NULL,
	`detail` json,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `migration_anomalies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `file_access_logs` ADD `result` enum('success','denied','failed') DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE `file_access_logs` ADD `reason` varchar(255);--> statement-breakpoint
ALTER TABLE `messages` ADD `clientMessageId` varchar(128);--> statement-breakpoint
UPDATE `messages` SET `clientMessageId` = CONCAT('legacy-', `id`) WHERE `clientMessageId` IS NULL;--> statement-breakpoint
ALTER TABLE `messages` MODIFY `clientMessageId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `attemptCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `lastError` varchar(500);--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `nextRetryAt` timestamp;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `sentAt` timestamp;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `deliveredAt` timestamp;--> statement-breakpoint
ALTER TABLE `notifications` ADD `dedupeKey` varchar(191);--> statement-breakpoint
ALTER TABLE `notifications` ADD `readAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_sender_client_unique` UNIQUE(`senderId`,`clientMessageId`);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_dedupe_unique` UNIQUE(`userId`,`dedupeKey`);--> statement-breakpoint
CREATE INDEX `migration_anomalies_version_idx` ON `migration_anomalies` (`migrationVersion`,`code`);--> statement-breakpoint
CREATE INDEX `device_push_tokens_user_idx` ON `device_push_tokens` (`userId`);--> statement-breakpoint
CREATE INDEX `file_access_logs_file_idx` ON `file_access_logs` (`fileId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `messages_conversation_order_idx` ON `messages` (`conversationId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_retry_idx` ON `notification_deliveries` (`status`,`nextRetryAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`userId`,`readAt`);--> statement-breakpoint
CREATE INDEX `orders_related_entity_idx` ON `orders` (`orderType`,`refId`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `stored_files_owner_idx` ON `stored_files` (`ownerId`);
