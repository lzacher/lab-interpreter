/**
 * Storage helpers — Local filesystem storage for VPS deployment
 * Falls back to Manus S3 proxy when BUILT_IN_FORGE_API_URL is available.
 * 
 * Files are stored in /app/storage (Docker volume) and served via Express static.
 */

import * as fs from "fs";
import * as path from "path";
import { ENV } from './_core/env';

// ─── Configuration ───────────────────────────────────────────────────────────

const USE_LOCAL_STORAGE = !ENV.forgeApiUrl || !ENV.forgeApiKey;

// Local storage directory (mapped to Docker volume in production)
const STORAGE_DIR = process.env.STORAGE_LOCAL_PATH || process.env.LOCAL_STORAGE_PATH || path.resolve(process.cwd(), "storage-data");

// Base URL for serving files (set via env or auto-detect)
const BASE_URL = process.env.STORAGE_BASE_URL || "";

// ─── Local Storage Implementation ───────────────────────────────────────────

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getLocalFilePath(relKey: string): string {
  const normalized = relKey.replace(/^\/+/, "");
  const fullPath = path.join(STORAGE_DIR, normalized);
  ensureDir(path.dirname(fullPath));
  return fullPath;
}

function getPublicUrl(relKey: string): string {
  const normalized = relKey.replace(/^\/+/, "");
  return `/storage/${normalized}`;
}

async function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  const filePath = getLocalFilePath(key);
  
  if (typeof data === "string") {
    fs.writeFileSync(filePath, data, "utf-8");
  } else {
    fs.writeFileSync(filePath, data);
  }

  const url = getPublicUrl(key);
  return { key, url };
}

async function localGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  const url = getPublicUrl(key);
  return { key, url };
}

// ─── S3 Proxy Implementation (Manus WebDev) ─────────────────────────────────

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set("path", key);

  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, key.split("/").pop() ?? key);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: form,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function s3Get(relKey: string): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set("path", key);
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return { key, url: (await response.json()).url };
}

// ─── Exported API ────────────────────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (USE_LOCAL_STORAGE) {
    return localPut(relKey, data, contentType);
  }
  return s3Put(relKey, data, contentType);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  if (USE_LOCAL_STORAGE) {
    return localGet(relKey);
  }
  return s3Get(relKey);
}

/**
 * Resolve a storage URL (either relative like /storage/... or absolute https://...)
 * to a fetchable URL. For local storage, reads the file directly from disk.
 * For S3, the URL is already absolute and fetchable.
 */
export async function storageReadBuffer(fileUrl: string): Promise<Buffer> {
  // Local storage: /storage/path/to/file -> read from disk
  if (fileUrl.startsWith("/storage/")) {
    const relPath = fileUrl.replace(/^\/storage\//, "");
    const filePath = path.join(STORAGE_DIR, relPath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found in local storage: ${filePath}`);
    }
    return fs.readFileSync(filePath) as Buffer;
  }
  // Absolute URL (S3 or external): use fetch
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to fetch file: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Express Middleware for Serving Local Files ──────────────────────────────────

export function getStorageDir(): string {
  ensureDir(STORAGE_DIR);
  return STORAGE_DIR;
}

export function isLocalStorage(): boolean {
  return USE_LOCAL_STORAGE;
}

/**
 * Deleta um arquivo do storage (local ou S3).
 * Falha silenciosa — não lança erro se o arquivo não existir.
 */
export async function storageDelete(relKey: string): Promise<void> {
  const key = relKey.replace(/^\/+/, "");
  if (USE_LOCAL_STORAGE) {
    const filePath = path.join(STORAGE_DIR, key);
    try { fs.unlinkSync(filePath); } catch { /* ignora se não existir */ }
    return;
  }
  // S3: chamar endpoint de delete
  try {
    const { baseUrl, apiKey } = getStorageConfig();
    const deleteUrl = new URL("v1/storage/delete", ensureTrailingSlash(baseUrl));
    deleteUrl.searchParams.set("path", key);
    await fetch(deleteUrl, {
      method: "DELETE",
      headers: buildAuthHeaders(apiKey),
    });
  } catch { /* falha silenciosa */ }
}