CREATE TABLE `complaint_evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaintId` int NOT NULL,
	`submitterId` int NOT NULL,
	`fileName` varchar(255),
	`storageKey` varchar(500),
	`publicUrl` text,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `complaint_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `complaints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complainantId` int NOT NULL,
	`respondentId` int NOT NULL,
	`relatedType` enum('project','milestone','order','listing','recycling','message') NOT NULL,
	`relatedId` int NOT NULL,
	`complaintType` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`expectedResolution` text,
	`status` enum('submitted','waiting_response','under_review','negotiating','resolved','rejected','withdrawn','closed') NOT NULL DEFAULT 'submitted',
	`respondentStatement` text,
	`resolution` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `complaints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_acceptances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`milestoneId` int NOT NULL,
	`result` enum('accepted','revision_required','disputed') NOT NULL,
	`comment` text,
	`submittedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_acceptances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`requesterId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`changeContent` text NOT NULL,
	`reason` text,
	`amountDelta` int NOT NULL DEFAULT 0,
	`scheduleDeltaDays` int NOT NULL DEFAULT 0,
	`deliverableImpact` text,
	`status` enum('pending_confirmation','approved','rejected','withdrawn','disputed') NOT NULL DEFAULT 'pending_confirmation',
	`respondedBy` int,
	`responseNote` text,
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`milestoneId` int,
	`fileGroupId` varchar(64) NOT NULL,
	`versionNo` int NOT NULL DEFAULT 1,
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`publicUrl` text,
	`mimeType` varchar(128),
	`sizeBytes` int NOT NULL DEFAULT 0,
	`category` enum('requirement','design','delivery','test','agreement','other') NOT NULL DEFAULT 'other',
	`description` text,
	`formalSubmission` boolean NOT NULL DEFAULT false,
	`status` enum('available','superseded','disabled') NOT NULL DEFAULT 'available',
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_files_group_version_unique` UNIQUE(`fileGroupId`,`versionNo`)
);
--> statement-breakpoint
CREATE TABLE `project_requirements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`versionNo` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`acceptanceCriteria` text,
	`exclusions` text,
	`status` enum('pending_confirmation','effective','superseded','rejected') NOT NULL DEFAULT 'pending_confirmation',
	`ownerConfirmedAt` timestamp,
	`engineerConfirmedAt` timestamp,
	`sourceChangeId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_requirements_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_requirements_project_version_unique` UNIQUE(`projectId`,`versionNo`)
);
--> statement-breakpoint
CREATE TABLE `quote_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`versionNo` int NOT NULL,
	`totalPrice` int NOT NULL,
	`durationDays` int NOT NULL,
	`understanding` text,
	`deliverables` text NOT NULL,
	`exclusions` text,
	`paymentTerms` varchar(255),
	`revisionCount` int NOT NULL DEFAULT 2,
	`supportDays` int NOT NULL DEFAULT 30,
	`validDays` int NOT NULL DEFAULT 7,
	`changeNote` varchar(500),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `quote_versions_quote_version_unique` UNIQUE(`quoteId`,`versionNo`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `ownerConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `projects` ADD `engineerConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `projects` ADD `expectedEndAt` timestamp;--> statement-breakpoint
ALTER TABLE `quotes` ADD `currentVersionId` int;--> statement-breakpoint
ALTER TABLE `quotes` ADD `expiresAt` timestamp;--> statement-breakpoint
INSERT INTO `quote_versions` (
  `quoteId`, `versionNo`, `totalPrice`, `durationDays`, `deliverables`, `exclusions`, `paymentTerms`,
  `revisionCount`, `supportDays`, `validDays`, `changeNote`, `createdBy`, `createdAt`
)
SELECT
  q.`id`, 1, q.`totalPrice`, q.`durationDays`, q.`deliverables`, q.`exclusions`, q.`paymentTerms`,
  COALESCE(q.`revisionCount`, 2), COALESCE(q.`supportDays`, 30), COALESCE(q.`validDays`, 7),
  '历史报价迁移', q.`engineerId`, q.`createdAt`
FROM `quotes` q
WHERE NOT EXISTS (
  SELECT 1 FROM `quote_versions` v WHERE v.`quoteId` = q.`id`
);
--> statement-breakpoint
UPDATE `quotes` q
JOIN `quote_versions` v ON v.`quoteId` = q.`id` AND v.`versionNo` = 1
SET q.`currentVersionId` = COALESCE(q.`currentVersionId`, v.`id`),
    q.`expiresAt` = COALESCE(q.`expiresAt`, DATE_ADD(q.`createdAt`, INTERVAL COALESCE(q.`validDays`, 7) DAY));
--> statement-breakpoint
UPDATE `projects`
SET `ownerConfirmedAt` = COALESCE(`ownerConfirmedAt`, `createdAt`),
    `engineerConfirmedAt` = CASE
      WHEN `status` IN ('pending_confirmation', 'pending_agreement') THEN `engineerConfirmedAt`
      ELSE COALESCE(`engineerConfirmedAt`, `createdAt`)
    END;
--> statement-breakpoint
INSERT INTO `project_requirements` (
  `projectId`, `versionNo`, `title`, `content`, `acceptanceCriteria`, `exclusions`, `status`,
  `ownerConfirmedAt`, `engineerConfirmedAt`, `createdBy`, `createdAt`
)
SELECT
  p.`id`, 1, CONCAT(p.`title`, ' - 正式需求 V1'),
  CONCAT(COALESCE(n.`originalDescription`, n.`title`, p.`title`), '\n\n报价交付内容：', q.`deliverables`),
  q.`deliverables`, q.`exclusions`,
  CASE WHEN p.`status` IN ('pending_confirmation', 'pending_agreement') THEN 'pending_confirmation' ELSE 'effective' END,
  p.`ownerConfirmedAt`, p.`engineerConfirmedAt`, p.`ownerId`, p.`createdAt`
FROM `projects` p
JOIN `needs` n ON n.`id` = p.`needId`
JOIN `quotes` q ON q.`id` = p.`quoteId`
WHERE NOT EXISTS (
  SELECT 1 FROM `project_requirements` r WHERE r.`projectId` = p.`id`
);
