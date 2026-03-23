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

/** Uma sessão de exame corresponde a um arquivo JSON carregado pelo usuário */
export const examSessions = mysqlTable("exam_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
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

/** Cada exame individual dentro de uma sessão */
export const exams = mysqlTable("exams", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  name: text("name").notNull(),
  result: varchar("result", { length: 100 }),
  unit: varchar("unit", { length: 50 }),
  referenceRange: text("referenceRange"),
  status: varchar("status", { length: 30 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Exam = typeof exams.$inferSelect;
export type InsertExam = typeof exams.$inferInsert;
