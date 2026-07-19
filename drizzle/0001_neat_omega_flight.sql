CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userAId` int NOT NULL,
	`userBId` int NOT NULL,
	`refType` varchar(32),
	`refId` int,
	`lastMessage` varchar(255),
	`lastMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`scoreChange` int NOT NULL DEFAULT 0,
	`reason` varchar(255),
	`refType` varchar(32),
	`refId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `engineer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`realName` varchar(64),
	`professionalTitle` varchar(128),
	`primaryCategory` varchar(64),
	`yearsOfExperience` int DEFAULT 0,
	`introduction` text,
	`skills` json,
	`cityName` varchar(64),
	`supportsRemote` boolean DEFAULT true,
	`supportsOnsite` boolean DEFAULT false,
	`startingPrice` int DEFAULT 0,
	`acceptingOrders` boolean DEFAULT true,
	`verificationLevel` enum('none','basic','professional') NOT NULL DEFAULT 'none',
	`rating` int NOT NULL DEFAULT 50,
	`completedProjects` int DEFAULT 0,
	`responseMinutes` int DEFAULT 30,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `engineer_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `engineer_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `giveaway_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`applicantId` int NOT NULL,
	`reason` varchar(255),
	`status` enum('submitted','selected','rejected','withdrawn') NOT NULL DEFAULT 'submitted',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `giveaway_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`category` varchar(64) DEFAULT '其他',
	`brand` varchar(64),
	`conditionLevel` varchar(32) DEFAULT '九成新',
	`functionStatus` varchar(32) DEFAULT '功能正常',
	`description` text,
	`imageUrls` json,
	`cityName` varchar(64) DEFAULT '北京',
	`modes` json,
	`primaryMode` varchar(32) NOT NULL DEFAULT 'fixed_price',
	`price` int,
	`minAcceptPrice` int,
	`giveawayRule` varchar(32),
	`status` enum('draft','published','reserved','completed','closed') NOT NULL DEFAULT 'published',
	`itemStatus` varchar(32) DEFAULT 'listed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `listings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `merchant_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`categories` json,
	`description` text,
	`cityName` varchar(64),
	`addressText` varchar(255),
	`supportsHomeService` boolean DEFAULT true,
	`acceptingOrders` boolean DEFAULT true,
	`rating` int NOT NULL DEFAULT 48,
	`completedOrders` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `merchant_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `merchant_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`amount` int DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('pending','in_progress','submitted','waiting_acceptance','revision_required','accepted','overdue','disputed','cancelled') NOT NULL DEFAULT 'pending',
	`deliveryNote` text,
	`revisionReason` text,
	`submittedAt` timestamp,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `milestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `need_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`needId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `need_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `need_supports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`needId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `need_supports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `needs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`needType` varchar(32) NOT NULL DEFAULT 'life',
	`title` varchar(255) NOT NULL,
	`originalDescription` text,
	`structuredData` json,
	`category` varchar(64),
	`budgetMin` int,
	`budgetMax` int,
	`expectedDeadline` varchar(64),
	`cityName` varchar(64) DEFAULT '北京',
	`supportsRemote` boolean DEFAULT true,
	`requiresOnsite` boolean DEFAULT false,
	`visibility` enum('public','private') NOT NULL DEFAULT 'public',
	`allowComments` boolean DEFAULT true,
	`allowQuotes` boolean DEFAULT true,
	`status` enum('draft','pending_review','published','collecting_solutions','selecting_quote','project_created','solved','closed','rejected') NOT NULL DEFAULT 'draft',
	`supportCount` int NOT NULL DEFAULT 0,
	`publishedAt` timestamp,
	`closedAt` timestamp,
	`closeReason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `needs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`category` enum('system','need','project','order') NOT NULL DEFAULT 'system',
	`title` varchar(255) NOT NULL,
	`content` text,
	`refType` varchar(32),
	`refId` int,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`buyerId` int NOT NULL,
	`amount` int NOT NULL,
	`message` varchar(255),
	`status` enum('submitted','negotiating','accepted','rejected','withdrawn','expired','not_selected') NOT NULL DEFAULT 'submitted',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_status_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32) NOT NULL,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_status_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderType` enum('listing','project','recycling') NOT NULL DEFAULT 'listing',
	`buyerId` int NOT NULL,
	`sellerId` int NOT NULL,
	`refId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`amount` int NOT NULL,
	`status` enum('pending_confirmation','pending_payment','paid','pending_delivery','pending_acceptance','completed','cancelled','refunding','refunded','disputed','closed') NOT NULL DEFAULT 'pending_payment',
	`paidAt` timestamp,
	`completedAt` timestamp,
	`buyerReviewed` boolean DEFAULT false,
	`sellerReviewed` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`needId` int NOT NULL,
	`quoteId` int NOT NULL,
	`ownerId` int NOT NULL,
	`engineerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`totalAmount` int NOT NULL,
	`status` enum('pending_confirmation','pending_agreement','pending_payment','in_progress','waiting_acceptance','revision','paused','disputed','completed','cancelled','refunded','closed') NOT NULL DEFAULT 'pending_confirmation',
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`needId` int NOT NULL,
	`engineerId` int NOT NULL,
	`totalPrice` int NOT NULL,
	`durationDays` int NOT NULL,
	`deliverables` text NOT NULL,
	`exclusions` text,
	`paymentTerms` varchar(255),
	`revisionCount` int DEFAULT 2,
	`supportDays` int DEFAULT 30,
	`validDays` int DEFAULT 7,
	`status` enum('submitted','viewed','negotiating','accepted','rejected','withdrawn','expired','not_selected') NOT NULL DEFAULT 'submitted',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recycling_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`merchantUserId` int NOT NULL,
	`merchantName` varchar(128),
	`amount` int NOT NULL,
	`note` varchar(255),
	`pickupTime` varchar(64),
	`status` enum('submitted','selected','not_selected','withdrawn','adjusted','confirmed') NOT NULL DEFAULT 'submitted',
	`adjustedAmount` int,
	`adjustReason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recycling_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recycling_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`category` varchar(64) DEFAULT '家电',
	`conditionDesc` text,
	`imageUrls` json,
	`cityName` varchar(64) DEFAULT '北京',
	`expectedPrice` int,
	`status` enum('quoting','quoted','selected','inspecting','completed','cancelled') NOT NULL DEFAULT 'quoting',
	`selectedQuoteId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recycling_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`reviewerId` int NOT NULL,
	`revieweeId` int NOT NULL,
	`overallRating` int NOT NULL,
	`dimensions` json,
	`content` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `solutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`needId` int NOT NULL,
	`providerId` int NOT NULL,
	`providerType` enum('user','engineer','ai') NOT NULL DEFAULT 'engineer',
	`understanding` text,
	`approach` text NOT NULL,
	`risks` text,
	`status` enum('submitted','visible','withdrawn','selected','not_selected','removed') NOT NULL DEFAULT 'visible',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `solutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`nickname` varchar(64),
	`avatarUrl` text,
	`bio` text,
	`cityCode` varchar(32) DEFAULT 'beijing',
	`cityName` varchar(64) DEFAULT '北京',
	`currentRole` enum('user','engineer','merchant') NOT NULL DEFAULT 'user',
	`engineerStatus` enum('none','pending','active','rejected') NOT NULL DEFAULT 'none',
	`merchantStatus` enum('none','pending','active','rejected') NOT NULL DEFAULT 'none',
	`creditScore` int NOT NULL DEFAULT 100,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_userId_unique` UNIQUE(`userId`)
);
