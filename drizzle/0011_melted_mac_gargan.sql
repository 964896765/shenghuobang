ALTER TABLE `notification_deliveries` ADD `devicePushTokenId` int;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notif_delivery_token_fk` FOREIGN KEY (`devicePushTokenId`) REFERENCES `device_push_tokens`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO `app_schema_versions` (`version`) VALUES ('v3.2.1') ON DUPLICATE KEY UPDATE `version` = VALUES(`version`);
