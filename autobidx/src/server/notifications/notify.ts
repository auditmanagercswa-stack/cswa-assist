import { prisma, type Db } from "@/lib/db";
import type { Channel } from "@prisma/client";
import { publish } from "../realtime/bus";
import { enqueue, registerJob } from "../jobs/queue";
import { getSetting } from "../settings";
import { providers } from "./channels";

export const NOTIFICATION_TYPES = [
  "REGISTRATION",
  "KYC_SUBMITTED",
  "KYC_APPROVED",
  "KYC_REJECTED",
  "DEALER_SUSPENDED",
  "VEHICLE_APPROVED",
  "VEHICLE_REJECTED",
  "NEW_BID",
  "OUTBID",
  "AUCTION_ENDING",
  "AUCTION_WON",
  "AUCTION_SOLD",
  "AUCTION_UNSOLD",
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED",
  "PAYMENT_FAILED",
  "REFUND",
  "ORDER_STATUS",
  "DOCUMENTS",
  "OFFER_RECEIVED",
  "OFFER_ACCEPTED",
  "OFFER_REJECTED",
  "COUNTER_OFFER",
  "DISPUTE",
  "REVIEW",
  "SYSTEM",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// High-signal events also go out over SMS/WhatsApp when those channels are enabled.
const URGENT: NotificationType[] = ["OUTBID", "AUCTION_WON", "AUCTION_ENDING", "PAYMENT_PENDING", "PAYMENT_RECEIVED", "KYC_APPROVED"];

export type NotifyInput = { type: NotificationType; title: string; body: string; link?: string };

/**
 * Creates in-app notifications (inside the caller's transaction when given) and queues delivery
 * over external channels. Realtime push to open browsers happens via the event bus.
 */
export async function notify(userIds: string | string[], input: NotifyInput, db: Db = prisma) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
  if (ids.length === 0) return;
  const channelsCfg = await getSetting("notifications.channels", db);
  const channels = (Object.keys(channelsCfg) as Channel[]).filter(
    (c) => channelsCfg[c] && c !== "IN_APP" && (c === "EMAIL" || c === "PUSH" || URGENT.includes(input.type)),
  );
  for (const userId of ids) {
    const n = await db.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        deliveries: { create: channels.map((channel) => ({ channel })) },
      },
    });
    await publish({ type: "user.notification", userId, data: { id: n.id, type: n.type, title: n.title, body: n.body, link: n.link } }, db);
    if (channels.length) await enqueue("notification.deliver", { notificationId: n.id }, {}, db);
  }
}

/** Notify every active member of a dealership. */
export async function notifyDealer(dealerId: string, input: NotifyInput, db: Db = prisma) {
  const members = await db.dealerUser.findMany({ where: { dealerId, active: true }, select: { userId: true } });
  await notify(
    members.map((m) => m.userId),
    input,
    db,
  );
}

export async function notifyAdmins(input: NotifyInput, db: Db = prisma) {
  const admins = await db.user.findMany({ where: { role: { key: { in: ["ADMIN", "SUPER_ADMIN"] } }, status: "ACTIVE" }, select: { id: true } });
  await notify(admins.map((a) => a.id), input, db);
}

registerJob("notification.deliver", async (payload) => {
  const n = await prisma.notification.findUnique({
    where: { id: String(payload.notificationId) },
    include: { user: true, deliveries: { where: { status: "QUEUED" } } },
  });
  if (!n) return;
  for (const d of n.deliveries) {
    if (d.channel === "IN_APP") continue;
    const provider = providers[d.channel];
    const res = await provider.send({ to: { email: n.user.email, phone: n.user.phone, name: n.user.name }, title: n.title, body: n.body, link: n.link });
    await prisma.notificationDelivery.update({
      where: { id: d.id },
      data: { status: res.status, attempts: { increment: 1 }, providerRef: res.providerRef, error: res.error, sentAt: res.status === "SENT" ? new Date() : null },
    });
  }
});
