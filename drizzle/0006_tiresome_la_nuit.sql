ALTER TABLE `document_pages` ADD `ocrStatus` enum('pending','processing','done','error') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `document_pages` ADD `sourceFileUrl` text;--> statement-breakpoint
ALTER TABLE `document_pages` ADD `sourceFileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `document_pages` ADD `sourceFileIndex` int DEFAULT 0;