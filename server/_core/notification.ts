import { TRPCError } from "@trpc/server";
import nodemailer from "nodemailer";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.ownerEmail) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification recipient not configured (OWNER_EMAIL).",
    });
  }

  if (!ENV.smtpUser || !ENV.smtpPass) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "SMTP credentials not configured.",
    });
  }

  const transporter = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: Number(ENV.smtpPort),
    secure: Number(ENV.smtpPort) === 465,
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Lab Interpreter" <${ENV.smtpUser}>`,
      to: ENV.ownerEmail,
      subject: title,
      text: content,
    });
    return true;
  } catch (error) {
    console.warn("[Notification] Failed to send email:", error);
    return false;
  }
}
