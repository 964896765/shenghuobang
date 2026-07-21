CREATE TABLE `commerce_checkout_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buyerAccountId` int NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`orderId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commerce_checkout_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `commerce_checkout_requests_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `listing_product_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`productModelId` int NOT NULL,
	`productUnitId` int,
	`linkedByAccountId` int NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listing_product_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `listing_product_links_listing_uq` UNIQUE(`listingId`),
	CONSTRAINT `listing_product_links_request_uq` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `listing_skus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`skuCode` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`attributes` json NOT NULL,
	`price` int NOT NULL,
	`stock` int NOT NULL,
	`status` enum('active','inactive','sold_out') NOT NULL DEFAULT 'active',
	`createdRequestId` varchar(64) NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `listing_skus_id` PRIMARY KEY(`id`),
	CONSTRAINT `listing_skus_listing_code_uq` UNIQUE(`listingId`,`skuCode`),
	CONSTRAINT `listing_skus_created_request_uq` UNIQUE(`createdRequestId`),
	CONSTRAINT `listing_skus_last_request_uq` UNIQUE(`lastRequestId`)
);
--> statement-breakpoint
CREATE TABLE `order_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`listingId` int NOT NULL,
	`skuId` int NOT NULL,
	`skuCode` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`attributes` json NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` int NOT NULL,
	`lineAmount` int NOT NULL,
	`productModelId` int,
	`productUnitId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_line_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_line_items_order_sku_uq` UNIQUE(`orderId`,`skuId`)
);
--> statement-breakpoint
CREATE TABLE `order_shipping_snapshots` (
	`orderId` int NOT NULL,
	`sourceAddressId` int,
	`recipientName` varchar(100) NOT NULL,
	`phoneMasked` varchar(32) NOT NULL,
	`phoneEncrypted` varbinary(512) NOT NULL,
	`province` varchar(64) NOT NULL,
	`city` varchar(64) NOT NULL,
	`district` varchar(64) NOT NULL,
	`addressLine` varchar(255) NOT NULL,
	`postalCode` varchar(16),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_shipping_snapshots_orderId` PRIMARY KEY(`orderId`)
);
--> statement-breakpoint
CREATE TABLE `shopping_cart_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cartId` int NOT NULL,
	`skuId` int NOT NULL,
	`quantity` int NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopping_cart_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `shopping_cart_items_cart_sku_uq` UNIQUE(`cartId`,`skuId`),
	CONSTRAINT `shopping_cart_items_request_uq` UNIQUE(`lastRequestId`)
);
--> statement-breakpoint
CREATE TABLE `shopping_carts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buyerAccountId` int NOT NULL,
	`status` enum('active','checked_out','abandoned') NOT NULL DEFAULT 'active',
	`activeDedupeKey` varchar(64),
	`checkedOutAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopping_carts_id` PRIMARY KEY(`id`),
	CONSTRAINT `shopping_carts_active_dedupe_uq` UNIQUE(`activeDedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `user_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`recipientName` varchar(100) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`province` varchar(64) NOT NULL,
	`city` varchar(64) NOT NULL,
	`district` varchar(64) NOT NULL,
	`addressLine` varchar(255) NOT NULL,
	`postalCode` varchar(16),
	`isDefault` boolean NOT NULL DEFAULT false,
	`status` enum('active','deleted') NOT NULL DEFAULT 'active',
	`createdRequestId` varchar(64) NOT NULL,
	`lastRequestId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_addresses_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_addresses_created_request_uq` UNIQUE(`createdRequestId`),
	CONSTRAINT `user_addresses_last_request_uq` UNIQUE(`lastRequestId`)
);
--> statement-breakpoint
ALTER TABLE `commerce_checkout_requests` ADD CONSTRAINT `commerce_checkout_requests_buyerAccountId_users_id_fk` FOREIGN KEY (`buyerAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commerce_checkout_requests` ADD CONSTRAINT `commerce_checkout_requests_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listing_product_links` ADD CONSTRAINT `listing_product_links_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listing_product_links` ADD CONSTRAINT `listing_product_links_productModelId_product_models_id_fk` FOREIGN KEY (`productModelId`) REFERENCES `product_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listing_product_links` ADD CONSTRAINT `listing_product_links_productUnitId_product_units_id_fk` FOREIGN KEY (`productUnitId`) REFERENCES `product_units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listing_product_links` ADD CONSTRAINT `listing_product_links_linkedByAccountId_users_id_fk` FOREIGN KEY (`linkedByAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listing_skus` ADD CONSTRAINT `listing_skus_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_items` ADD CONSTRAINT `order_line_items_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_items` ADD CONSTRAINT `order_line_items_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_items` ADD CONSTRAINT `order_line_items_skuId_listing_skus_id_fk` FOREIGN KEY (`skuId`) REFERENCES `listing_skus`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_items` ADD CONSTRAINT `order_line_items_productModelId_product_models_id_fk` FOREIGN KEY (`productModelId`) REFERENCES `product_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_items` ADD CONSTRAINT `order_line_items_productUnitId_product_units_id_fk` FOREIGN KEY (`productUnitId`) REFERENCES `product_units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_shipping_snapshots` ADD CONSTRAINT `order_shipping_snapshots_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_shipping_snapshots` ADD CONSTRAINT `order_shipping_snapshots_sourceAddressId_user_addresses_id_fk` FOREIGN KEY (`sourceAddressId`) REFERENCES `user_addresses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopping_cart_items` ADD CONSTRAINT `shopping_cart_items_cartId_shopping_carts_id_fk` FOREIGN KEY (`cartId`) REFERENCES `shopping_carts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopping_cart_items` ADD CONSTRAINT `shopping_cart_items_skuId_listing_skus_id_fk` FOREIGN KEY (`skuId`) REFERENCES `listing_skus`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopping_carts` ADD CONSTRAINT `shopping_carts_buyerAccountId_users_id_fk` FOREIGN KEY (`buyerAccountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_addresses` ADD CONSTRAINT `user_addresses_accountId_users_id_fk` FOREIGN KEY (`accountId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `commerce_checkout_requests_buyer_order_idx` ON `commerce_checkout_requests` (`buyerAccountId`,`orderId`);--> statement-breakpoint
CREATE INDEX `listing_product_links_product_idx` ON `listing_product_links` (`productModelId`,`listingId`);--> statement-breakpoint
CREATE INDEX `listing_product_links_unit_idx` ON `listing_product_links` (`productUnitId`,`listingId`);--> statement-breakpoint
CREATE INDEX `listing_skus_listing_status_idx` ON `listing_skus` (`listingId`,`status`);--> statement-breakpoint
CREATE INDEX `order_line_items_order_idx` ON `order_line_items` (`orderId`,`id`);--> statement-breakpoint
CREATE INDEX `shopping_cart_items_cart_idx` ON `shopping_cart_items` (`cartId`,`id`);--> statement-breakpoint
CREATE INDEX `shopping_carts_buyer_status_idx` ON `shopping_carts` (`buyerAccountId`,`status`);--> statement-breakpoint
CREATE INDEX `user_addresses_account_status_idx` ON `user_addresses` (`accountId`,`status`,`isDefault`);