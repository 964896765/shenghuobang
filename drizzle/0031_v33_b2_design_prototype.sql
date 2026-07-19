-- V3.3-B2.1: design versions, prototype milestones and deliverable submissions.
ALTER TABLE `milestones`
  ADD COLUMN `milestoneType` enum('general','prototype') NOT NULL DEFAULT 'general',
  ADD COLUMN `prototypeTaskType` enum('designer','engineer'),
  ADD COLUMN `startedAt` timestamp NULL,
  ADD COLUMN `startedByProjectMembershipId` int NULL;
--> statement-breakpoint
CREATE TABLE `design_versions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `versionNo` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `summary` varchar(500) NOT NULL,
  `changeNotes` text,
  `status` enum('draft','submitted','superseded','withdrawn') NOT NULL DEFAULT 'draft',
  `createdByProjectMembershipId` int NOT NULL,
  `submittedByProjectMembershipId` int,
  `submittedAt` timestamp,
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `requestId` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `design_versions_id` PRIMARY KEY (`id`),
  CONSTRAINT `design_versions_project_version_uq` UNIQUE (`projectId`,`versionNo`),
  CONSTRAINT `design_versions_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `design_versions_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `design_versions_creator_project_membership_fk` FOREIGN KEY (`projectId`,`createdByProjectMembershipId`) REFERENCES `project_memberships` (`projectId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `design_versions_submitter_project_membership_fk` FOREIGN KEY (`projectId`,`submittedByProjectMembershipId`) REFERENCES `project_memberships` (`projectId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `design_versions_project_status_idx` ON `design_versions` (`projectId`,`status`,`submittedAt`);
--> statement-breakpoint
CREATE TABLE `design_version_files` (
  `id` int AUTO_INCREMENT NOT NULL,
  `designVersionId` int NOT NULL,
  `projectFileId` int NOT NULL,
  `fileRole` enum('source','preview','reference','specification','other') NOT NULL DEFAULT 'other',
  `sortOrder` int NOT NULL DEFAULT 0,
  `uploadedByProjectMembershipId` int NOT NULL,
  `disabledAt` timestamp,
  `accessPolicyVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `design_version_files_id` PRIMARY KEY (`id`),
  CONSTRAINT `design_version_files_version_file_uq` UNIQUE (`designVersionId`,`projectFileId`),
  CONSTRAINT `design_version_files_version_fk` FOREIGN KEY (`designVersionId`) REFERENCES `design_versions` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `design_version_files_project_file_fk` FOREIGN KEY (`projectFileId`) REFERENCES `project_files` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `design_version_files_uploader_fk` FOREIGN KEY (`uploadedByProjectMembershipId`) REFERENCES `project_memberships` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `design_version_files_version_state_idx` ON `design_version_files` (`designVersionId`,`disabledAt`,`sortOrder`);
--> statement-breakpoint
CREATE TABLE `milestone_deliverable_submissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `milestoneId` int NOT NULL,
  `submissionVersion` int NOT NULL,
  `note` text NOT NULL,
  `submittedByProjectMembershipId` int NOT NULL,
  `submittedAt` timestamp NOT NULL DEFAULT (now()),
  `requestId` varchar(64) NOT NULL,
  `status` enum('submitted','superseded') NOT NULL DEFAULT 'submitted',
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `milestone_deliverable_submissions_id` PRIMARY KEY (`id`),
  CONSTRAINT `milestone_deliverable_submissions_milestone_version_uq` UNIQUE (`milestoneId`,`submissionVersion`),
  CONSTRAINT `milestone_deliverable_submissions_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `milestone_deliverable_submissions_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_deliverable_submissions_milestone_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_deliverable_submissions_submitter_project_membership_fk` FOREIGN KEY (`projectId`,`submittedByProjectMembershipId`) REFERENCES `project_memberships` (`projectId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `milestone_deliverable_submissions_project_milestone_status_idx` ON `milestone_deliverable_submissions` (`projectId`,`milestoneId`,`status`,`submittedAt`);
--> statement-breakpoint
CREATE TABLE `milestone_deliverable_submission_files` (
  `id` int AUTO_INCREMENT NOT NULL,
  `submissionId` int NOT NULL,
  `projectFileId` int NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `disabledAt` timestamp,
  `accessPolicyVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `milestone_deliverable_submission_files_id` PRIMARY KEY (`id`),
  CONSTRAINT `milestone_deliverable_submission_files_submission_file_uq` UNIQUE (`submissionId`,`projectFileId`),
  CONSTRAINT `milestone_deliverable_submission_files_submission_fk` FOREIGN KEY (`submissionId`) REFERENCES `milestone_deliverable_submissions` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `milestone_deliverable_submission_files_project_file_fk` FOREIGN KEY (`projectFileId`) REFERENCES `project_files` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `milestone_deliverable_submission_files_submission_state_idx` ON `milestone_deliverable_submission_files` (`submissionId`,`disabledAt`,`sortOrder`);
--> statement-breakpoint
ALTER TABLE `milestones`
  ADD CONSTRAINT `milestones_starter_project_membership_fk`
  FOREIGN KEY (`projectId`,`startedByProjectMembershipId`) REFERENCES `project_memberships` (`projectId`,`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
INSERT INTO `capabilities` (`code`,`domain`,`name`,`description`,`riskLevel`,`defaultAuditMode`,`status`,`replacementCode`,`deletedAt`) VALUES
  ('project.design_version.create','project','创建设计版本','在项目下创建设计版本草稿','sensitive','allow_and_deny','active',NULL,NULL),
  ('project.design_version.edit','project','编辑设计版本','编辑尚未提交的设计版本草稿','sensitive','allow_and_deny','active',NULL,NULL),
  ('project.design_version.submit','project','提交设计版本','提交设计版本并替代上一当前版本','high','allow_and_deny','active',NULL,NULL),
  ('project.design_version.view','project','查看设计版本','查看项目设计版本与元数据','normal','deny','active',NULL,NULL),
  ('project.design_file.upload','project','上传设计文件','向设计版本添加受控项目文件','high','allow_and_deny','active',NULL,NULL),
  ('project.design_file.download','project','下载设计文件','按项目成员权限与保密级别读取设计文件','high','allow_and_deny','active',NULL,NULL),
  ('project.milestone.create','project','创建原型里程碑','创建原型阶段里程碑','sensitive','allow_and_deny','active',NULL,NULL),
  ('project.milestone.edit','project','编辑原型里程碑','编辑 planned 原型里程碑','sensitive','allow_and_deny','active',NULL,NULL),
  ('project.milestone.assign','project','指派原型里程碑','为原型里程碑指派执行成员','high','allow_and_deny','active',NULL,NULL),
  ('project.milestone.start','project','启动原型里程碑','启动 planned 原型里程碑','sensitive','allow_and_deny','active',NULL,NULL),
  ('project.milestone.submit_deliverable','project','提交原型成果','提交原型里程碑成果文件与说明','high','allow_and_deny','active',NULL,NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
  BINARY `capabilities`.`domain` <=> BINARY new.`domain`
  AND BINARY `capabilities`.`name` <=> BINARY new.`name`
  AND BINARY `capabilities`.`description` <=> BINARY new.`description`
  AND BINARY `capabilities`.`riskLevel` <=> BINARY new.`riskLevel`
  AND BINARY `capabilities`.`defaultAuditMode` <=> BINARY new.`defaultAuditMode`
  AND BINARY `capabilities`.`status` <=> BINARY new.`status`,
  `capabilities`.`code`, NULL
);
