import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../_guard";
import { listSettings, SETTING_DEFS, updateSetting, type SettingKey } from "@/server/settings";
import { audit } from "@/server/audit";
import { AppError } from "@/lib/errors";

export const GET = route(async ({ actor }) => {
  adminGuard(actor, "settings.manage");
  return { items: await listSettings() };
});

export const PUT = route(async ({ req, actor, ip }) => {
  const a = adminGuard(actor, "settings.manage");
  const { key, value } = await parseJson(req, z.object({ key: z.string(), value: z.unknown() }));
  if (!(key in SETTING_DEFS)) throw new AppError("VALIDATION", "Unknown setting.");
  try {
    const { before, after } = await updateSetting(key as SettingKey, value, a.userId);
    await audit({ userId: a.userId, action: "settings.update", entityType: "Setting", entityId: key, before, after, ip });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("VALIDATION", e instanceof Error ? e.message : "Invalid value.");
  }
  return { ok: true };
});
