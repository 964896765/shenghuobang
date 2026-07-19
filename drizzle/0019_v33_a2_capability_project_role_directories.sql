CREATE TABLE `capabilities` (
	`code` varchar(128) NOT NULL,
	`domain` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` varchar(500) NOT NULL,
	`riskLevel` enum('normal','sensitive','high') NOT NULL DEFAULT 'normal',
	`defaultAuditMode` enum('none','deny','allow_and_deny') NOT NULL DEFAULT 'deny',
	`status` enum('active','deprecated') NOT NULL DEFAULT 'active',
	`replacementCode` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `capabilities_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `project_roles` (
	`code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` varchar(500) NOT NULL,
	`isSystem` boolean NOT NULL DEFAULT true,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `project_roles_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
ALTER TABLE `capabilities` ADD CONSTRAINT `capabilities_replacement_fk` FOREIGN KEY (`replacementCode`) REFERENCES `capabilities`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `capabilities_domain_status_idx` ON `capabilities` (`domain`,`status`);