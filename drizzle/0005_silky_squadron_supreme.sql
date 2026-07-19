CREATE TABLE `complaint_active_locks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaintId` int NOT NULL,
	`projectId` int NOT NULL,
	`milestoneId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `complaint_active_locks_id` PRIMARY KEY(`id`),
	CONSTRAINT `complaint_active_locks_complaint_unique` UNIQUE(`complaintId`),
	CONSTRAINT `complaint_active_locks_project_unique` UNIQUE(`projectId`),
	CONSTRAINT `complaint_active_locks_milestone_unique` UNIQUE(`milestoneId`)
);
--> statement-breakpoint
CREATE TABLE `complaint_business_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaintId` int NOT NULL,
	`projectId` int NOT NULL,
	`projectPreviousStatus` varchar(32) NOT NULL,
	`milestoneId` int,
	`milestonePreviousStatus` varchar(32),
	`escrowStates` json NOT NULL,
	`settlementStates` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `complaint_business_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `complaint_business_snapshots_complaint_unique` UNIQUE(`complaintId`)
);
--> statement-breakpoint
ALTER TABLE `complaint_active_locks` ADD CONSTRAINT `complaint_active_locks_complaintId_complaints_id_fk` FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_active_locks` ADD CONSTRAINT `complaint_active_locks_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_active_locks` ADD CONSTRAINT `complaint_active_locks_milestoneId_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_business_snapshots` ADD CONSTRAINT `complaint_business_snapshots_complaintId_complaints_id_fk` FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_business_snapshots` ADD CONSTRAINT `complaint_business_snapshots_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_business_snapshots` ADD CONSTRAINT `complaint_business_snapshots_milestoneId_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `complaint_business_snapshots_project_idx` ON `complaint_business_snapshots` (`projectId`);
--> statement-breakpoint
INSERT INTO `complaint_business_snapshots`
  (`complaintId`,`projectId`,`projectPreviousStatus`,`milestoneId`,`milestonePreviousStatus`,`escrowStates`,`settlementStates`,`createdAt`)
SELECT c.`id`,
  CASE WHEN c.`relatedType` = 'project' THEN c.`relatedId` ELSE m.`projectId` END,
  CASE WHEN p.`status` = 'disputed' THEN 'in_progress' ELSE p.`status` END,
  CASE WHEN c.`relatedType` = 'milestone' THEN c.`relatedId` ELSE NULL END,
  CASE WHEN c.`relatedType` = 'milestone' THEN CASE WHEN m.`status` = 'disputed' THEN 'waiting_acceptance' ELSE m.`status` END ELSE NULL END,
  COALESCE((
    SELECT JSON_ARRAYAGG(JSON_OBJECT('id', e.`id`, 'status', CASE WHEN e.`status` = 'frozen' THEN 'funded' ELSE e.`status` END))
    FROM `escrow_records` e
    WHERE e.`projectId` = p.`id`
  ), JSON_ARRAY()),
  COALESCE((
    SELECT JSON_ARRAYAGG(JSON_OBJECT('id', s.`id`, 'status', CASE WHEN s.`status` = 'frozen' THEN 'pending' ELSE s.`status` END))
    FROM `settlements` s
    WHERE s.`projectId` = p.`id`
  ), JSON_ARRAY()),
  c.`createdAt`
FROM `complaints` c
LEFT JOIN `milestones` m ON c.`relatedType` = 'milestone' AND m.`id` = c.`relatedId`
INNER JOIN `projects` p ON p.`id` = CASE WHEN c.`relatedType` = 'project' THEN c.`relatedId` ELSE m.`projectId` END
WHERE c.`status` IN ('submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending')
  AND NOT EXISTS (SELECT 1 FROM `complaint_business_snapshots` s WHERE s.`complaintId` = c.`id`);
--> statement-breakpoint
INSERT INTO `complaint_active_locks` (`complaintId`,`projectId`,`milestoneId`,`createdAt`)
SELECT candidate.`complaintId`, candidate.`projectId`, candidate.`milestoneId`, candidate.`createdAt`
FROM (
  SELECT c.`id` AS `complaintId`,
    CASE WHEN c.`relatedType` = 'project' THEN c.`relatedId` ELSE m.`projectId` END AS `projectId`,
    CASE WHEN c.`relatedType` = 'milestone' THEN c.`relatedId` ELSE NULL END AS `milestoneId`,
    c.`createdAt`
  FROM `complaints` c
  LEFT JOIN `milestones` m ON c.`relatedType` = 'milestone' AND m.`id` = c.`relatedId`
  WHERE c.`status` IN ('submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending')
) candidate
INNER JOIN (
  SELECT MIN(c2.`id`) AS `complaintId`,
    CASE WHEN c2.`relatedType` = 'project' THEN c2.`relatedId` ELSE m2.`projectId` END AS `projectId`
  FROM `complaints` c2
  LEFT JOIN `milestones` m2 ON c2.`relatedType` = 'milestone' AND m2.`id` = c2.`relatedId`
  WHERE c2.`status` IN ('submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending')
  GROUP BY CASE WHEN c2.`relatedType` = 'project' THEN c2.`relatedId` ELSE m2.`projectId` END
) chosen ON chosen.`complaintId` = candidate.`complaintId` AND chosen.`projectId` = candidate.`projectId`
WHERE candidate.`projectId` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `complaint_active_locks` l WHERE l.`projectId` = candidate.`projectId`);
