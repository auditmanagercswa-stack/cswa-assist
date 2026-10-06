import { route } from "@/server/http";
import { adminGuard } from "../_guard";
import { listFeesAdmin } from "@/server/services/fee-admin";

export const GET = route(async ({ actor }) => {
  adminGuard(actor, "fees.manage");
  return { items: await listFeesAdmin() };
});
