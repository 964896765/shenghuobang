CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int,
	`actorRole` varchar(32) NOT NULL,
	`action` varchar(96) NOT NULL,
	`resourceType` varchar(64) NOT NULL,
	`resourceId` varchar(64),
	`result` enum('success','denied','failed') NOT NULL DEFAULT 'success',
	`riskLevel` enum('normal','sensitive','high') NOT NULL DEFAULT 'normal',
	`detail` json,
	`ipAddress` varchar(64),
	`userAgent` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `complaint_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaintId` int NOT NULL,
	`actorId` int NOT NULL,
	`actorType` enum('user','admin','system') NOT NULL,
	`action` varchar(64) NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `complaint_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `complaint_credit_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaintId` int NOT NULL,
	`targetUserId` int NOT NULL,
	`action` enum('warning','credit_deduction','restrict_orders','suspend_account') NOT NULL,
	`scoreChange` int NOT NULL DEFAULT 0,
	`reason` varchar(500) NOT NULL,
	`status` enum('pending','applied','reverted') NOT NULL DEFAULT 'applied',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `complaint_credit_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `complaint_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaintId` int NOT NULL,
	`decisionNo` varchar(40) NOT NULL,
	`result` enum('dismiss','continue_performance','redeliver','full_refund','partial_refund','release_all','partial_release') NOT NULL,
	`reason` text NOT NULL,
	`refundAmount` decimal(14,2),
	`releaseAmount` decimal(14,2),
	`decidedBy` int NOT NULL,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `complaint_decisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `complaint_decisions_complaint_unique` UNIQUE(`complaintId`),
	CONSTRAINT `complaint_decisions_no_unique` UNIQUE(`decisionNo`)
);
--> statement-breakpoint
CREATE TABLE `complaint_fund_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaintId` int NOT NULL,
	`escrowId` int,
	`settlementId` int,
	`refundId` int,
	`releaseId` int,
	`action` enum('freeze','unfreeze','refund','partial_refund','release','partial_release') NOT NULL,
	`amount` decimal(14,2),
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `complaint_fund_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `complaint_status_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaintId` int NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32) NOT NULL,
	`actorId` int,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `complaint_status_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `engineer_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`realName` varchar(64) NOT NULL,
	`professionalTitle` varchar(128) NOT NULL,
	`primaryCategory` varchar(64) NOT NULL,
	`yearsOfExperience` int NOT NULL DEFAULT 0,
	`introduction` text,
	`skills` json,
	`status` enum('draft','submitted','under_review','additional_info_required','approved','rejected','expired','revoked') NOT NULL DEFAULT 'submitted',
	`rejectReason` varchar(500),
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engineer_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `escrow_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`escrowNo` varchar(40) NOT NULL,
	`paymentId` int NOT NULL,
	`orderId` int NOT NULL,
	`projectId` int,
	`payerId` int NOT NULL,
	`payeeId` int NOT NULL,
	`totalAmount` decimal(14,2) NOT NULL,
	`fundedAmount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`releasedAmount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`refundedAmount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`currency` varchar(3) NOT NULL DEFAULT 'CNY',
	`status` enum('pending','funded','partially_released','released','frozen','partially_refunded','refunded','closed') NOT NULL DEFAULT 'pending',
	`frozenReason` varchar(500),
	`fundedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `escrow_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `escrow_records_escrow_no_unique` UNIQUE(`escrowNo`),
	CONSTRAINT `escrow_records_payment_unique` UNIQUE(`paymentId`)
);
--> statement-breakpoint
CREATE TABLE `escrow_releases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`releaseNo` varchar(40) NOT NULL,
	`escrowId` int NOT NULL,
	`settlementId` int,
	`amount` decimal(14,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'CNY',
	`status` enum('pending','processing','success','failed','cancelled') NOT NULL DEFAULT 'pending',
	`idempotencyKey` varchar(128) NOT NULL,
	`releasedBy` int,
	`releasedAt` timestamp,
	`failedReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `escrow_releases_id` PRIMARY KEY(`id`),
	CONSTRAINT `escrow_releases_release_no_unique` UNIQUE(`releaseNo`),
	CONSTRAINT `escrow_releases_idempotency_unique` UNIQUE(`idempotencyKey`),
	CONSTRAINT `escrow_releases_settlement_unique` UNIQUE(`settlementId`)
);
--> statement-breakpoint
CREATE TABLE `identity_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`realName` varchar(64) NOT NULL,
	`idType` varchar(32) NOT NULL DEFAULT 'cn_id',
	`idNumberDigest` varchar(64) NOT NULL,
	`idNumberLast4` varchar(4) NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'manual',
	`status` enum('draft','submitted','under_review','additional_info_required','approved','rejected','expired','revoked') NOT NULL DEFAULT 'submitted',
	`rejectReason` varchar(500),
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `identity_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `merchant_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`merchantName` varchar(128) NOT NULL,
	`registrationNoDigest` varchar(64),
	`registrationNoLast4` varchar(4),
	`categories` json,
	`description` text,
	`addressText` varchar(255),
	`status` enum('draft','submitted','under_review','additional_info_required','approved','rejected','expired','revoked') NOT NULL DEFAULT 'submitted',
	`rejectReason` varchar(500),
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchant_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` int NOT NULL,
	`attemptNo` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`providerRequestId` varchar(128) NOT NULL,
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
	`requestData` json,
	`responseData` json,
	`failedReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `payment_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_attempts_payment_no_unique` UNIQUE(`paymentId`,`attemptNo`),
	CONSTRAINT `payment_attempts_provider_req_unique` UNIQUE(`provider`,`providerRequestId`)
);
--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` int NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`amount` decimal(14,2),
	`currency` varchar(3) NOT NULL DEFAULT 'CNY',
	`externalEventNo` varchar(128),
	`detail` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_events_external_unique` UNIQUE(`externalEventNo`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentNo` varchar(40) NOT NULL,
	`orderId` int NOT NULL,
	`payerId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'CNY',
	`provider` varchar(32) NOT NULL DEFAULT 'sandbox',
	`providerTransactionNo` varchar(128),
	`status` enum('created','pending','success','failed','closed','refunding','partially_refunded','refunded') NOT NULL DEFAULT 'created',
	`idempotencyKey` varchar(128) NOT NULL,
	`paidAt` timestamp,
	`failedReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_payment_no_unique` UNIQUE(`paymentNo`),
	CONSTRAINT `payments_payer_idempotency_unique` UNIQUE(`payerId`,`idempotencyKey`),
	CONSTRAINT `payments_provider_tx_unique` UNIQUE(`provider`,`providerTransactionNo`)
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`refundNo` varchar(40) NOT NULL,
	`paymentId` int NOT NULL,
	`orderId` int NOT NULL,
	`requesterId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'CNY',
	`reason` text NOT NULL,
	`status` enum('draft','submitted','under_review','approved','processing','success','rejected','cancelled','failed') NOT NULL DEFAULT 'submitted',
	`idempotencyKey` varchar(128) NOT NULL,
	`providerRefundNo` varchar(128),
	`reviewedBy` int,
	`reviewReason` varchar(500),
	`reviewedAt` timestamp,
	`completedAt` timestamp,
	`failedReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`),
	CONSTRAINT `refunds_refund_no_unique` UNIQUE(`refundNo`),
	CONSTRAINT `refunds_requester_idem_unique` UNIQUE(`requesterId`,`idempotencyKey`),
	CONSTRAINT `refunds_provider_refund_unique` UNIQUE(`providerRefundNo`)
);
--> statement-breakpoint
CREATE TABLE `settlement_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settlementId` int NOT NULL,
	`milestoneId` int,
	`orderId` int,
	`itemType` varchar(32) NOT NULL DEFAULT 'milestone',
	`description` varchar(255),
	`amount` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `settlement_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settlementNo` varchar(40) NOT NULL,
	`projectId` int NOT NULL,
	`milestoneId` int NOT NULL,
	`payeeId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'CNY',
	`status` enum('pending','under_review','approved','processing','settled','rejected','frozen') NOT NULL DEFAULT 'pending',
	`idempotencyKey` varchar(128) NOT NULL,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`settledAt` timestamp,
	`frozenReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `settlements_settlement_no_unique` UNIQUE(`settlementNo`),
	CONSTRAINT `settlements_milestone_unique` UNIQUE(`milestoneId`),
	CONSTRAINT `settlements_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `verification_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`verificationType` enum('identity','engineer','merchant') NOT NULL,
	`verificationId` int NOT NULL,
	`actorId` int NOT NULL,
	`action` enum('submit','resubmit','start_review','approve','request_info','reject','revoke') NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32) NOT NULL,
	`reason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `verification_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`verificationType` enum('identity','engineer','merchant') NOT NULL,
	`verificationId` int NOT NULL,
	`ownerId` int NOT NULL,
	`documentType` varchar(64) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`mimeType` varchar(128),
	`sizeBytes` int NOT NULL,
	`status` enum('available','superseded','disabled') NOT NULL DEFAULT 'available',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `complaints` MODIFY COLUMN `status` enum('submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending','resolved','rejected','withdrawn','closed') NOT NULL DEFAULT 'submitted';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','verification_reviewer','complaint_operator','finance_operator','customer_service') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_actions` ADD CONSTRAINT `complaint_actions_complaintId_complaints_id_fk` FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_actions` ADD CONSTRAINT `complaint_actions_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_credit_actions` ADD CONSTRAINT `complaint_credit_actions_complaintId_complaints_id_fk` FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_credit_actions` ADD CONSTRAINT `complaint_credit_actions_targetUserId_users_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_decisions` ADD CONSTRAINT `complaint_decisions_complaintId_complaints_id_fk` FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_decisions` ADD CONSTRAINT `complaint_decisions_decidedBy_users_id_fk` FOREIGN KEY (`decidedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_fund_actions` ADD CONSTRAINT `complaint_fund_actions_complaintId_complaints_id_fk` FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_fund_actions` ADD CONSTRAINT `complaint_fund_actions_escrowId_escrow_records_id_fk` FOREIGN KEY (`escrowId`) REFERENCES `escrow_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_fund_actions` ADD CONSTRAINT `complaint_fund_actions_settlementId_settlements_id_fk` FOREIGN KEY (`settlementId`) REFERENCES `settlements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_fund_actions` ADD CONSTRAINT `complaint_fund_actions_refundId_refunds_id_fk` FOREIGN KEY (`refundId`) REFERENCES `refunds`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_fund_actions` ADD CONSTRAINT `complaint_fund_actions_releaseId_escrow_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `escrow_releases`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_status_logs` ADD CONSTRAINT `complaint_status_logs_complaintId_complaints_id_fk` FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaint_status_logs` ADD CONSTRAINT `complaint_status_logs_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `engineer_verifications` ADD CONSTRAINT `engineer_verifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `engineer_verifications` ADD CONSTRAINT `engineer_verifications_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `escrow_records` ADD CONSTRAINT `escrow_records_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `escrow_records` ADD CONSTRAINT `escrow_records_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `escrow_records` ADD CONSTRAINT `escrow_records_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `escrow_records` ADD CONSTRAINT `escrow_records_payerId_users_id_fk` FOREIGN KEY (`payerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `escrow_records` ADD CONSTRAINT `escrow_records_payeeId_users_id_fk` FOREIGN KEY (`payeeId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `escrow_releases` ADD CONSTRAINT `escrow_releases_escrowId_escrow_records_id_fk` FOREIGN KEY (`escrowId`) REFERENCES `escrow_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `escrow_releases` ADD CONSTRAINT `escrow_releases_settlementId_settlements_id_fk` FOREIGN KEY (`settlementId`) REFERENCES `settlements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `escrow_releases` ADD CONSTRAINT `escrow_releases_releasedBy_users_id_fk` FOREIGN KEY (`releasedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `identity_verifications` ADD CONSTRAINT `identity_verifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `identity_verifications` ADD CONSTRAINT `identity_verifications_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_verifications` ADD CONSTRAINT `merchant_verifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchant_verifications` ADD CONSTRAINT `merchant_verifications_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_attempts` ADD CONSTRAINT `payment_attempts_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_events` ADD CONSTRAINT `payment_events_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_payerId_users_id_fk` FOREIGN KEY (`payerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_requesterId_users_id_fk` FOREIGN KEY (`requesterId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settlement_items` ADD CONSTRAINT `settlement_items_settlementId_settlements_id_fk` FOREIGN KEY (`settlementId`) REFERENCES `settlements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settlement_items` ADD CONSTRAINT `settlement_items_milestoneId_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settlement_items` ADD CONSTRAINT `settlement_items_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settlements` ADD CONSTRAINT `settlements_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settlements` ADD CONSTRAINT `settlements_milestoneId_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `milestones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settlements` ADD CONSTRAINT `settlements_payeeId_users_id_fk` FOREIGN KEY (`payeeId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settlements` ADD CONSTRAINT `settlements_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verification_actions` ADD CONSTRAINT `verification_actions_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verification_documents` ADD CONSTRAINT `verification_documents_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_logs_actor_created_idx` ON `audit_logs` (`actorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_resource_idx` ON `audit_logs` (`resourceType`,`resourceId`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_created_idx` ON `audit_logs` (`action`,`createdAt`);--> statement-breakpoint
