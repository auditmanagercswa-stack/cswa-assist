import { route } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";

export const GET = route(async ({ actor }) => {
  const a = requireActor(actor);
  return {
    user: { id: a.userId, name: a.name, email: a.email, phone: a.phone, role: a.role, emailVerified: a.emailVerified, phoneVerified: a.phoneVerified },
    dealer: a.dealer,
    permissions: [...a.permissions],
  };
});
