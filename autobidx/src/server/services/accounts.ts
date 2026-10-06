import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { randomOtp, randomToken, sha256 } from "@/lib/crypto";
import { slugify } from "@/lib/slug";
import { shortCode } from "@/lib/ids";
import { env } from "@/lib/env";
import type { z } from "zod";
import type { registerDealerSchema, registerIndividualSchema } from "@/lib/validation";
import type { TokenPurpose } from "@prisma/client";
import { hashPassword, verifyPassword } from "../auth/password";
import { audit } from "../audit";
import { notify, notifyAdmins } from "../notifications/notify";
import { providers } from "../notifications/channels";
import { getSetting } from "../settings";
import { registrationChecks } from "./fraud";

type Meta = { ip: string | null; userAgent: string | null };

export function fingerprint(meta: { userAgent: string | null; acceptLanguage?: string | null }) {
  return meta.userAgent ? sha256(`${meta.userAgent}|${meta.acceptLanguage ?? ""}`).slice(0, 32) : null;
}

async function ensureUnique(email: string, phone: string) {
  const clash = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] }, select: { email: true } });
  if (clash) {
    throw new AppError("CONFLICT", clash.email === email ? "An account with this email already exists." : "An account with this mobile number already exists.", {
      fields: clash.email === email ? { email: "Already registered" } : { phone: "Already registered" },
    });
  }
}

/** Steps 1 + 2 of dealer registration: account, dealership (PENDING), FREE plan, OTPs. */
export async function registerDealer(input: z.infer<typeof registerDealerSchema>, meta: Meta & { acceptLanguage?: string | null }) {
  await ensureUnique(input.email, input.phone);
  if (input.gstin) {
    const g = await prisma.dealer.findUnique({ where: { gstin: input.gstin } });
    if (g) throw new AppError("CONFLICT", "A dealership with this GSTIN is already registered.", { fields: { gstin: "Already registered" } });
  } else if (await getSetting("dealer.requireGstin")) {
    throw new AppError("VALIDATION", "GSTIN is required for dealer registration.", { fields: { gstin: "Required" } });
  }
  const district = await prisma.district.findUnique({ where: { id: input.districtId } });
  if (!district || district.stateId !== input.stateId) throw new AppError("VALIDATION", "Select a valid district.", { fields: { districtId: "Invalid" } });

  const role = await prisma.role.findUniqueOrThrow({ where: { key: "DEALER" } });
  const freePlan = await prisma.subscriptionPlan.findUnique({ where: { code: "FREE" } });
  const fp = fingerprint(meta);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, phone: input.phone, passwordHash: await hashPassword(input.password), roleId: role.id, signupIp: meta.ip, signupFingerprint: fp },
    });
    const dealer = await tx.dealer.create({
      data: {
        slug: `${slugify(input.dealershipName)}-${shortCode(4)}`,
        name: input.dealershipName,
        businessType: input.businessType,
        gstin: input.gstin || null,
        pan: input.pan,
        addressLine: input.addressLine,
        stateId: input.stateId,
        districtId: input.districtId,
        cityId: input.cityId || null,
        pincode: input.pincode,
        status: "PENDING",
        members: { create: { userId: user.id, role: "OWNER" } },
        kyc: { create: { pan: input.pan, gstin: input.gstin || null, status: "NOT_SUBMITTED" } },
        subscriptions: freePlan ? { create: { planId: freePlan.id, status: "ACTIVE" } } : undefined,
      },
    });
    await audit({ userId: user.id, action: "auth.register", entityType: "Dealer", entityId: dealer.id, after: { email: user.email, dealer: dealer.name }, ip: meta.ip, userAgent: meta.userAgent }, tx);
    await notify(user.id, { type: "REGISTRATION", title: "Welcome to Alpha Cars", body: "Complete KYC to start buying and selling. Verification usually takes 1 business day.", link: "/dashboard/kyc" }, tx);
    return { user, dealer };
  });
  await issueOtp(result.user.id, "EMAIL_VERIFY").catch(() => {});
  await issueOtp(result.user.id, "PHONE_VERIFY").catch(() => {});
  await registrationChecks({ userId: result.user.id, dealerId: result.dealer.id, pan: input.pan, gstin: input.gstin || null, phone: input.phone, ip: meta.ip, fingerprint: fp }).catch(() => {});
  return result;
}

export async function registerIndividual(input: z.infer<typeof registerIndividualSchema>, meta: Meta) {
  if (!(await getSetting("features.individualBuyers"))) throw forbidden("Individual buyer registration is not open yet. Please register as a dealer.");
  await ensureUnique(input.email, input.phone);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "INDIVIDUAL_BUYER" } });
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, phone: input.phone, passwordHash: await hashPassword(input.password), roleId: role.id, signupIp: meta.ip, signupFingerprint: fingerprint(meta) },
  });
  await audit({ userId: user.id, action: "auth.register", entityType: "User", entityId: user.id, ip: meta.ip });
  await issueOtp(user.id, "EMAIL_VERIFY").catch(() => {});
  return { user };
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function authenticate(identifier: string, password: string, meta: Meta) {
  const id = identifier.trim().toLowerCase();
  const phone = id.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  const user = await prisma.user.findFirst({ where: { OR: [{ email: id }, { phone }] } });
  const generic = new AppError("UNAUTHENTICATED", "Incorrect email/mobile or password.");
  if (!user) {
    await verifyPassword(password, "$2b$10$CwTycUXWue0Thq9StjUM0uJ8DlXv9P6K9QzqK1m0f8w0Yq1o7r0eS").catch(() => false); // timing equalisation
    await audit({ action: "auth.login_failed", after: { identifier: id.slice(0, 3) + "***" }, ip: meta.ip, userAgent: meta.userAgent });
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("RATE_LIMITED", `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes or reset your password.`);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
    await audit({ userId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id, ip: meta.ip, userAgent: meta.userAgent });
    throw generic;
  }
  if (user.status === "BLOCKED") throw forbidden("This account has been blocked. Contact support.");
  if (user.status === "SUSPENDED") throw forbidden("This account is suspended. Contact support.");
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: meta.ip } });
  await audit({ userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip: meta.ip, userAgent: meta.userAgent });
  return user;
}

