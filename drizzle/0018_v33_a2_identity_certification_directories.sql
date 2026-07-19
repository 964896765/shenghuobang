CREATE TABLE `certification_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`subjectType` enum('identity','organization','either') NOT NULL,
	`reviewMode` enum('single','two_stage') NOT NULL DEFAULT 'single',
	`validityDays` int,
	`sensitiveLevel` enum('sensitive','high_sensitive') NOT NULL DEFAULT 'sensitive',
	`requirements` json,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `certification_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `certification_types_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `identity_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` varchar(500),
	`requiresCertification` boolean NOT NULL DEFAULT false,
	`isSystem` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `identity_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `identity_types_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `certification_types_subject_status_idx` ON `certification_types` (`subjectType`,`status`);--> statement-breakpoint
CREATE INDEX `identity_types_status_deleted_idx` ON `identity_types` (`status`,`deletedAt`);