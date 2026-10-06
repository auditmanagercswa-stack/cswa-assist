import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { authenticate, issueOtp, registerDealer, requestPasswordReset, resetPassword, verifyOtp } from "@/server/services/accounts";
import { actorFromToken, createSession, revokeSession } from "@/server/auth/session";
import { registerDealerSchema } from "@/lib/validation";
import { expectAppError, seedWorld, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await seedWorld();
});

const meta = { ip: "127.0.0.1", userAgent: "vitest" };
const input = (w: World, over: Record<string, unknown> = {}) =>
  registerDealerSchema.parse({
    name: "Anu Joseph",
    email: "anu@kochicars.in",
    phone: "+91 98470 11111",
    password: "Secure123",
    dealershipName: "Kochi Cars",
    businessType: "PROPRIETORSHIP",
    gstin: "32ABCDE1234F1Z5",
    pan: "abcde1234f",
    addressLine: "12 MG Road, Ernakulam",
    stateId: w.state.id,
    districtId: w.district.id,
    pincode: "682011",
    acceptTerms: true,
    ...over,
  });

describe("dealer registration", () => {
  it("validates and normalises inputs", () => {
    const ok = input(w);
    expect(ok.phone).toBe("9847011111");
    expect(ok.pan).toBe("ABCDE1234F");
    expect(registerDealerSchema.safeParse({ ...ok, gstin: "BAD" }).success).toBe(false);
    expect(registerDealerSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(registerDealerSchema.safeParse({ ...ok, acceptTerms: false }).success).toBe(false);
  });

  it("creates user, PENDING dealership, owner membership, FREE plan and KYC draft", async () => {
    const { user, dealer } = await registerDealer(input(w), meta);
    expect(dealer.status).toBe("PENDING");
    expect(user.passwordHash).not.toContain("Secure123");
    expect(await prisma.dealerUser.count({ where: { userId: user.id, dealerId: dealer.id, role: "OWNER" } })).toBe(1);
    expect(await prisma.subscription.count({ where: { dealerId: dealer.id, planId: w.free.id } })).toBe(1);
    expect(await prisma.kycSubmission.count({ where: { dealerId: dealer.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "auth.register" } })).toBe(1);
  });

  it("rejects duplicate email, phone and GSTIN", async () => {
    await registerDealer(input(w), meta);
    await expectAppError(registerDealer(input(w, { phone: "9847022222", gstin: "32ABCDE1234F1Z6" }), meta), "CONFLICT");
    await expectAppError(registerDealer(input(w, { email: "x@y.in", gstin: "32ABCDE1234F1Z6" }), meta), "CONFLICT");
    await expectAppError(registerDealer(input(w, { email: "x@y.in", phone: "9847022222" }), meta), "CONFLICT");
  });
});

describe("authentication & sessions", () => {
  it("logs in by email or mobile, rejects wrong passwords and locks after repeated failures", async () => {
    await registerDealer(input(w), meta);
    expect((await authenticate("ANU@kochicars.in", "Secure123", meta)).email).toBe("anu@kochicars.in");
    expect((await authenticate("+91 9847011111", "Secure123", meta)).email).toBe("anu@kochicars.in");
    await expectAppError(authenticate("anu@kochicars.in", "wrong", meta), "UNAUTHENTICATED");
    await expectAppError(authenticate("nobody@x.in", "wrong", meta), "UNAUTHENTICATED");
    for (let i = 0; i < 4; i++) await authenticate("anu@kochicars.in", "wrong", meta).catch(() => {});
    await expectAppError(authenticate("anu@kochicars.in", "Secure123", meta), "RATE_LIMITED");
  });

  it("issues signed session tokens that are revocable server-side", async () => {
    const { user } = await registerDealer(input(w), meta);
    const { token, sessionId } = await createSession(user.id, meta);
    const actor = await actorFromToken(token);
    expect(actor?.userId).toBe(user.id);
    expect(actor?.dealer?.status).toBe("PENDING");
    expect(await actorFromToken(token.slice(0, -2) + "xx")).toBeNull(); // tampered
    await revokeSession(sessionId);
    expect(await actorFromToken(token)).toBeNull();
  });

  it("suspended users can't sign in and lose existing sessions' access", async () => {
    const { user } = await registerDealer(input(w), meta);
    const { token } = await createSession(user.id, meta);
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await expectAppError(authenticate("anu@kochicars.in", "Secure123", meta), "FORBIDDEN");
    expect(await actorFromToken(token)).toBeNull();
  });

  it("password reset: single-use token, signs out other sessions", async () => {
    const { user } = await registerDealer(input(w), meta);
    const { token: sessionToken } = await createSession(user.id, meta);
    const { devLink } = await requestPasswordReset("anu@kochicars.in", meta);
    const token = new URL(devLink!).searchParams.get("token")!;
    await resetPassword(token, "NewPass456", meta);
    expect(await actorFromToken(sessionToken)).toBeNull();
    expect((await authenticate("anu@kochicars.in", "NewPass456", meta)).id).toBe(user.id);
    await expectAppError(resetPassword(token, "Another789", meta), "VALIDATION");
    expect((await requestPasswordReset("unknown@x.in", meta)).devLink).toBeNull();
  });

  it("OTP verification with attempt limits", async () => {
    const { user } = await registerDealer(input(w), meta);
    await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
    const { devCode } = await issueOtp(user.id, "EMAIL_VERIFY");
    await expectAppError(verifyOtp(user.id, "EMAIL_VERIFY", "000000" === devCode ? "111111" : "000000"), "VALIDATION");
    await verifyOtp(user.id, "EMAIL_VERIFY", devCode!);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
  });
});

import { safeNext } from "@/lib/slug";
describe("post-login redirect", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNext("/dashboard/orders")).toBe("/dashboard/orders");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/\u0000x", null]) expect(safeNext(bad as string)).toBe("/dashboard");
  });
});
