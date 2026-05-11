export const ENV = {
  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Session
  cookieSecret: process.env.JWT_SECRET ?? "",
  // Runtime
  isProduction: process.env.NODE_ENV === "production",
  // Public URL (used for local file storage URLs)
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  // LLM (Google Gemini via OpenAI-compatible endpoint)
  llmApiUrl: process.env.LLM_API_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  // Cloudflare R2 Storage
  cfAccountId: process.env.CF_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "lab-interpreter-docs",
  // Google OAuth (Auth.js)
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // SMTP / Nodemailer
  smtpHost: process.env.SMTP_HOST ?? "smtp.gmail.com",
  smtpPort: process.env.SMTP_PORT ?? "587",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  ownerEmail: process.env.OWNER_EMAIL ?? "",
};
