CREATE TABLE `document_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`pageNumber` int NOT NULL,
	`thumbnailKey` varchar(512),
	`thumbnailUrl` text,
	`classification` enum('laudo','imagem','indefinido') DEFAULT 'indefinido',
	`classificationScore` int DEFAULT 0,
	`selectedForProcessing` int DEFAULT 0,
	`extractedText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`fileType` varchar(10) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`status` enum('uploaded','analyzing','analyzed','processing','done','error') NOT NULL DEFAULT 'uploaded',
	`totalPages` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `imaging_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`documentId` int,
	`patientName` varchar(255),
	`patientDob` varchar(20),
	`examDate` varchar(20),
	`examType` varchar(100),
	`requestingDoctor` varchar(255),
	`responsibleDoctor` varchar(255),
	`technique` text,
	`description` text,
	`conclusion` text,
	`observations` text,
	`rawJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `imaging_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `exam_sessions` ADD `documentId` int;