import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { phoneSchema } from "@/lib/validation";
import { addTeamMember, listTeam } from "@/server/services/dealers";

export const GET = route(async ({ actor }) => ({ items: await listTeam(actor) }));

export const POST = route(async ({ req, actor }) => {
  const input = await parseJson(
    req,
    z.object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email(),
      phone: phoneSchema,
      role: z.enum(["OWNER", "MANAGER", "STAFF"]),
      canBid: z.boolean(),
      canList: z.boolean(),
    }),
  );
  const { user, tempPassword } = await addTeamMember(actor, input);
  return { id: user.id, tempPassword };
});
