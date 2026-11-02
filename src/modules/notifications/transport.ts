// src/modules/notifications/transport.ts
import nodemailer from 'nodemailer';
import type { IEmailTransport, SendEmailOptions, SendEmailResult } from './types.ts';

export class NodemailerTransport implements IEmailTransport {
  private transporter: nodemailer.Transporter;

  constructor(user: string, pass: string) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  async sendMail(options: SendEmailOptions): Promise<SendEmailResult> {
    const info = await this.transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return {
      messageId: info.messageId || 'unknown-id',
      accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
      rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : [],
    };
  }
}

export class MockEmailTransport implements IEmailTransport {
  public sentMessages: SendEmailOptions[] = [];
  public shouldFail = false;
  public failureMessage = 'Simulated SMTP connection timeout';

  async sendMail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    this.sentMessages.push(options);
    return {
      messageId: `mock-msg-${Date.now()}-${this.sentMessages.length}`,
      accepted: [options.to],
      rejected: [],
    };
  }
}

