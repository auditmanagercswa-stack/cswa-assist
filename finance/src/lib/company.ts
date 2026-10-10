import type { LegalType, Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_GROUPS, DEFAULT_LEDGERS } from "@/config/chart-of-accounts";
import { dueDatesForFy } from "@/config/compliance-calendar";

type Client = PrismaClient | Prisma.TransactionClient;

export interface NewCompany {
  name: string; legalType: LegalType; stateCode: string;
  gstin?: string | null; pan?: string | null; tan?: string | null; address?: string | null; email?: string | null; phone?: string | null; upiId?: string | null;
  flags?: string[];
}

/** Create a company with the default chart of accounts and make `userId` its owner. */
export async function createCompanyWithChart(client: Client, userId: string, data: NewCompany, bankName = "Bank Account") {
  const company = await client.company.create({ data: { ...data, flags: data.flags ?? [], memberships: { create: { userId, role: "OWNER" } } } });
  const ids = new Map<string, string>();
  for (const [i, g] of DEFAULT_GROUPS.entries()) {
    const row = await client.ledgerGroup.create({ data: { companyId: company.id, name: g.name, nature: g.nature, parentId: g.parent ? ids.get(g.parent) : null, schedule3: g.schedule3, isDirect: g.isDirect ?? false, sortOrder: i } });
    ids.set(g.name, row.id);
  }
  await client.ledger.createMany({
    data: [
      ...DEFAULT_LEDGERS.map((l) => ({ companyId: company.id, groupId: ids.get(l.group)!, name: l.name, kind: l.kind ?? "GENERAL", taxHead: l.taxHead ?? null, aliases: l.aliases ?? [] })),
      { companyId: company.id, groupId: ids.get("Bank Accounts")!, name: bankName, kind: "BANK" as const, aliases: [bankName.split(" ")[0].toLowerCase(), "bank"] },
    ],
  });
  return company;
}

/** Idempotently create the FY's statutory due dates for a company. */
export async function ensureDueDates(client: Client, companyId: string, fy: number) {
  const c = await client.company.findUniqueOrThrow({ where: { id: companyId } });
  const has = { gst: !!c.gstin, tan: !!c.tan, pf: c.flags.includes("pf"), pt: c.flags.includes("pt"), always: true };
  const rows = dueDatesForFy(fy, has);
  const existing = await client.dueDate.findMany({ where: { companyId, code: { in: [...new Set(rows.map((r) => r.code))] } }, select: { code: true, period: true } });
  const seen = new Set(existing.map((e) => `${e.code}:${e.period}`));
  const fresh = rows.filter((r) => !seen.has(`${r.code}:${r.period}`));
  if (fresh.length) await client.dueDate.createMany({ data: fresh.map((r) => ({ companyId, code: r.code, period: r.period, title: r.title, subtitle: r.subtitle, dueOn: r.dueOn })) });
}
