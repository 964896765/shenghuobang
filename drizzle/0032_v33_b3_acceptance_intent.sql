-- V3.3-B3.1: prototype acceptance, revision loop and project intentions.
CREATE TABLE `milestone_acceptance_rounds` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `milestoneId` int NOT NULL,
  `submissionId` int NOT NULL,
  `roundNo` int NOT NULL,
  `status` enum('pending_review','accepted','revision_requested','superseded') NOT NULL DEFAULT 'pending_review',
  `reviewerProjectMembershipId` int,
  `decisionNote` text,
  `requestId` varchar(64) NOT NULL,
  `decidedAt` timestamp,
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `milestone_acceptance_rounds_id` PRIMARY KEY (`id`),
  CONSTRAINT `milestone_acceptance_rounds_submission_uq` UNIQUE (`submissionId`),
  CONSTRAINT `milestone_acceptance_rounds_milestone_round_uq` UNIQUE (`milestoneId`,`roundNo`),
  CONSTRAINT `milestone_acceptance_rounds_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `milestone_acceptance_rounds_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_acceptance_rounds_milestone_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_acceptance_rounds_submission_fk` FOREIGN KEY (`submissionId`) REFERENCES `milestone_deliverable_submissions` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_acceptance_rounds_reviewer_project_membership_fk` FOREIGN KEY (`projectId`,`reviewerProjectMembershipId`) REFERENCES `project_memberships` (`projectId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `milestone_acceptance_rounds_milestone_status_idx` ON `milestone_acceptance_rounds` (`milestoneId`,`status`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `milestone_revision_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `milestoneId` int NOT NULL,
  `acceptanceRoundId` int NOT NULL,
  `reason` text NOT NULL,
  `requirementsJson` json,
  `assignedProjectMembershipId` int,
  `dueAt` timestamp,
  `status` enum('open','resubmitted','closed') NOT NULL DEFAULT 'open',
  `createdByProjectMembershipId` int NOT NULL,
  `resolvedBySubmissionId` int,
  `requestId` varchar(64) NOT NULL,
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `milestone_revision_requests_id` PRIMARY KEY (`id`),
  CONSTRAINT `milestone_revision_requests_round_uq` UNIQUE (`acceptanceRoundId`),
  CONSTRAINT `milestone_revision_requests_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `milestone_revision_requests_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_revision_requests_milestone_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_revision_requests_acceptance_round_fk` FOREIGN KEY (`acceptanceRoundId`) REFERENCES `milestone_acceptance_rounds` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_revision_requests_assignee_project_membership_fk` FOREIGN KEY (`projectId`,`assignedProjectMembershipId`) REFERENCES `project_memberships` (`projectId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_revision_requests_creator_project_membership_fk` FOREIGN KEY (`projectId`,`createdByProjectMembershipId`) REFERENCES `project_memberships` (`projectId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_revision_requests_resolved_submission_fk` FOREIGN KEY (`resolvedBySubmissionId`) REFERENCES `milestone_deliverable_submissions` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `milestone_revision_requests_milestone_status_idx` ON `milestone_revision_requests` (`milestoneId`,`status`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `project_intentions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `accountId` int NOT NULL,
  `intentionType` enum('follow','trial','purchase_interest','collaboration_interest') NOT NULL,
  `note` text,
  `status` enum('active','withdrawn') NOT NULL DEFAULT 'active',
  `activeDedupeKey` varchar(191),
  `requestId` varchar(64) NOT NULL,
  `lastRequestId` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `project_intentions_id` PRIMARY KEY (`id`),
  CONSTRAINT `project_intentions_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `project_intentions_active_dedupe_uq` UNIQUE (`activeDedupeKey`),
  CONSTRAINT `project_intentions_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `project_intentions_account_fk` FOREIGN KEY (`accountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `project_intentions_account_project_status_idx` ON `project_intentions` (`accountId`,`projectId`,`status`);
--> statement-breakpoint
CREATE INDEX `project_intentions_project_type_status_idx` ON `project_intentions` (`projectId`,`intentionType`,`status`);
--> statement-breakpoint
INSERT INTO `capabilities` (`code`,`domain`,`name`,`description`,`riskLevel`,`defaultAuditMode`,`status`,`replacementCode`,`deletedAt`) VALUES
  ('project.prototype_acceptance.view','project','查看原型验收状态','查看原型成果验收状态与历史','normal','deny','active',NULL,NULL),
  ('project.prototype_acceptance.review','project','审阅原型成果','进入原型成果验收审阅流程','high','allow_and_deny','active',NULL,NULL),
  ('project.prototype_acceptance.accept','project','通过原型成果验收','将最新原型成果验收为通过','high','allow_and_deny','active',NULL,NULL),
  ('project.prototype_acceptance.request_revision','project','要求原型成果返工','对最新原型成果提出返工要求','high','allow_and_deny','active',NULL,NULL),
  ('project.prototype_revision.submit','project','提交返工成果','针对返工要求重新提交最新原型成果','high','allow_and_deny','active',NULL,NULL),
  ('project.intention.register','project','登记项目意向','登记项目关注、试用、购买或合作意向','sensitive','allow_and_deny','active',NULL,NULL),
  ('project.intention.withdraw','project','撤回项目意向','撤回自己已登记的项目意向','sensitive','allow_and_deny','active',NULL,NULL),
  ('project.intention.view_project','project','查看项目意向名单','查看项目下必要公开资料的意向登记名单','high','allow_and_deny','active',NULL,NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
  BINARY `capabilities`.`domain` <=> BINARY new.`domain`
  AND BINARY `capabilities`.`name` <=> BINARY new.`name`
  AND BINARY `capabilities`.`description` <=> BINARY new.`description`
  AND BINARY `capabilities`.`riskLevel` <=> BINARY new.`riskLevel`
  AND BINARY `capabilities`.`defaultAuditMode` <=> BINARY new.`defaultAuditMode`
  AND BINARY `capabilities`.`status` <=> BINARY new.`status`,
  `capabilities`.`code`, NULL
);
