import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";
import * as fs from "fs";
import * as path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function isR2Configured(): boolean {
  return !!(ENV.cfAccountId && ENV.r2AccessKeyId && ENV.r2SecretAccessKey);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function localUrl(key: string): string {
  return `${ENV.appUrl}/uploads/${key}`;
}

// ── Local filesystem storage ────────────────────────────────────────────────

async function localPut(
  key: string,
  data: Buffer | Uint8Array | string
): Promise<{ key: string; url: string }> {
  const filePath = path.join(UPLOADS_DIR, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  fs.writeFileSync(filePath, body);
  return { key, url: localUrl(key) };
}

async function localGet(key: string): Promise<{ key: string; url: string }> {
  return { key, url: localUrl(key) };
}

// ── Cloudflare R2 storage ───────────────────────────────────────────────────

function getS3Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${ENV.cfAccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
  });
}

async function r2Put(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const body = typeof data === "string" ? Buffer.from(data) : data;
  await client.send(
    new PutObjectCommand({
      Bucket: ENV.r2BucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: ENV.r2BucketName, Key: key }),
    { expiresIn: 3600 }
  );
  return { key, url };
}

async function r2Get(key: string): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: ENV.r2BucketName, Key: key }),
    { expiresIn: 3600 }
  );
  return { key, url };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return isR2Configured() ? r2Put(key, data, contentType) : localPut(key, data);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return isR2Configured() ? r2Get(key) : localGet(key);
}
