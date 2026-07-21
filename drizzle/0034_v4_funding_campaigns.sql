ALTER TABLE `product_source_links` MODIFY COLUMN `sourceType` enum('need','idea','project','legacy_item','funding_campaign') NOT NULL;
--> statement-breakpoint
CREATE TABLE `funding_campaigns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicCode` varchar(32) NOT NULL,
  `ownerAccountId` int NOT NULL,
  `sourceType` enum('need','idea','project','product_model') NOT NULL,
  `sourceId` int NOT NULL,
  `title` varchar(160) NOT NULL,
  `summary` varchar(500) NOT NULL,
  `description` text NOT NULL,
  `categoryCode` varchar(64) NOT NULL,
  `coverUrl` varchar(1000),
  `goalQuantity` int NOT NULL,
  `pledgedQuantity` int NOT NULL DEFAULT 0,
  `activePledgeCount` int NOT NULL DEFAULT 0,
  `evidence` json NOT NULL,
  `verificationSummary` text,
  `riskSummary` text NOT NULL,
  `visibility` enum('public','owner_only') NOT NULL DEFAULT 'owner_only',
  `status` enum('draft','reviewing','active','succeeded','failed','cancelled','closed') NOT NULL DEFAULT 'draft',
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `activeSourceDedupeKey` varchar(191),
  `createdRequestId` varchar(64) NOT NULL,
  `lastRequestId` varchar(64) NOT NULL,
  `startsAt` timestamp NULL,
  `endsAt` timestamp NULL,
  `publishedAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  CONSTRAINT `funding_campaigns_id` PRIMARY KEY (`id`),
  CONSTRAINT `funding_campaigns_public_code_uq` UNIQUE (`publicCode`),
  CONSTRAINT `funding_campaigns_active_source_uq` UNIQUE (`activeSourceDedupeKey`),
  CONSTRAINT `funding_campaigns_created_request_uq` UNIQUE (`createdRequestId`),
  CONSTRAINT `funding_campaigns_last_request_uq` UNIQUE (`lastRequestId`),
  CONSTRAINT `funding_campaigns_owner_fk` FOREIGN KEY (`ownerAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `funding_campaigns_goal_quantity_ck` CHECK (`goalQuantity` > 0),
  CONSTRAINT `funding_campaigns_pledged_quantity_ck` CHECK (`pledgedQuantity` >= 0),
  CONSTRAINT `funding_campaigns_active_pledge_count_ck` CHECK (`activePledgeCount` >= 0)
);
--> statement-breakpoint
CREATE INDEX `funding_campaigns_owner_status_idx` ON `funding_campaigns` (`ownerAccountId`,`status`,`deletedAt`);
--> statement-breakpoint
CREATE INDEX `funding_campaigns_public_feed_idx` ON `funding_campaigns` (`visibility`,`status`,`publishedAt`);
--> statement-breakpoint
CREATE INDEX `funding_campaigns_source_idx` ON `funding_campaigns` (`sourceType`,`sourceId`);
--> statement-breakpoint
CREATE INDEX `funding_campaigns_deadline_idx` ON `funding_campaigns` (`status`,`endsAt`);
--> statement-breakpoint
CREATE TABLE `funding_pledges` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int NOT NULL,
  `supporterAccountId` int NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `note` text,
  `cityName` varchar(100),
  `status` enum('active','withdrawn') NOT NULL DEFAULT 'active',
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `activeDedupeKey` varchar(191),
  `requestId` varchar(64) NOT NULL,
  `lastRequestId` varchar(64) NOT NULL,
  `withdrawnAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `funding_pledges_id` PRIMARY KEY (`id`),
  CONSTRAINT `funding_pledges_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `funding_pledges_last_request_uq` UNIQUE (`lastRequestId`),
  CONSTRAINT `funding_pledges_active_dedupe_uq` UNIQUE (`activeDedupeKey`),
  CONSTRAINT `funding_pledges_campaign_fk` FOREIGN KEY (`campaignId`) REFERENCES `funding_campaigns` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `funding_pledges_supporter_fk` FOREIGN KEY (`supporterAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `funding_pledges_quantity_ck` CHECK (`quantity` > 0)
);
--> statement-breakpoint
CREATE INDEX `funding_pledges_supporter_status_idx` ON `funding_pledges` (`supporterAccountId`,`status`);
--> statement-breakpoint
CREATE INDEX `funding_pledges_campaign_status_idx` ON `funding_pledges` (`campaignId`,`status`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `funding_campaign_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int NOT NULL,
  `sequenceNumber` int NOT NULL,
  `eventType` varchar(64) NOT NULL,
  `actorAccountId` int NOT NULL,
  `fromStatus` varchar(32),
  `toStatus` varchar(32),
  `pledgeId` int,
  `requestId` varchar(64) NOT NULL,
  `detail` json NOT NULL,
  `occurredAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `funding_campaign_events_id` PRIMARY KEY (`id`),
  CONSTRAINT `funding_campaign_events_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `funding_campaign_events_campaign_sequence_uq` UNIQUE (`campaignId`,`sequenceNumber`),
  CONSTRAINT `funding_campaign_events_campaign_fk` FOREIGN KEY (`campaignId`) REFERENCES `funding_campaigns` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `funding_campaign_events_actor_fk` FOREIGN KEY (`actorAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `funding_campaign_events_pledge_fk` FOREIGN KEY (`pledgeId`) REFERENCES `funding_pledges` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `funding_campaign_events_timeline_idx` ON `funding_campaign_events` (`campaignId`,`occurredAt`);
--> statement-breakpoint
CREATE INDEX `funding_campaign_events_pledge_idx` ON `funding_campaign_events` (`pledgeId`);
--> statement-breakpoint
INSERT INTO `capabilities` (`code`,`domain`,`name`,`description`,`riskLevel`,`defaultAuditMode`,`status`,`replacementCode`,`deletedAt`) VALUES
  ('funding.campaign.create','funding','创建新品筹措','基于本人可管理的需求、创意、项目或产品型号创建新品筹措草稿','normal','deny','active',NULL,NULL),
  ('funding.campaign.view_public','funding','查看公开新品筹措','查看已公开筹措活动及聚合进度','normal','deny','active',NULL,NULL),
  ('funding.campaign.view_owner','funding','查看本人新品筹措','查看本人管理的筹措活动和内部字段','sensitive','allow_and_deny','active',NULL,NULL),
  ('funding.campaign.edit','funding','编辑新品筹措','编辑本人可管理且尚未关闭的筹措活动','sensitive','allow_and_deny','active',NULL,NULL),
  ('funding.campaign.publish','funding','发布新品筹措','将筹措草稿发布为公开支持意向征集','high','allow_and_deny','active',NULL,NULL),
  ('funding.campaign.close','funding','结束新品筹措','将进行中的筹措标记为成功、失败、取消或关闭','high','allow_and_deny','active',NULL,NULL),
  ('funding.pledge.register','funding','登记新品支持意向','登记不含支付、订单或投资关系的新品数量意向','sensitive','allow_and_deny','active',NULL,NULL),
  ('funding.pledge.withdraw','funding','撤回新品支持意向','撤回本人已登记的新品支持意向','sensitive','allow_and_deny','active',NULL,NULL),
  ('funding.pledge.view_self','funding','查看本人新品支持意向','查看本人登记和撤回的新品支持意向历史','sensitive','allow_and_deny','active',NULL,NULL),
  ('funding.pledge.view_campaign','funding','查看筹措支持名单','查看本人管理筹措下必要脱敏资料的支持意向名单','high','allow_and_deny','active',NULL,NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
  BINARY `capabilities`.`domain` <=> BINARY new.`domain`
  AND BINARY `capabilities`.`name` <=> BINARY new.`name`
  AND BINARY `capabilities`.`description` <=> BINARY new.`description`
  AND BINARY `capabilities`.`riskLevel` <=> BINARY new.`riskLevel`
  AND BINARY `capabilities`.`defaultAuditMode` <=> BINARY new.`defaultAuditMode`
  AND BINARY `capabilities`.`status` <=> BINARY new.`status`,
  `capabilities`.`code`, NULL
);
