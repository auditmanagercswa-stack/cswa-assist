import { route } from "@/server/http";
import { getMakes } from "@/server/services/catalog";

export const GET = route(async () => ({ items: await getMakes() }));
