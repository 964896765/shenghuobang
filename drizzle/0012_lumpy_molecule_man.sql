CREATE TABLE `swap_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetListingId` int NOT NULL,
	`offeredListingId` int NOT NULL,
	`requesterId` int NOT NULL,
	`ownerId` int NOT NULL,
	`orderId` int,
	`status` enum('submitted','awaiting_confirmations','rejected','cancelled','completed') NOT NULL DEFAULT 'submitted',
	`requesterConfirmed` boolean NOT NULL DEFAULT false,
	`ownerConfirmed` boolean NOT NULL DEFAULT false,
	`activeKey` varchar(191),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `swap_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `swap_requests_active_unique` UNIQUE(`activeKey`)
);
--> statement-breakpoint
ALTER TABLE `listings` MODIFY COLUMN `status` enum('draft','published','reserved','completed','closed','deleted') NOT NULL DEFAULT 'published';--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `orderType` enum('listing','project','recycling','swap') NOT NULL DEFAULT 'listing';--> statement-breakpoint
ALTER TABLE `listings` ADD `swapIntent` varchar(255);--> statement-breakpoint
ALTER TABLE `swap_requests` ADD CONSTRAINT `swap_requests_targetListingId_listings_id_fk` FOREIGN KEY (`targetListingId`) REFERENCES `listings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `swap_requests` ADD CONSTRAINT `swap_requests_offeredListingId_listings_id_fk` FOREIGN KEY (`offeredListingId`) REFERENCES `listings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `swap_requests` ADD CONSTRAINT `swap_requests_requesterId_users_id_fk` FOREIGN KEY (`requesterId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `swap_requests` ADD CONSTRAINT `swap_requests_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `swap_requests` ADD CONSTRAINT `swap_requests_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `swap_requests_requester_status_idx` ON `swap_requests` (`requesterId`,`status`);--> statement-breakpoint
CREATE INDEX `swap_requests_owner_status_idx` ON `swap_requests` (`ownerId`,`status`);