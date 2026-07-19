CREATE TABLE `refund_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`refundId` int NOT NULL,
	`attemptNo` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`providerRequestId` varchar(128) NOT NULL,
	`providerIdempotencyKey` varchar(180) NOT NULL,
	`operatorId` int NOT NULL,
	`orderPreviousStatus` varchar(32) NOT NULL,
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
	`requestData` json,
	`responseData` json,
	`failedReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `refund_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `refund_attempts_refund_no_unique` UNIQUE(`refundId`,`attemptNo`),
	CONSTRAINT `refund_attempts_provider_req_unique` UNIQUE(`provider`,`providerRequestId`)
);
--> statement-breakpoint
ALTER TABLE `complaint_actions` MODIFY COLUMN `actorId` int;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `status` enum('pending_confirmation','pending_payment','paid','pending_delivery','pending_acceptance','completed','cancelled','refunding','partially_refunded','refunded','disputed','closed') NOT NULL DEFAULT 'pending_payment';--> statement-breakpoint
DROP TEMPORARY TABLE IF EXISTS `_v312_completed_partial_refund_orders`;
--> statement-breakpoint
CREATE TEMPORARY TABLE `_v312_completed_partial_refund_orders` AS
SELECT DISTINCT o.`id` AS `orderId`
FROM `orders` o
INNER JOIN `payments` p ON p.`orderId` = o.`id` AND p.`status` = 'partially_refunded'
WHERE o.`status` = 'refunding'
  AND EXISTS (SELECT 1 FROM `refunds` r WHERE r.`orderId` = o.`id` AND r.`status` = 'success');
--> statement-breakpoint
INSERT INTO `order_status_logs` (`orderId`,`fromStatus`,`toStatus`,`note`,`createdAt`)
SELECT `orderId`,'refunding','partially_refunded','V3.1.2 升级：部分退款已成功，修复历史退款处理中状态',NOW()
FROM `_v312_completed_partial_refund_orders`;
--> statement-breakpoint
UPDATE `orders` o
INNER JOIN `_v312_completed_partial_refund_orders` p ON p.`orderId` = o.`id`
SET o.`status` = 'partially_refunded';
--> statement-breakpoint
DROP TEMPORARY TABLE `_v312_completed_partial_refund_orders`;
--> statement-breakpoint
ALTER TABLE `refund_attempts` ADD CONSTRAINT `refund_attempts_refundId_refunds_id_fk` FOREIGN KEY (`refundId`) REFERENCES `refunds`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_attempts` ADD CONSTRAINT `refund_attempts_operatorId_users_id_fk` FOREIGN KEY (`operatorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `refund_attempts_refund_status_idx` ON `refund_attempts` (`refundId`,`status`);
--> statement-breakpoint
DROP TEMPORARY TABLE IF EXISTS `_v312_active_complaints`;
--> statement-breakpoint
CREATE TEMPORARY TABLE `_v312_active_complaints` AS
SELECT base.*,
  ROW_NUMBER() OVER (
    PARTITION BY base.`projectId`
    ORDER BY base.`hasExistingLock` DESC, base.`createdAt` ASC, base.`complaintId` ASC
  ) AS `projectRank`
FROM (
  SELECT c.`id` AS `complaintId`, c.`status` AS `previousStatus`, c.`createdAt`,
    p.`id` AS `projectId`,
    CASE WHEN c.`relatedType` = 'milestone' THEN c.`relatedId` ELSE NULL END AS `milestoneId`,
    CASE WHEN l.`complaintId` IS NULL THEN 0 ELSE 1 END AS `hasExistingLock`
  FROM `complaints` c
  LEFT JOIN `milestones` m ON c.`relatedType` = 'milestone' AND m.`id` = c.`relatedId`
  LEFT JOIN `projects` p ON p.`id` = CASE WHEN c.`relatedType` = 'project' THEN c.`relatedId` WHEN c.`relatedType` = 'milestone' THEN m.`projectId` ELSE NULL END
  LEFT JOIN `complaint_active_locks` l ON l.`complaintId` = c.`id`
  WHERE c.`status` IN ('submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending')
) base
WHERE base.`projectId` IS NOT NULL;
--> statement-breakpoint
DROP TEMPORARY TABLE IF EXISTS `_v312_complaints_to_close`;
--> statement-breakpoint
CREATE TEMPORARY TABLE `_v312_complaints_to_close` AS
SELECT `complaintId`, `previousStatus`, '同项目历史重复活动投诉，V3.1.2 升级时由系统关闭并等待人工合并' AS `reason`
FROM `_v312_active_complaints`
WHERE `projectRank` > 1
UNION ALL
SELECT c.`id`, c.`status`, '活动投诉无法映射到有效项目，V3.1.2 升级时由系统关闭并等待人工复核'
FROM `complaints` c
LEFT JOIN `milestones` m ON c.`relatedType` = 'milestone' AND m.`id` = c.`relatedId`
LEFT JOIN `projects` p ON p.`id` = CASE WHEN c.`relatedType` = 'project' THEN c.`relatedId` WHEN c.`relatedType` = 'milestone' THEN m.`projectId` ELSE NULL END
WHERE c.`status` IN ('submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending')
  AND (c.`relatedType` NOT IN ('project','milestone') OR p.`id` IS NULL);
--> statement-breakpoint
INSERT INTO `complaint_status_logs` (`complaintId`,`fromStatus`,`toStatus`,`actorId`,`note`,`createdAt`)
SELECT `complaintId`,`previousStatus`,'closed',NULL,`reason`,NOW()
FROM `_v312_complaints_to_close`;
--> statement-breakpoint
INSERT INTO `complaint_actions` (`complaintId`,`actorId`,`actorType`,`action`,`detail`,`createdAt`)
SELECT `complaintId`,NULL,'system','migration_close_duplicate',`reason`,NOW()
FROM `_v312_complaints_to_close`;
--> statement-breakpoint
UPDATE `complaints` c
INNER JOIN `_v312_complaints_to_close` d ON d.`complaintId` = c.`id`
SET c.`status` = 'closed', c.`resolution` = d.`reason`;
--> statement-breakpoint
DELETE l FROM `complaint_active_locks` l
INNER JOIN `complaints` c ON c.`id` = l.`complaintId`
WHERE c.`status` NOT IN ('submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending');
--> statement-breakpoint
DELETE l FROM `complaint_active_locks` l
INNER JOIN `_v312_active_complaints` a ON a.`complaintId` = l.`complaintId`
WHERE a.`projectRank` = 1 AND l.`projectId` <> a.`projectId`;
--> statement-breakpoint
INSERT INTO `complaint_active_locks` (`complaintId`,`projectId`,`milestoneId`,`createdAt`)
SELECT a.`complaintId`,a.`projectId`,a.`milestoneId`,a.`createdAt`
FROM `_v312_active_complaints` a
INNER JOIN `complaints` c ON c.`id` = a.`complaintId`
LEFT JOIN `complaint_active_locks` l ON l.`complaintId` = a.`complaintId`
WHERE a.`projectRank` = 1
  AND c.`status` IN ('submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending')
  AND l.`complaintId` IS NULL;
--> statement-breakpoint
DROP TEMPORARY TABLE `_v312_complaints_to_close`;
--> statement-breakpoint
DROP TEMPORARY TABLE `_v312_active_complaints`;
