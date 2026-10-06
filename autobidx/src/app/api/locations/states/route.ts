import { route } from "@/server/http";
import { getStates } from "@/server/services/catalog";

export const GET = route(async () => ({ items: await getStates() }));
