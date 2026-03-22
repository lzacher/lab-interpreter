CREATE TABLE `exam_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`patientName` varchar(255),
	`patientDob` varchar(20),
	`patientSex` varchar(30),
	`collectionDate` varchar(20),
	`emissionDate` varchar(20),
	`requestingDoctor` varchar(255),
	`responsibleDoctor` varchar(255),
	`laboratory` varchar(255),
	`attendanceNumber` varchar(100),
	`material` text,
	`method` text,
	`observations` text,
	`rawJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`result` varchar(100),
	`unit` varchar(50),
	`referenceRange` varchar(255),
	`status` varchar(30),
	`interpretation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);
