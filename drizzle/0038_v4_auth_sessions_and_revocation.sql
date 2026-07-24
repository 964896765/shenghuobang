CREATE TABLE `auth_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` char(64) NOT NULL,
	`deviceId` varchar(128),
	`userAgent` varchar(255),
	`ipDigest` char(64),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`revokeReason` varchar(255),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_sessionId_unique` UNIQUE(`sessionId`),
	CONSTRAINT `auth_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_sessions_user_expiry_idx` ON `auth_sessions` (`userId`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_revoked_idx` ON `auth_sessions` (`userId`,`revokedAt`);