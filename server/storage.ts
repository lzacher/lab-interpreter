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


export async function storageDelete(urlOrKey: string): Promise<void> {
  try {
    // Extrai o key da URL ou usa diretamente
    const key = urlOrKey.includes("/uploads/")
      ? urlOrKey.split("/uploads/")[1]
      : normalizeKey(urlOrKey);
    const filePath = path.join(UPLOADS_DIR, key);
    await fs.rm(filePath, { force: true });
    // Remove pasta pai se estiver vazia
    const dir = path.dirname(filePath);
    const files = await fs.readdir(dir).catch(() => ["_"]);
    if (files.length === 0) await fs.rmdir(dir).catch(() => {});
  } catch {
    // Ignora erros silenciosamente
  }
}
