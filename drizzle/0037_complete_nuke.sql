ALTER TABLE `credit_events` ADD `actorAccountId` int;--> statement-breakpoint
ALTER TABLE `credit_events` ADD `businessSource` varchar(64) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_events` ADD `impactDimension` varchar(64) DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_events` ADD `requestId` varchar(64);--> statement-breakpoint
ALTER TABLE `reviews` ADD `tags` json;--> statement-breakpoint
ALTER TABLE `reviews` ADD `imageFileIds` json;--> statement-breakpoint
ALTER TABLE `reviews` ADD `businessSource` varchar(64) DEFAULT 'order' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `impactDimension` varchar(64) DEFAULT 'trade_reliability' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `requestId` varchar(64);--> statement-breakpoint
ALTER TABLE `reviews` ADD `reply` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `repliedBy` int;--> statement-breakpoint
ALTER TABLE `reviews` ADD `repliedAt` timestamp;--> statement-breakpoint
ALTER TABLE `credit_events` ADD CONSTRAINT `credit_events_user_request_uq` UNIQUE(`userId`,`requestId`);--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_order_reviewer_uq` UNIQUE(`orderId`,`reviewerId`);--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_reviewer_request_uq` UNIQUE(`reviewerId`,`requestId`);--> statement-breakpoint
CREATE INDEX `credit_events_user_created_idx` ON `credit_events` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reviews_reviewee_created_idx` ON `reviews` (`revieweeId`,`createdAt`);