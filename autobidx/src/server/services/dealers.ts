import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { encryptField } from "@/lib/crypto";
import type { z } from "zod";
import type { kycSchema } from "@/lib/validation";
import type { DealerRole, DealerStatus, KycDocType } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can, requireActor, requireDealerManager } from "../auth/rbac";
import { hashPassword } from "../auth/password";
import { audit } from "../audit";
import { notify, notifyAdmins, notifyDealer } from "../notifications/notify";
import { getSetting } from "../settings";
import { randomToken } from "@/lib/crypto";

export async function getMyKyc(actor: Actor) {
  if (!actor.dealer) throw forbidden("No dealership linked to this account.");
  const kyc = await prisma.kycSubmission.findFirst({
    where: { dealerId: actor.dealer.id },
    orderBy: { createdAt: "desc" },
    include: { documents: { include: { file: { select: { id: true, mime: true, originalName: true, size: true } } } } },
  });
  const dealer = await prisma.dealer.findUniqueOrThrow({ where: { id: actor.dealer.id } });
  const required = await getSetting("dealer.requiredKycDocs");
  return { kyc, dealer, required };
}

/** Saves KYC details & documents; with `submit` moves the dealership to UNDER_REVIEW. */
export async function saveKyc(actorIn: Actor | null, input: z.infer<typeof kycSchema>, ip?: string | null) {
  const actor = requireDealerManager(actorIn);
  const dealer = await prisma.dealer.findUniqueOrThrow({ where: { id: actor.dealer.id } });
  if (dealer.status === "VERIFIED" && input.submit) throw conflict("Your dealership is already verified. Contact support to update KYC.");
  if (dealer.status === "BLOCKED" || dealer.status === "SUSPENDED") throw forbidden("Your dealership is suspended.");
  const fileIds = input.documents.map((d) => d.fileId);
  const files = await prisma.storedFile.findMany({ where: { id: { in: fileIds } } });
  for (const d of input.documents) {
    const f = files.find((x) => x.id === d.fileId);
    if (!f || f.visibility !== "PRIVATE") throw new AppError("VALIDATION", "Upload KYC documents again.");
    if (f.ownerId !== actor.userId) {
      const colleague = f.ownerId ? await prisma.dealerUser.findFirst({ where: { userId: f.ownerId, dealerId: dealer.id } }) : null;
      if (!colleague) throw forbidden();
    }
  }
  if (input.submit) {
    const required = (await getSetting("dealer.requiredKycDocs")) as KycDocType[];
    const have = new Set(input.documents.map((d) => d.type));
    const missing = required.filter((r) => !have.has(r) && !(r === "GST_CERTIFICATE" && !dealer.gstin));
    if (missing.length) throw new AppError("VALIDATION", `Please upload: ${missing.map((m) => m.replace(/_/g, " ").toLowerCase()).join(", ")}.`, { missing });
  }
  const existing = await prisma.kycSubmission.findFirst({ where: { dealerId: dealer.id }, orderBy: { createdAt: "desc" } });
  const data = {
    pan: dealer.pan,
    gstin: dealer.gstin,
    bankAccountName: input.bankAccountName,
    bankAccountEnc: encryptField(input.bankAccountNumber),
    bankAccountLast4: input.bankAccountNumber.slice(-4),
    bankIfsc: input.bankIfsc,
    bankName: input.bankName,
    authorizedName: input.authorizedName,
    authorizedDesignation: input.authorizedDesignation,
    authorizedPan: input.authorizedPan,
    authorizedPhone: input.authorizedPhone,
    status: input.submit ? ("SUBMITTED" as const) : (existing?.status ?? "NOT_SUBMITTED"),
    submittedAt: input.submit ? new Date() : existing?.submittedAt,
  };
  await prisma.$transaction(async (tx) => {
    const kyc = existing
      ? await tx.kycSubmission.update({ where: { id: existing.id }, data })
      : await tx.kycSubmission.create({ data: { ...data, dealerId: dealer.id } });
    await tx.kycDocument.deleteMany({ where: { kycId: kyc.id } });
    for (const d of input.documents) await tx.kycDocument.create({ data: { kycId: kyc.id, type: d.type, fileId: d.fileId } });
    if (input.submit) await tx.dealer.update({ where: { id: dealer.id }, data: { status: "UNDER_REVIEW", statusReason: null } });
    await audit({ userId: actor.userId, action: input.submit ? "kyc.submit" : "kyc.save", entityType: "Dealer", entityId: dealer.id, after: { documents: input.documents.map((d) => d.type), bankLast4: data.bankAccountLast4 }, ip }, tx);
    if (input.submit) {
      await notify(actor.userId, { type: "KYC_SUBMITTED", title: "KYC submitted", body: "Our team will review your documents shortly.", link: "/dashboard/kyc" }, tx);
      await notifyAdmins({ type: "SYSTEM", title: "New KYC to review", body: `${dealer.name} submitted KYC documents.`, link: `/admin/dealers/${dealer.id}` }, tx);
    }
  });
}

