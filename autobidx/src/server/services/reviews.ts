import { prisma } from "@/lib/db";
import { AppError, conflict, notFound } from "@/lib/errors";
import type { Actor } from "../auth/rbac";
import { audit } from "../audit";
import { notifyDealer } from "../notifications/notify";
import { orderRoleFor } from "./orders";

/** Only completed transactions can be reviewed; one review per direction per order. */
export async function createReview(actor: Actor, input: { orderId: string; rating: number; comment?: string }) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new AppError("VALIDATION", "Rating must be 1–5 stars.");
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw notFound();
  const role = orderRoleFor(actor, order);
  if (role !== "buyer" && role !== "seller") throw notFound();
  if (order.status !== "COMPLETED") throw conflict("You can review only after the transaction is completed.");
  const direction = role === "buyer" ? "BUYER_TO_SELLER" : "SELLER_TO_BUYER";
  const subjectDealerId = role === "buyer" ? order.sellerDealerId : order.buyerDealerId;
  if (!subjectDealerId) throw conflict("This buyer can't be rated.");
  const exists = await prisma.review.findUnique({ where: { orderId_direction: { orderId: order.id, direction } } });
  if (exists) throw conflict("You've already reviewed this transaction.");
  return prisma.$transaction(async (tx) => {
    const r = await tx.review.create({ data: { orderId: order.id, authorId: actor.userId, subjectDealerId, direction, rating: input.rating, comment: input.comment?.slice(0, 1000) || null } });
    const agg = await tx.review.aggregate({ where: { subjectDealerId }, _avg: { rating: true }, _count: true });
    await tx.dealer.update({ where: { id: subjectDealerId }, data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count } });
    await audit({ userId: actor.userId, action: "review.create", entityType: "Review", entityId: r.id, after: { rating: input.rating } }, tx);
    await notifyDealer(subjectDealerId, { type: "REVIEW", title: `New ${input.rating}★ review`, body: input.comment?.slice(0, 120) || "You received a new rating.", link: "/dashboard/analytics" }, tx);
    return r;
  });
}
