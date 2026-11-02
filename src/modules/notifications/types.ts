// src/modules/notifications/types.ts

export interface SendEmailOptions {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface IEmailTransport {
  sendMail(options: SendEmailOptions): Promise<SendEmailResult>;
}

export interface ReminderNotificationPayload {
  reminderId: string;
  recipientEmail: string;
  problemTitle: string;
  problemLink: string;
  topic: string;
  difficulty: string;
  consecutiveIndependent: number;
  publicUrlBase: string;
  adminEmail: string;
}