export async function adminReviewKyc(actor: Actor, dealerId: string, decision: "APPROVE" | "REJECT" | "UNDER_REVIEW", notes: string, ip?: string | null) {
  if (!can(actor, "dealers.manage")) throw forbidden();
  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) throw notFound();
  const kyc = await prisma.kycSubmission.findFirst({ where: { dealerId }, orderBy: { createdAt: "desc" } });
  if (!kyc) throw conflict("No KYC submission found for this dealer.");
  if (decision === "REJECT" && !notes.trim()) throw new AppError("VALIDATION", "Add a reason so the dealer knows what to fix.");
  const dealerStatus: DealerStatus = decision === "APPROVE" ? "VERIFIED" : decision === "REJECT" ? "REJECTED" : "UNDER_REVIEW";
  await prisma.$transaction(async (tx) => {
    await tx.kycSubmission.update({
      where: { id: kyc.id },
      data: { status: decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "UNDER_REVIEW", reviewerId: actor.userId, reviewNotes: notes || null, reviewedAt: new Date() },
    });
    if (decision === "APPROVE") await tx.kycDocument.updateMany({ where: { kycId: kyc.id }, data: { verified: true } });
    await tx.dealer.update({ where: { id: dealerId }, data: { status: dealerStatus, statusReason: notes || null, verifiedAt: decision === "APPROVE" ? new Date() : dealer.verifiedAt } });
    await audit({ userId: actor.userId, action: `kyc.${decision.toLowerCase()}`, entityType: "Dealer", entityId: dealerId, before: { status: dealer.status }, after: { status: dealerStatus, notes }, ip }, tx);
    if (decision !== "UNDER_REVIEW")
      await notifyDealer(dealerId, {
        type: decision === "APPROVE" ? "KYC_APPROVED" : "KYC_REJECTED",
        title: decision === "APPROVE" ? "Your dealership is verified 🎉" : "KYC needs attention",
        body: decision === "APPROVE" ? "You can now list vehicles, bid in auctions and buy on Alpha Cars." : `Reason: ${notes}`,
        link: decision === "APPROVE" ? "/dashboard" : "/dashboard/kyc",
      }, tx);
  });
}

