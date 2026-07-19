ALTER TABLE `migration_anomalies` ADD `migrationRunId` varchar(64);--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD `checkpointKey` varchar(191);--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD `severity` enum('INFO','WARNING','BLOCKING');--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD `fingerprint` char(64);--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD `handling` enum('CONTINUE','MIN_PRIVILEGE','SKIP_ENTITY','MANUAL_REVIEW','ABORT_RUN');--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD `status` enum('open','resolved','waived');--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD `detailChecksum` char(64);--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD `resolvedByAccountId` int;--> statement-breakpoint
ALTER TABLE `migration_anomalies` ADD `resolutionNote` varchar(500);