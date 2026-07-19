ALTER TABLE `users` MODIFY COLUMN `openId` varchar(96) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(64) DEFAULT 'phone_password';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `accountStatus` enum('active','restricted','suspended','closed') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `need_supports` ADD CONSTRAINT `need_supports_need_user_unique` UNIQUE(`needId`,`userId`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_phone_unique` UNIQUE(`phone`);