export async function adminSetDealerStatus(actor: Actor, dealerId: string, status: "SUSPENDED" | "BLOCKED" | "VERIFIED", reason: string, ip?: string | null) {
  if (!can(actor, "dealers.manage")) throw forbidden();
  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) throw notFound();
  if (!reason.trim()) throw new AppError("VALIDATION", "A reason is required.");
  if (status === "VERIFIED" && !["SUSPENDED", "BLOCKED"].includes(dealer.status)) throw conflict("Only suspended or blocked dealers can be reinstated here — use KYC review to verify.");
  await prisma.$transaction(async (tx) => {
    await tx.dealer.update({ where: { id: dealerId }, data: { status, statusReason: reason } });
    if (status === "BLOCKED") {
      const members = await tx.dealerUser.findMany({ where: { dealerId }, select: { userId: true } });
      await tx.session.updateMany({ where: { userId: { in: members.map((m) => m.userId) }, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit({ userId: actor.userId, action: `dealer.${status.toLowerCase()}`, entityType: "Dealer", entityId: dealerId, before: { status: dealer.status }, after: { status, reason }, ip }, tx);
    await notifyDealer(dealerId, { type: "DEALER_SUSPENDED", title: status === "VERIFIED" ? "Dealership reinstated" : `Dealership ${status.toLowerCase()}`, body: reason, link: "/dashboard" }, tx);
  });
}

export async function updateDealerProfile(actorIn: Actor | null, input: { description?: string | null; addressLine?: string; pincode?: string }) {
  const actor = requireDealerManager(actorIn);
  const before = await prisma.dealer.findUniqueOrThrow({ where: { id: actor.dealer.id } });
  const after = await prisma.dealer.update({
    where: { id: actor.dealer.id },
    data: { description: input.description?.slice(0, 1000) ?? before.description, addressLine: input.addressLine ?? before.addressLine, pincode: input.pincode ?? before.pincode },
  });
  await audit({ userId: actor.userId, action: "dealer.profile_update", entityType: "Dealer", entityId: after.id, before: { description: before.description, addressLine: before.addressLine }, after: { description: after.description, addressLine: after.addressLine } });
  return after;
}

// ───────────────────────── Team ─────────────────────────

export async function listTeam(actorIn: Actor | null) {
  const actor = requireActor(actorIn);
  if (!actor.dealer) throw forbidden();
  return prisma.dealerUser.findMany({
    where: { dealerId: actor.dealer.id },
    include: { user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function addTeamMember(actorIn: Actor | null, input: { name: string; email: string; phone: string; role: DealerRole; canBid: boolean; canList: boolean }) {
  const actor = requireDealerManager(actorIn);
  if (input.role === "OWNER" && actor.dealer.role !== "OWNER") throw forbidden("Only the owner can add another owner.");
  const max = await getSetting("dealer.maxTeamMembers");
  const count = await prisma.dealerUser.count({ where: { dealerId: actor.dealer.id, active: true } });
  if (count >= max) throw conflict(`Your dealership can have up to ${max} team members.`);
  const clash = await prisma.user.findFirst({ where: { OR: [{ email: input.email }, { phone: input.phone }] } });
  if (clash) throw new AppError("CONFLICT", "A user with this email or mobile already exists.");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "DEALER" } });
  const tempPassword = `Abx${randomToken(6)}9`;
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name: input.name, email: input.email, phone: input.phone, passwordHash: await hashPassword(tempPassword), roleId: role.id } });
    await tx.dealerUser.create({ data: { dealerId: actor.dealer.id, userId: u.id, role: input.role, canBid: input.canBid, canList: input.canList } });
    await audit({ userId: actor.userId, action: "dealer.team_add", entityType: "Dealer", entityId: actor.dealer.id, after: { member: u.email, role: input.role } }, tx);
    await notify(u.id, { type: "REGISTRATION", title: `You've been added to ${actor.dealer.name}`, body: "Use 'Forgot password' to set your password and sign in.", link: "/forgot-password" }, tx);
    return u;
  });
  return { user, tempPassword: process.env.APP_MODE === "production" ? null : tempPassword };
}

export async function updateTeamMember(actorIn: Actor | null, memberId: string, input: { role?: DealerRole; canBid?: boolean; canList?: boolean; active?: boolean }) {
  const actor = requireDealerManager(actorIn);
  const m = await prisma.dealerUser.findUnique({ where: { id: memberId } });
  if (!m || m.dealerId !== actor.dealer.id) throw notFound();
  if (m.userId === actor.userId) throw conflict("You can't change your own access.");
  if (m.role === "OWNER" && actor.dealer.role !== "OWNER") throw forbidden();
  const updated = await prisma.dealerUser.update({ where: { id: memberId }, data: input });
  if (input.active === false) await prisma.session.updateMany({ where: { userId: m.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ userId: actor.userId, action: "dealer.team_update", entityType: "DealerUser", entityId: memberId, before: m, after: updated });
  return updated;
}

// ───────────────────────── Public profile ─────────────────────────

export async function getDealerPublic(slug: string) {
  const d = await prisma.dealer.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      description: true,
      ratingAvg: true,
      ratingCount: true,
      soldCount: true,
      createdAt: true,
      verifiedAt: true,
      gstin: true,
      state: { select: { name: true } },
      district: { select: { name: true } },
      city: { select: { name: true } },
      reviewsReceived: { where: { direction: "BUYER_TO_SELLER" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, rating: true, comment: true, createdAt: true, author: { select: { name: true } } } },
    },
  });
  if (!d || d.status === "BLOCKED") return null;
  // Never expose GSTIN/PAN/bank publicly — only whether GST is registered.
  const { gstin, ...rest } = d;
  return {
    ...rest,
    gstRegistered: !!gstin,
    reviewsReceived: d.reviewsReceived.map((r) => ({ ...r, author: { name: r.author.name.split(" ")[0] + " " + (r.author.name.split(" ")[1]?.[0] ?? "") + "." } })),
  };
}
