import { ENV } from "./_core/env";
import * as fs from "fs";
import * as path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function localUrl(key: string): string {
  return `${ENV.appUrl}/uploads/${key}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(UPLOADS_DIR, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  fs.writeFileSync(filePath, body);
  return { key, url: localUrl(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: localUrl(key) };
}

