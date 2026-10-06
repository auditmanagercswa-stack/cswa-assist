import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { POST as adminVehicleAction } from "@/app/api/admin/vehicles/[id]/route";
import { PUT as adminSettings } from "@/app/api/admin/settings/route";
import { POST as placeBidRoute } from "@/app/api/auctions/[id]/bids/route";
import { POST as initiatePayment } from "@/app/api/payments/initiate/route";
import { GET as orderGet } from "@/app/api/orders/[id]/route";
import { buyNow } from "@/server/services/sales";
import { makeAdmin, makeDealer, makeLiveAuction, makeVehicle, seedWorld, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await seedWorld();
});

async function cookieFor(userId: string) {
  const { token } = await createSession(userId, { ip: null, userAgent: null });
  return `${SESSION_COOKIE}=${token}`;
}
function req(url: string, body: unknown, cookie?: string, extra: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify(body) });
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

describe("API authorization", () => {
  it("admin endpoints: 401 anonymous, 403 dealers, 200 admins (with audit)", async () => {
    const seller = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { status: "PENDING_APPROVAL", publishedAt: null });
    expect((await adminVehicleAction(req(`/api/admin/vehicles/${v.id}`, { action: "approve" }), ctx({ id: v.id }))).status).toBe(401);
    expect((await adminVehicleAction(req(`/api/admin/vehicles/${v.id}`, { action: "approve" }, await cookieFor(seller.user.id)), ctx({ id: v.id }))).status).toBe(403);
    const admin = await makeAdmin();
    const ok = await adminVehicleAction(req(`/api/admin/vehicles/${v.id}`, { action: "approve" }, await cookieFor(admin.user.id)), ctx({ id: v.id }));
    expect(ok.status).toBe(200);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("PUBLISHED");
    expect(await prisma.auditLog.count({ where: { action: "vehicle.approve", entityId: v.id } })).toBe(1);
  });

  it("settings require settings.manage (super admin), not just admin", async () => {
    const admin = await makeAdmin("ADMIN");
    const superAdmin = await makeAdmin("SUPER_ADMIN");
    const body = { key: "auction.antiSnipeTriggerSeconds", value: 90 };
    expect((await adminSettings(req("/api/admin/settings", body, await cookieFor(admin.user.id)), ctx({}))).status).toBe(403);
    expect((await adminSettings(req("/api/admin/settings", body, await cookieFor(superAdmin.user.id)), ctx({}))).status).toBe(200);
    const bad = await adminSettings(req("/api/admin/settings", { key: "auction.antiSnipeTriggerSeconds", value: "abc" }, await cookieFor(superAdmin.user.id)), ctx({}));
    expect(bad.status).toBe(422);
  });

  it("bid endpoint: validation errors are user-friendly JSON, no stack traces", async () => {
    const seller = await makeDealer(w);
    const buyer = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id);
    const a = await makeLiveAuction(v.id);
    const cookie = await cookieFor(buyer.user.id);
    const low = await placeBidRoute(req(`/api/auctions/${a.id}/bids`, { amount: 1000 }, cookie), ctx({ id: a.id }));
    expect(low.status).toBe(422);
    const json = await low.json();
    expect(json.error.code).toBe("BID_TOO_LOW");
    expect(json.error.message).toMatch(/Your bid must be at least ₹/);
    expect(JSON.stringify(json)).not.toMatch(/at \w+ \(/);
    const ok = await placeBidRoute(req(`/api/auctions/${a.id}/bids`, { amount: 500000 }, cookie), ctx({ id: a.id }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).message).toBe("Bid placed successfully.");
  });

  it("blocks cross-site requests (CSRF) when the Origin doesn't match", async () => {
    const buyer = await makeDealer(w);
    const seller = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id);
    const a = await makeLiveAuction(v.id);
    const res = await placeBidRoute(req(`/api/auctions/${a.id}/bids`, { amount: 500000 }, await cookieFor(buyer.user.id), { origin: "https://evil.example", host: "localhost:3000" }), ctx({ id: a.id }));
    expect(res.status).toBe(403);
    expect(await prisma.bid.count()).toBe(0);
  });

  it("payment initiation ignores any client-supplied amount; orders are private to their parties", async () => {
    const seller = await makeDealer(w);
    const buyer = await makeDealer(w);
    const stranger = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 600000 });
    const order = await buyNow({ vehicleId: v.id, actor: buyer.actor });
    const res = await initiatePayment(req("/api/payments/initiate", { orderId: order.id, method: "UPI", amount: 1 }, await cookieFor(buyer.user.id)), ctx({}));
    expect(res.status).toBe(200);
    expect((await res.json()).amount).toBe(604720);
    const peek = await orderGet(new Request(`http://localhost:3000/api/orders/${order.id}`, { headers: { cookie: await cookieFor(stranger.user.id) } }), ctx({ id: order.id }));
    expect(peek.status).toBe(404);
  });
});
