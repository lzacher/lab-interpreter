import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Document Pipeline (Upload → OCR → JSON) ──────────────────────────────────

/** Documento enviado pelo usuário (PDF, JPG, JPEG) */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 10 }).notNull(), // pdf, jpg, jpeg
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  status: mysqlEnum("status", [
    "uploaded",
    "analyzing",
    "analyzed",
    "processing",
    "done",
    "error",
  ])
    .default("uploaded")
    .notNull(),
  totalPages: int("totalPages").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/** Página individual de um documento com thumbnail e classificação */
export const documentPages = mysqlTable("document_pages", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  pageNumber: int("pageNumber").notNull(),
  thumbnailKey: varchar("thumbnailKey", { length: 512 }),
  thumbnailUrl: text("thumbnailUrl"),
  /** laudo = texto de relatório médico; imagem = imagem diagnóstica sem texto predominante */
  classification: mysqlEnum("classification", ["laudo", "imagem", "indefinido"]).default(
    "indefinido"
  ),
  classificationScore: int("classificationScore").default(0),
  selectedForProcessing: int("selectedForProcessing").default(0), // 0 or 1
  extractedText: text("extractedText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentPage = typeof documentPages.$inferSelect;
export type InsertDocumentPage = typeof documentPages.$inferInsert;

// ─── Lab Results ──────────────────────────────────────────────────────────────

/** Sessão de exames de laboratório (pode vir de upload JSON direto ou de OCR) */
export const examSessions = mysqlTable("exam_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Referência ao documento de origem (quando veio de OCR) */
  documentId: int("documentId"),
  patientName: varchar("patientName", { length: 255 }),
  patientDob: varchar("patientDob", { length: 20 }),
  patientSex: varchar("patientSex", { length: 30 }),
  collectionDate: varchar("collectionDate", { length: 20 }),
  emissionDate: varchar("emissionDate", { length: 20 }),
  requestingDoctor: varchar("requestingDoctor", { length: 255 }),
  responsibleDoctor: varchar("responsibleDoctor", { length: 255 }),
  laboratory: varchar("laboratory", { length: 255 }),
  attendanceNumber: varchar("attendanceNumber", { length: 100 }),
  material: text("material"),
  method: text("method"),
  observations: text("observations"),
  rawJson: json("rawJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExamSession = typeof examSessions.$inferSelect;
export type InsertExamSession = typeof examSessions.$inferInsert;

/** Exame individual dentro de uma sessão de laboratório */
export const exams = mysqlTable("exams", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  name: text("name").notNull(),
  result: varchar("result", { length: 100 }),
  unit: varchar("unit", { length: 50 }),
  referenceRange: text("referenceRange"),
  status: text("status"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Exam = typeof exams.$inferSelect;
export type InsertExam = typeof exams.$inferInsert;

// ─── Imaging Reports ──────────────────────────────────────────────────────────

/** Laudo de exame de imagem (eco, ultrassom, TC, RM) */
export const imagingReports = mysqlTable("imaging_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Referência ao documento de origem (OCR) */
  documentId: int("documentId"),
  patientName: varchar("patientName", { length: 255 }),
  patientDob: varchar("patientDob", { length: 20 }),
  examDate: varchar("examDate", { length: 20 }),
  /** Tipo: eco, ultrassom, tomografia, ressonancia */
  examType: varchar("examType", { length: 100 }),
  requestingDoctor: varchar("requestingDoctor", { length: 255 }),
  responsibleDoctor: varchar("responsibleDoctor", { length: 255 }),
  technique: text("technique"),
  description: text("description"),
  conclusion: text("conclusion"),
  observations: text("observations"),
  rawJson: json("rawJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImagingReport = typeof imagingReports.$inferSelect;
export type InsertImagingReport = typeof imagingReports.$inferInsert;