CREATE INDEX `complaint_actions_complaint_idx` ON `complaint_actions` (`complaintId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `complaint_credit_actions_complaint_idx` ON `complaint_credit_actions` (`complaintId`);--> statement-breakpoint
CREATE INDEX `complaint_fund_actions_complaint_idx` ON `complaint_fund_actions` (`complaintId`);--> statement-breakpoint
CREATE INDEX `complaint_status_logs_complaint_idx` ON `complaint_status_logs` (`complaintId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `engineer_verifications_user_status_idx` ON `engineer_verifications` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `escrow_records_project_status_idx` ON `escrow_records` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `identity_verifications_user_status_idx` ON `identity_verifications` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `merchant_verifications_user_status_idx` ON `merchant_verifications` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `payment_events_payment_created_idx` ON `payment_events` (`paymentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payments_order_status_idx` ON `payments` (`orderId`,`status`);--> statement-breakpoint
CREATE INDEX `refunds_payment_status_idx` ON `refunds` (`paymentId`,`status`);--> statement-breakpoint
CREATE INDEX `settlement_items_settlement_idx` ON `settlement_items` (`settlementId`);--> statement-breakpoint
CREATE INDEX `settlements_project_status_idx` ON `settlements` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `verification_actions_verification_idx` ON `verification_actions` (`verificationType`,`verificationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `verification_documents_verification_idx` ON `verification_documents` (`verificationType`,`verificationId`);--> statement-breakpoint
CREATE INDEX `verification_documents_owner_idx` ON `verification_documents` (`ownerId`);
--> statement-breakpoint
INSERT INTO `engineer_verifications`
  (`userId`,`realName`,`professionalTitle`,`primaryCategory`,`yearsOfExperience`,`introduction`,`skills`,`status`,`reviewedAt`,`submittedAt`)
SELECT ep.`userId`, COALESCE(ep.`realName`, '历史认证工程师'), COALESCE(ep.`professionalTitle`, '工程师'),
  COALESCE(ep.`primaryCategory`, '其他'), COALESCE(ep.`yearsOfExperience`, 0), ep.`introduction`, ep.`skills`,
  'approved', NOW(), ep.`createdAt`
FROM `engineer_profiles` ep
INNER JOIN `user_profiles` up ON up.`userId` = ep.`userId`
WHERE up.`engineerStatus` = 'active'
  AND NOT EXISTS (SELECT 1 FROM `engineer_verifications` ev WHERE ev.`userId` = ep.`userId`);
--> statement-breakpoint
INSERT INTO `merchant_verifications`
  (`userId`,`merchantName`,`categories`,`description`,`addressText`,`status`,`reviewedAt`,`submittedAt`)
SELECT mp.`userId`, mp.`name`, mp.`categories`, mp.`description`, mp.`addressText`, 'approved', NOW(), mp.`createdAt`
FROM `merchant_profiles` mp
INNER JOIN `user_profiles` up ON up.`userId` = mp.`userId`
WHERE up.`merchantStatus` = 'active'
  AND NOT EXISTS (SELECT 1 FROM `merchant_verifications` mv WHERE mv.`userId` = mp.`userId`);
--> statement-breakpoint
INSERT INTO `orders` (`orderType`,`buyerId`,`sellerId`,`refId`,`title`,`amount`,`status`,`paidAt`,`completedAt`,`createdAt`)
SELECT 'project', p.`ownerId`, p.`engineerId`, p.`id`, CONCAT('[项目] ', p.`title`), p.`totalAmount`,
  CASE
    WHEN p.`status` = 'pending_payment' THEN 'pending_payment'
    WHEN p.`status` IN ('completed','closed') THEN 'completed'
    WHEN p.`status` = 'refunded' THEN 'refunded'
    WHEN p.`status` = 'disputed' THEN 'disputed'
    WHEN p.`status` = 'cancelled' THEN 'cancelled'
    ELSE 'pending_delivery'
  END,
  CASE WHEN p.`status` NOT IN ('pending_confirmation','pending_agreement','pending_payment','cancelled') THEN COALESCE(p.`startedAt`, p.`createdAt`) ELSE NULL END,
  CASE WHEN p.`status` IN ('completed','closed') THEN COALESCE(p.`completedAt`, p.`updatedAt`) ELSE NULL END,
  p.`createdAt`
FROM `projects` p
WHERE NOT EXISTS (SELECT 1 FROM `orders` o WHERE o.`orderType` = 'project' AND o.`refId` = p.`id`);
--> statement-breakpoint
INSERT INTO `settlements` (`settlementNo`,`projectId`,`milestoneId`,`payeeId`,`amount`,`status`,`idempotencyKey`,`createdAt`)
SELECT CONCAT('SETLEGACY', LPAD(m.`id`, 12, '0')), m.`projectId`, m.`id`, p.`engineerId`, CAST(COALESCE(m.`amount`, 0) AS DECIMAL(14,2)),
  'pending', CONCAT('milestone:', m.`id`, ':settlement'), COALESCE(m.`acceptedAt`, m.`createdAt`)
FROM `milestones` m
INNER JOIN `projects` p ON p.`id` = m.`projectId`
WHERE m.`status` = 'accepted'
  AND NOT EXISTS (SELECT 1 FROM `settlements` s WHERE s.`milestoneId` = m.`id`);
--> statement-breakpoint
INSERT INTO `settlement_items` (`settlementId`,`milestoneId`,`orderId`,`itemType`,`description`,`amount`,`createdAt`)
SELECT s.`id`, s.`milestoneId`, o.`id`, 'milestone', m.`title`, s.`amount`, s.`createdAt`
FROM `settlements` s
INNER JOIN `milestones` m ON m.`id` = s.`milestoneId`
LEFT JOIN `orders` o ON o.`orderType` = 'project' AND o.`refId` = s.`projectId`
WHERE NOT EXISTS (SELECT 1 FROM `settlement_items` si WHERE si.`settlementId` = s.`id` AND si.`milestoneId` = s.`milestoneId`);
--> statement-breakpoint
INSERT INTO `complaint_status_logs` (`complaintId`,`fromStatus`,`toStatus`,`actorId`,`note`,`createdAt`)
SELECT c.`id`, NULL, c.`status`, c.`complainantId`, 'V3.1 迁移回填历史投诉状态', c.`createdAt`
FROM `complaints` c
WHERE NOT EXISTS (SELECT 1 FROM `complaint_status_logs` l WHERE l.`complaintId` = c.`id`);
