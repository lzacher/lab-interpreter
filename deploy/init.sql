-- ─── Lab Interpreter — Inicialização do Banco de Dados ──────────────────────
-- Este script é executado automaticamente pelo MySQL na primeira inicialização
-- do contêiner, apenas se o volume do banco estiver vazio.
--
-- Inclui o schema completo com todas as tabelas necessárias para a aplicação.

-- Garantir que o banco existe e configurar charset
CREATE DATABASE IF NOT EXISTS lab_interpreter
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lab_interpreter;

-- Garantir permissões do usuário da aplicação
GRANT ALL PRIVILEGES ON lab_interpreter.* TO 'labuser'@'%';
FLUSH PRIVILEGES;

-- ─── Tabela de Usuários ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `openId` varchar(64) NOT NULL,
  `name` text,
  `email` varchar(320),
  `loginMethod` varchar(64),
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT (now()),
  `passwordHash` text,
  CONSTRAINT `users_id` PRIMARY KEY(`id`),
  CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);

-- ─── Documentos (Pipeline Upload → OCR → JSON) ───────────────────────────────
CREATE TABLE IF NOT EXISTS `documents` (
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

-- ─── Páginas de Documentos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `document_pages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `documentId` int NOT NULL,
  `pageNumber` int NOT NULL,
  `thumbnailKey` varchar(512),
  `thumbnailUrl` text,
  `classification` enum('laudo','imagem','indefinido') DEFAULT 'indefinido',
  `classificationScore` int DEFAULT 0,
  `selectedForProcessing` int DEFAULT 0,
  `ocrStatus` enum('pending','processing','done','error') DEFAULT 'pending',
  `extractedText` text,
  `sourceFileUrl` text,
  `sourceFileKey` varchar(512),
  `sourceFileIndex` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `document_pages_id` PRIMARY KEY(`id`)
);

-- ─── Sessões de Exames Laboratoriais ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `exam_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `documentId` int,
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
  `clinicalSummary` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `exam_sessions_id` PRIMARY KEY(`id`)
);

-- ─── Exames Individuais ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `exams` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` int NOT NULL,
  `name` text NOT NULL,
  `result` text,
  `unit` text,
  `referenceRange` text,
  `status` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);

-- ─── Laudos de Exames de Imagem ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `imaging_reports` (
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

-- ─── Feedback RAG ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rag_feedback` (
  `id` int AUTO_INCREMENT NOT NULL,
  `chunk_id` int NOT NULL,
  `session_id` int NOT NULL,
  `user_id` int NOT NULL,
  `vote` enum('up','down') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `rag_feedback_id` PRIMARY KEY(`id`)
);
