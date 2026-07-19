ALTER TABLE `conversations` ADD `status` enum('active','closed') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `authorizationVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `milestones` ADD `assigneeProjectMembershipId` int;--> statement-breakpoint
ALTER TABLE `milestones` ADD `lastSubmittedByProjectMembershipId` int;--> statement-breakpoint
ALTER TABLE `milestones` ADD `authorizationVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_acceptances` ADD `reviewerProjectMembershipId` int;--> statement-breakpoint
ALTER TABLE `project_acceptances` ADD `deliverySubmissionVersion` int;--> statement-breakpoint
ALTER TABLE `project_files` ADD `confidentialityLevel` enum('PUBLIC','INTERNAL','CONFIDENTIAL','NDA','RESTRICTED') DEFAULT 'INTERNAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_files` ADD `ndaRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project_files` ADD `accessPolicyVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_files` ADD `disabledAt` timestamp;--> statement-breakpoint
ALTER TABLE `project_files` ADD `disabledBy` int;--> statement-breakpoint
ALTER TABLE `projects` ADD `authorizationVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `stored_files` ADD `accessPolicyVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_files` ADD CONSTRAINT `project_files_disabledBy_users_id_fk` FOREIGN KEY (`disabledBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `conversations_reference_status_idx` ON `conversations` (`refType`,`refId`,`status`);--> statement-breakpoint
CREATE INDEX `milestones_project_assignee_status_idx` ON `milestones` (`projectId`,`assigneeProjectMembershipId`,`status`);--> statement-breakpoint
CREATE INDEX `project_acceptances_project_milestone_created_idx` ON `project_acceptances` (`projectId`,`milestoneId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `project_files_project_status_conf_idx` ON `project_files` (`projectId`,`status`,`confidentialityLevel`);--> statement-breakpoint
CREATE INDEX `projects_status_authorization_idx` ON `projects` (`status`,`authorizationVersion`);--> statement-breakpoint
CREATE INDEX `stored_files_related_status_idx` ON `stored_files` (`relatedEntityType`,`relatedEntityId`,`status`);