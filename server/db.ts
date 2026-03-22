import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, examSessions, exams, InsertExamSession, InsertExam } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Exam Sessions ────────────────────────────────────────────────────────────

export async function createExamSession(data: InsertExamSession): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(examSessions).values(data);
  return (result[0] as any).insertId as number;
}

export async function createExams(data: InsertExam[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  await db.insert(exams).values(data);
}

export async function getSessionsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(examSessions)
    .where(eq(examSessions.userId, userId))
    .orderBy(desc(examSessions.createdAt));
}

export async function getSessionById(sessionId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(examSessions).where(eq(examSessions.id, sessionId)).limit(1);
  return rows[0] ?? null;
}

export async function getExamsBySessionId(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(exams).where(eq(exams.sessionId, sessionId));
}

export async function deleteSession(sessionId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(exams).where(eq(exams.sessionId, sessionId));
  await db.delete(examSessions).where(eq(examSessions.id, sessionId));
  return true;
}

export async function updateExamInterpretation(examId: number, interpretation: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(exams).set({ interpretation }).where(eq(exams.id, examId));
}
