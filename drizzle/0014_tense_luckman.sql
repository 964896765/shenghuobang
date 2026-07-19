CREATE TABLE `user_location_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cityName` varchar(64),
	`regionName` varchar(64),
	`approximateLatitude` decimal(4,2),
	`approximateLongitude` decimal(5,2),
	`source` enum('device','manual') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_location_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_location_preferences_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `user_location_preferences` ADD CONSTRAINT `user_location_preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_location_preferences_region_idx` ON `user_location_preferences` (`cityName`,`regionName`);