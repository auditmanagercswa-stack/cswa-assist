import { db, n } from "@/lib/db";
import { isoDate } from "@/lib/format";
import { STATES } from "@/config/tax";
import { createAndPost } from "@/lib/accounting/post";
import { assertCanWrite } from "@/lib/roles";
import { createParty } from "@/lib/documents";
import { validateLines } from "@/lib/accounting/core";
import type { ImportSummary, SyncAdapter } from "./types";
import { buildTallyXml, parseTallyXml } from "./tally-xml";

const STATE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([c, s]) => [s.toLowerCase(), c]));

export const tallyAdapter: SyncAdapter = {
  id: "tally", label: "Tally Prime (XML)", status: "available",

  async exportData(ctx, what) {
    const cid = ctx.company.id;
    const [groups, ledgers] = await Promise.all([
      db.ledgerGroup.findMany({ where: { companyId: cid }, include: { parent: true }, orderBy: { sortOrder: "asc" } }),
      db.ledger.findMany({ where: { companyId: cid }, include: { group: true, party: true } }),
    ]);
    const masters = what !== "vouchers" ? {
      groups: groups.map((g) => ({ name: g.name, parent: g.parent?.name ?? (g.nature === "ASSET" ? "Primary" : "Primary") })),
      ledgers: ledgers.map((l) => ({ name: l.name, parent: l.group.name, openingPaise: n(l.openingPaise), gstin: l.party?.gstin ?? null, state: l.party?.stateCode ? STATES[l.party.stateCode] : null })),
    } : {};
    const vs = what !== "masters" ? await db.voucher.findMany({
      where: { companyId: cid, status: { in: ["POSTED", "REVERSED"] }, date: { gte: ctx.period.from, lte: ctx.period.to } },
      include: { lines: { include: { ledger: true }, orderBy: { sortOrder: "asc" } }, party: true }, orderBy: { date: "asc" },
    }) : [];
    const vouchers = vs.map((v) => ({ type: v.type, date: isoDate(v.date), number: v.number ?? v.id, narration: v.narration ?? "", party: v.party?.name ?? null, lines: v.lines.map((l) => ({ ledger: l.ledger.name, side: l.side, amountPaise: n(l.amountPaise) })) }));
    await db.company.update({ where: { id: cid }, data: { lastSyncAt: new Date(), lastSyncSource: "Tally" } });
    return { filename: `${ctx.company.name.replace(/\W+/g, "_")}_${what}_${isoDate(new Date())}.xml`, mime: "application/xml", body: buildTallyXml(ctx.company.name, { ...masters, vouchers }) };
  },

  async importData(ctx, content) {
    assertCanWrite(ctx);
    const cid = ctx.company.id;
    const data = parseTallyXml(content);
    const out: ImportSummary = { groups: 0, ledgers: 0, vouchers: 0, skipped: 0, errors: [] };

    // Groups: Tally's primary group names match ours; new sub-groups inherit their parent's nature.
    const groupMap = new Map((await db.ledgerGroup.findMany({ where: { companyId: cid } })).map((g) => [g.name.toLowerCase(), g]));
    const pending = data.groups.filter((g) => !groupMap.has(g.name.toLowerCase()));
    for (let pass = 0; pass < 5 && pending.length; pass++) {
      for (const g of [...pending]) {
        const parent = g.parent ? groupMap.get(g.parent.toLowerCase()) : undefined;
        if (!parent) continue;
        const row = await db.ledgerGroup.create({ data: { companyId: cid, name: g.name, nature: parent.nature, parentId: parent.id, schedule3: parent.schedule3, isDirect: parent.isDirect, sortOrder: 900 } });
        groupMap.set(g.name.toLowerCase(), row); pending.splice(pending.indexOf(g), 1); out.groups++;
      }
    }
    for (const g of pending) out.errors.push(`Group "${g.name}": parent "${g.parent}" not found — skipped.`);

    // Ledgers
    const ledgerMap = new Map((await db.ledger.findMany({ where: { companyId: cid } })).map((l) => [l.name.toLowerCase(), l.id]));
    for (const l of data.ledgers) {
      if (ledgerMap.has(l.name.toLowerCase())) { out.skipped++; continue; }
      const grp = groupMap.get(l.parent.toLowerCase());
      if (!grp) { out.errors.push(`Ledger "${l.name}": group "${l.parent}" not found.`); continue; }
      const root = grp.name;
      if (root === "Sundry Debtors" || root === "Sundry Creditors") {
        try {
          const p = await createParty(ctx, { name: l.name, kind: root === "Sundry Debtors" ? "CUSTOMER" : "VENDOR", gstin: l.gstin, stateCode: l.state ? STATE_BY_NAME[l.state.toLowerCase()] : null, openingPaise: l.openingPaise });
          ledgerMap.set(l.name.toLowerCase(), p.ledgerId);
        } catch (e) { out.errors.push(`Party "${l.name}": ${e instanceof Error ? e.message : "invalid"}`); continue; }
      } else {
        const kind = root === "Bank Accounts" ? "BANK" : root === "Cash-in-Hand" ? "CASH" : root === "Duties & Taxes" ? "TAX" : "GENERAL";
        const row = await db.ledger.create({ data: { companyId: cid, groupId: grp.id, name: l.name, kind, openingPaise: BigInt(l.openingPaise) } });
        ledgerMap.set(l.name.toLowerCase(), row.id);
      }
      out.ledgers++;
    }

    // Vouchers: idempotent by Tally type+number+date (kept in aiInput as the external reference).
    const parties = new Map((await db.party.findMany({ where: { companyId: cid } })).map((p) => [p.name.toLowerCase(), p.id]));
    for (const v of data.vouchers) {
      const ref = `tally:${v.type}:${v.number}:${v.date}`;
      // Already here? Either imported before, or it's one of our own vouchers coming back (same number & date).
      const date = new Date(v.date + "T00:00:00Z");
      if (await db.voucher.findFirst({ where: { companyId: cid, OR: [{ aiInput: ref }, ...(v.number ? [{ number: v.number, date }] : [])] } })) { out.skipped++; continue; }
      const missing = v.lines.find((l) => !ledgerMap.has(l.ledger.toLowerCase()));
      if (missing) { out.errors.push(`Voucher ${v.number}: ledger "${missing.ledger}" not found.`); continue; }
      const lines = v.lines.map((l) => ({ ledgerId: ledgerMap.get(l.ledger.toLowerCase())!, side: l.side, amountPaise: l.amountPaise }));
      const errs = validateLines(lines);
      if (errs.length) { out.errors.push(`Voucher ${v.number}: ${errs[0]}`); continue; }
      try {
        await createAndPost(ctx, { type: v.type as never, date, narration: v.narration || `Tally ${v.number}`, partyId: v.party ? parties.get(v.party.toLowerCase()) ?? null : null, source: "TALLY", aiInput: ref, lines });
        out.vouchers++;
      } catch (e) { out.errors.push(`Voucher ${v.number}: ${e instanceof Error ? e.message : "failed"}`); }
    }
    await db.company.update({ where: { id: cid }, data: { lastSyncAt: new Date(), lastSyncSource: "Tally" } });
    return out;
  },
};

export const ADAPTERS: SyncAdapter[] = [
  tallyAdapter,
  { id: "winman", label: "Winman CA ERP", status: "planned" },
  { id: "zoho", label: "Zoho Books", status: "planned" },
];
