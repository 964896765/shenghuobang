ALTER TABLE `recycling_requests` ADD `itemId` int;--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `legacyRecyclingRequestId` int NULL;--> statement-breakpoint
INSERT INTO `items` (`ownerId`,`title`,`category`,`cityName`,`status`,`createdAt`,`updatedAt`,`legacyRecyclingRequestId`)
SELECT r.`userId`,r.`title`,r.`category`,r.`cityName`,CASE WHEN r.`status` = 'completed' THEN 'recycled' WHEN r.`status` = 'cancelled' THEN 'idle' ELSE 'recycling' END,r.`createdAt`,r.`createdAt`,r.`id`
FROM `recycling_requests` r INNER JOIN `users` u ON u.`id` = r.`userId` WHERE r.`itemId` IS NULL;--> statement-breakpoint
UPDATE `recycling_requests` r INNER JOIN `items` i ON i.`legacyRecyclingRequestId` = r.`id` SET r.`itemId` = i.`id` WHERE r.`itemId` IS NULL;--> statement-breakpoint
INSERT INTO `item_ownership_history` (`itemId`,`fromUserId`,`toUserId`,`transferType`,`note`,`transferredAt`)
SELECT i.`id`,NULL,i.`ownerId`,'created','V3.2.1 迁移自历史回收询价',i.`createdAt` FROM `items` i WHERE i.`legacyRecyclingRequestId` IS NOT NULL;--> statement-breakpoint
INSERT INTO `item_status_logs` (`itemId`,`fromStatus`,`toStatus`,`reason`,`createdAt`)
SELECT i.`id`,NULL,i.`status`,'V3.2.1 历史回收状态回填',i.`createdAt` FROM `items` i WHERE i.`legacyRecyclingRequestId` IS NOT NULL;--> statement-breakpoint
INSERT INTO `migration_anomalies` (`migrationVersion`,`entityType`,`entityId`,`code`,`detail`)
SELECT 'v3.2.1','recycling_request',r.`id`,'orphan_user',JSON_OBJECT('action','manual_review_required') FROM `recycling_requests` r LEFT JOIN `users` u ON u.`id` = r.`userId` WHERE r.`itemId` IS NULL AND u.`id` IS NULL;--> statement-breakpoint
INSERT INTO `migration_anomalies` (`migrationVersion`,`entityType`,`entityId`,`code`,`detail`)
SELECT 'v3.2.1','recycling_request',r.`id`,'cancelled_default_idle',JSON_OBJECT('action','safe_default') FROM `recycling_requests` r WHERE r.`status` = 'cancelled';--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `legacyRecyclingRequestId`;--> statement-breakpoint
ALTER TABLE `recycling_requests` ADD CONSTRAINT `recycling_requests_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;
