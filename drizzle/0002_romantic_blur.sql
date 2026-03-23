ALTER TABLE `exams` MODIFY COLUMN `name` text NOT NULL;--> statement-breakpoint
ALTER TABLE `exams` MODIFY COLUMN `referenceRange` text;--> statement-breakpoint
ALTER TABLE `exams` DROP COLUMN `interpretation`;