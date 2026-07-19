ALTER TABLE `device_push_tokens` ADD `disabledAt` timestamp;--> statement-breakpoint
ALTER TABLE `device_push_tokens` ADD `disabledReason` varchar(255);--> statement-breakpoint
ALTER TABLE `device_push_tokens` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;