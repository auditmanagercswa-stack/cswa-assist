import type { Channel } from "@prisma/client";

export type OutboundMessage = {
  to: { email: string; phone: string; name: string };
  title: string;
  body: string;
  link?: string | null;
};

export type SendResult = { status: "SENT" | "SKIPPED" | "FAILED"; providerRef?: string; error?: string };

export interface ChannelProvider {
  channel: Channel;
  /** Whether credentials are configured. Unconfigured providers report SKIPPED (integration pending). */
  configured(): boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
}

/** Development email provider: writes to server log. Replace with SMTP/SES/SendGrid adapter. */
const emailProvider: ChannelProvider = {
  channel: "EMAIL",
  configured: () => true,
  async send(msg) {
    if (process.env.SMTP_URL) {
      // Integration point: plug an SMTP transport (e.g. nodemailer) here.
      return { status: "SKIPPED", error: "SMTP adapter not installed" };
    }
    if (process.env.NODE_ENV !== "test") console.info(`[email] → ${msg.to.email}: ${msg.title}`);
    return { status: "SENT", providerRef: `console-${Date.now()}` };
  },
};

function pendingProvider(channel: Channel, envKey: string): ChannelProvider {
  return {
    channel,
    configured: () => !!process.env[envKey],
    async send() {
      if (!process.env[envKey]) return { status: "SKIPPED", error: `${channel} provider not configured (${envKey})` };
      // Integration point: MSG91 / Twilio / Gupshup / WhatsApp Cloud API / Web Push.
      return { status: "SKIPPED", error: `${channel} adapter pending integration` };
    },
  };
}

export const providers: Record<Exclude<Channel, "IN_APP">, ChannelProvider> = {
  EMAIL: emailProvider,
  SMS: pendingProvider("SMS", "SMS_PROVIDER_KEY"),
  WHATSAPP: pendingProvider("WHATSAPP", "WHATSAPP_PROVIDER_KEY"),
  PUSH: pendingProvider("PUSH", "PUSH_VAPID_PRIVATE_KEY"),
};
