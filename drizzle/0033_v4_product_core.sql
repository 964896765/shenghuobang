-- V4 M2: trusted product model, physical unit identity and append-only passport events.
CREATE TABLE `product_models` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicCode` varchar(32) NOT NULL,
  `ownerAccountId` int NOT NULL,
  `ownerOrganizationId` int,
  `name` varchar(160) NOT NULL,
  `summary` varchar(500) NOT NULL,
  `description` text,
  `categoryCode` varchar(64) NOT NULL,
  `brandName` varchar(128),
  `modelCode` varchar(128),
  `versionLabel` varchar(64) NOT NULL DEFAULT 'v1',
  `specifications` json NOT NULL,
  `visibility` enum('public','owner_only','restricted') NOT NULL DEFAULT 'owner_only',
  `status` enum('draft','active','retired','archived') NOT NULL DEFAULT 'draft',
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `createdRequestId` varchar(64) NOT NULL,
  `lastRequestId` varchar(64) NOT NULL,
  `publishedAt` timestamp,
  `retiredAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp,
  CONSTRAINT `product_models_id` PRIMARY KEY (`id`),
  CONSTRAINT `product_models_public_code_uq` UNIQUE (`publicCode`),
  CONSTRAINT `product_models_created_request_uq` UNIQUE (`createdRequestId`),
  CONSTRAINT `product_models_last_request_uq` UNIQUE (`lastRequestId`),
  CONSTRAINT `product_models_owner_account_fk` FOREIGN KEY (`ownerAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `product_models_owner_organization_fk` FOREIGN KEY (`ownerOrganizationId`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `product_models_owner_status_idx` ON `product_models` (`ownerAccountId`,`status`,`deletedAt`);
--> statement-breakpoint
CREATE INDEX `product_models_organization_status_idx` ON `product_models` (`ownerOrganizationId`,`status`,`deletedAt`);
--> statement-breakpoint
CREATE INDEX `product_models_public_feed_idx` ON `product_models` (`visibility`,`status`,`publishedAt`);
--> statement-breakpoint
CREATE TABLE `product_source_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `productModelId` int NOT NULL,
  `sourceType` enum('need','idea','project','legacy_item') NOT NULL,
  `sourceId` int NOT NULL,
  `relationType` enum('derived_from','validated_by','produced_by','migrated_from') NOT NULL DEFAULT 'derived_from',
  `createdByAccountId` int NOT NULL,
  `requestId` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `product_source_links_id` PRIMARY KEY (`id`),
  CONSTRAINT `product_source_links_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `product_source_links_relation_uq` UNIQUE (`productModelId`,`sourceType`,`sourceId`,`relationType`),
  CONSTRAINT `product_source_links_model_fk` FOREIGN KEY (`productModelId`) REFERENCES `product_models` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `product_source_links_creator_fk` FOREIGN KEY (`createdByAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `product_source_links_source_idx` ON `product_source_links` (`sourceType`,`sourceId`);
--> statement-breakpoint
CREATE TABLE `product_units` (
  `id` int AUTO_INCREMENT NOT NULL,
  `productModelId` int NOT NULL,
  `linkedItemId` int,
  `currentOwnerAccountId` int,
  `publicCode` varchar(40) NOT NULL,
  `serialNumber` varchar(128),
  `batchCode` varchar(96),
  `status` enum('registered','manufactured','in_use','idle','listed','under_service','transferred','recycling','recycled','retired') NOT NULL DEFAULT 'registered',
  `trustLevel` enum('self_declared','verified','certified') NOT NULL DEFAULT 'self_declared',
  `passportVisibility` enum('public','owner_only','restricted') NOT NULL DEFAULT 'owner_only',
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `createdRequestId` varchar(64) NOT NULL,
  `lastRequestId` varchar(64) NOT NULL,
  `manufacturedAt` timestamp,
  `activatedAt` timestamp,
  `retiredAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `product_units_id` PRIMARY KEY (`id`),
  CONSTRAINT `product_units_public_code_uq` UNIQUE (`publicCode`),
  CONSTRAINT `product_units_created_request_uq` UNIQUE (`createdRequestId`),
  CONSTRAINT `product_units_last_request_uq` UNIQUE (`lastRequestId`),
  CONSTRAINT `product_units_linked_item_uq` UNIQUE (`linkedItemId`),
  CONSTRAINT `product_units_model_serial_uq` UNIQUE (`productModelId`,`serialNumber`),
  CONSTRAINT `product_units_model_fk` FOREIGN KEY (`productModelId`) REFERENCES `product_models` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `product_units_linked_item_fk` FOREIGN KEY (`linkedItemId`) REFERENCES `items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `product_units_current_owner_fk` FOREIGN KEY (`currentOwnerAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `product_units_model_status_idx` ON `product_units` (`productModelId`,`status`);
--> statement-breakpoint
CREATE INDEX `product_units_owner_status_idx` ON `product_units` (`currentOwnerAccountId`,`status`);
--> statement-breakpoint
CREATE TABLE `product_passport_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `productUnitId` int NOT NULL,
  `sequenceNumber` int NOT NULL,
  `eventType` varchar(64) NOT NULL,
  `actorAccountId` int,
  `actorOrganizationId` int,
  `fromStatus` varchar(32),
  `toStatus` varchar(32),
  `visibility` enum('public','owner','internal') NOT NULL DEFAULT 'owner',
  `sourceType` varchar(64),
  `sourceId` varchar(64),
  `requestId` varchar(64) NOT NULL,
  `detail` json NOT NULL,
  `previousEventHash` char(64),
  `eventHash` char(64) NOT NULL,
  `occurredAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `product_passport_events_id` PRIMARY KEY (`id`),
  CONSTRAINT `product_passport_events_request_uq` UNIQUE (`requestId`),
  CONSTRAINT `product_passport_events_unit_sequence_uq` UNIQUE (`productUnitId`,`sequenceNumber`),
  CONSTRAINT `product_passport_events_unit_fk` FOREIGN KEY (`productUnitId`) REFERENCES `product_units` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `product_passport_events_actor_account_fk` FOREIGN KEY (`actorAccountId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `product_passport_events_actor_organization_fk` FOREIGN KEY (`actorOrganizationId`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `product_passport_events_unit_timeline_idx` ON `product_passport_events` (`productUnitId`,`occurredAt`);
--> statement-breakpoint
CREATE INDEX `product_passport_events_source_idx` ON `product_passport_events` (`sourceType`,`sourceId`);
--> statement-breakpoint
INSERT INTO `capabilities` (`code`,`domain`,`name`,`description`,`riskLevel`,`defaultAuditMode`,`status`,`replacementCode`,`deletedAt`) VALUES
  ('product.model.create','product','创建产品型号','创建本人或有权组织的产品型号草稿','sensitive','allow_and_deny','active',NULL,NULL),
  ('product.model.view_public','product','查看公开产品型号','查看已发布的公开产品型号','normal','deny','active',NULL,NULL),
  ('product.model.view_owner','product','查看本人产品型号','查看本人或有权组织的产品型号','sensitive','allow_and_deny','active',NULL,NULL),
  ('product.model.edit','product','编辑产品型号','编辑本人或有权组织的产品型号','sensitive','allow_and_deny','active',NULL,NULL),
  ('product.model.publish','product','发布产品型号','将产品型号发布为公开产品定义','high','allow_and_deny','active',NULL,NULL),
  ('product.model.retire','product','停用产品型号','停用产品型号并保留历史','high','allow_and_deny','active',NULL,NULL),
  ('product.unit.register','product','登记产品单元','为具体实物登记稳定产品身份','high','allow_and_deny','active',NULL,NULL),
  ('product.unit.view_public','product','查看公开产品单元','查看公开产品身份和公开护照摘要','normal','deny','active',NULL,NULL),
  ('product.unit.view_owner','product','查看本人产品单元','查看本人产品单元和所有者字段','sensitive','allow_and_deny','active',NULL,NULL),
  ('product.unit.link_item','product','关联既有物品','把产品单元关联到既有物品档案','high','allow_and_deny','active',NULL,NULL),
  ('product.unit.transition','product','变更产品状态','按状态机变更产品单元状态','high','allow_and_deny','active',NULL,NULL),
  ('product.passport.append','product','追加护照事件','向产品护照追加不可静默覆盖的事件','high','allow_and_deny','active',NULL,NULL),
  ('product.passport.view_public','product','查看公开护照','查看公开产品护照事件','normal','deny','active',NULL,NULL),
  ('product.passport.view_owner','product','查看所有者护照','查看本人产品单元的所有者事件','sensitive','allow_and_deny','active',NULL,NULL),
  ('product.passport.view_internal','product','查看内部护照','查看产品单元的内部追溯事件','high','allow_and_deny','active',NULL,NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
  BINARY `capabilities`.`domain` <=> BINARY new.`domain`
  AND BINARY `capabilities`.`name` <=> BINARY new.`name`
  AND BINARY `capabilities`.`description` <=> BINARY new.`description`
  AND BINARY `capabilities`.`riskLevel` <=> BINARY new.`riskLevel`
  AND BINARY `capabilities`.`defaultAuditMode` <=> BINARY new.`defaultAuditMode`
  AND BINARY `capabilities`.`status` <=> BINARY new.`status`,
  `capabilities`.`code`, NULL
);