// ───────────────────────── OTP / tokens ─────────────────────────

export async function issueOtp(userId: string, purpose: Extract<TokenPurpose, "EMAIL_VERIFY" | "PHONE_VERIFY">) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const recent = await prisma.verificationToken.count({ where: { userId, purpose, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent > 0) throw new AppError("RATE_LIMITED", "Please wait a minute before requesting another code.");
  const otp = randomOtp(6);
  await prisma.verificationToken.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
  await prisma.verificationToken.create({ data: { userId, purpose, tokenHash: sha256(`${userId}:${otp}`), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const channel = purpose === "EMAIL_VERIFY" ? providers.EMAIL : providers.SMS;
  await channel.send({ to: { email: user.email, phone: user.phone, name: user.name }, title: "Your Alpha Cars verification code", body: `Your code is ${otp}. It expires in 10 minutes.` });
  if (!env.isProduction && process.env.NODE_ENV !== "test") console.info(`[otp:${purpose}] ${user.email} → ${otp}`);
  // In non-production modes the OTP is returned so demos work without an SMS/email provider.
  return { devCode: env.isProduction ? null : otp };
}

export async function verifyOtp(userId: string, purpose: Extract<TokenPurpose, "EMAIL_VERIFY" | "PHONE_VERIFY">, code: string) {
  const token = await prisma.verificationToken.findFirst({ where: { userId, purpose, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!token || token.expiresAt < new Date()) throw new AppError("VALIDATION", "This code has expired. Request a new one.");
  if (token.attempts >= 5) throw new AppError("RATE_LIMITED", "Too many attempts. Request a new code.");
  if (token.tokenHash !== sha256(`${userId}:${code.trim()}`)) {
    await prisma.verificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    throw new AppError("VALIDATION", "Incorrect code. Please try again.");
  }
  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: purpose === "EMAIL_VERIFY" ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() } }),
  ]);
  await audit({ userId, action: purpose === "EMAIL_VERIFY" ? "auth.email_verified" : "auth.phone_verified", entityType: "User", entityId: userId });
}

export async function requestPasswordReset(email: string, meta: Meta) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Always respond identically to avoid account enumeration.
  if (!user) return { devLink: null };
  const token = randomToken(32);
  await prisma.verificationToken.create({ data: { userId: user.id, purpose: "PASSWORD_RESET", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  const link = `${env.appUrl}/reset-password?token=${token}`;
  await providers.EMAIL.send({ to: { email: user.email, phone: user.phone, name: user.name }, title: "Reset your Alpha Cars password", body: `Use this link within 30 minutes: ${link}`, link });
  await audit({ userId: user.id, action: "auth.password_reset_requested", entityType: "User", entityId: user.id, ip: meta.ip });
  return { devLink: env.isProduction ? null : link };
}

export async function resetPassword(token: string, password: string, meta: Meta) {
  const t = await prisma.verificationToken.findFirst({ where: { tokenHash: sha256(token), purpose: "PASSWORD_RESET", consumedAt: null } });
  if (!t || t.expiresAt < new Date()) throw new AppError("VALIDATION", "This reset link is invalid or has expired.");
  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: t.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null } }),
    // Sign out everywhere.
    prisma.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ userId: t.userId, action: "auth.password_reset", entityType: "User", entityId: t.userId, ip: meta.ip });
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new AppError("VALIDATION", "Current password is incorrect.", { fields: { current: "Incorrect" } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } }),
    prisma.session.updateMany({ where: { userId, revokedAt: null, id: { not: keepSessionId } }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ userId, action: "auth.password_changed", entityType: "User", entityId: userId });
}

export async function adminSetUserStatus(actorId: string, userId: string, status: "ACTIVE" | "SUSPENDED" | "BLOCKED", reason: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user) throw notFound();
  if (user.role.key === "SUPER_ADMIN") throw forbidden("Super admin accounts can't be suspended here.");
  if (user.id === actorId) throw conflict("You can't change your own status.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status !== "ACTIVE") await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ userId: actorId, action: `user.${status.toLowerCase()}`, entityType: "User", entityId: userId, before: { status: user.status }, after: { status, reason } }, tx);
  });
  if (status !== "ACTIVE") await notifyAdmins({ type: "SYSTEM", title: `User ${status.toLowerCase()}`, body: `${user.name} (${user.email}) — ${reason}` }).catch(() => {});
}
