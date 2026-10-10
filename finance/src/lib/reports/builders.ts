import "server-only";
import { db, n } from "@/lib/db";
import { fmtDate, mask } from "@/lib/format";
import type { Ctx } from "@/lib/session";
import { cashFlow, dayBook, getBalanceSheet, getProfitAndLoss, getTrialBalance, gstr1Working, itcRegister, ledgerStatement, taxHeadTotals, tdsSummary } from "@/lib/accounting/ledger";
import type { Cell, ReportDoc, Section } from "./types";

const M = (label: string) => ({ label, money: true, align: "right" as const });

export async function buildReport(key: string, ctx: Ctx, params: { ledger?: string; layout?: string } = {}): Promise<ReportDoc | null> {
  const cid = ctx.company.id, { from, to } = ctx.period;
  const base = { key, company: ctx.company.name, period: `${fmtDate(from)} to ${fmtDate(to)}` };
  const isCompany = ctx.company.legalType === "PRIVATE_LIMITED" || ctx.company.legalType === "LLP";
  const schedule3 = params.layout ? params.layout === "schedule3" : isCompany;

  switch (key) {
    case "tb": {
      const { rows } = await getTrialBalance(cid, from, to);
      const sorted = [...rows].sort((a, b) => a.group.localeCompare(b.group) || a.ledger.localeCompare(b.ledger));
      const sum = (f: (r: typeof rows[number]) => number) => sorted.reduce((t, r) => t + f(r), 0);
      const sec: Section = {
        columns: [{ label: "Ledger" }, { label: "Group" }, M("Opening Dr"), M("Opening Cr"), M("Debit"), M("Credit"), M("Closing Dr"), M("Closing Cr")],
        rows: [
          ...sorted.map((r) => ({ cells: [{ text: r.ledger, href: `/reports/ledger?ledger=${r.ledgerId}` }, r.group, r.opening > 0 ? r.opening : null, r.opening < 0 ? -r.opening : null, r.dr || null, r.cr || null, r.closing > 0 ? r.closing : null, r.closing < 0 ? -r.closing : null] as Cell[] })),
          { tone: "total", cells: ["Total", "", sum((r) => Math.max(0, r.opening)), sum((r) => Math.max(0, -r.opening)), sum((r) => r.dr), sum((r) => r.cr), sum((r) => Math.max(0, r.closing)), sum((r) => Math.max(0, -r.closing))] },
        ],
      };
      return { ...base, title: "Trial Balance", sections: [sec], footnote: "Income and expense ledgers open at zero each financial year." };
    }
    case "pl": {
      const pl = await getProfitAndLoss(cid, from, to);
      if (schedule3) {
        const s = pl.schedule3;
        return {
          ...base, title: "Statement of Profit and Loss", kpis: [{ label: "Total income", value: s.totalIncome }, { label: "Total expenses", value: s.totalExpenses }, { label: "Profit before tax", value: s.profitBeforeTax }],
          sections: [{
            columns: [{ label: "Particulars" }, M("Amount")],
            rows: [
              { tone: "heading", cells: ["Income", null] }, ...s.income.map((x) => ({ cells: [x.label, x.amount] as Cell[] })), { tone: "subtotal", cells: ["Total income (I)", s.totalIncome] },
              { tone: "heading", cells: ["Expenses", null] }, ...s.expenses.map((x) => ({ cells: [x.label, x.amount] as Cell[] })), { tone: "subtotal", cells: ["Total expenses (II)", s.totalExpenses] },
              { tone: "total", cells: ["Profit / (loss) before tax (I − II)", s.profitBeforeTax] },
            ],
          }],
          footnote: "Schedule III (Division I) format. Tax expense and EPS are added at finalisation; closing stock is not valued automatically.",
        };
      }
      const sec = (title: string, rows: { label: string; amount: number }[], total: number): Section["rows"] => [{ tone: "heading", cells: [title, null] }, ...rows.map((r) => ({ cells: [r.label, r.amount] as Cell[] })), { tone: "subtotal", cells: [`Total ${title.toLowerCase()}`, total] }];
      return {
        ...base, title: "Profit & Loss Account", kpis: [{ label: "Income", value: pl.income }, { label: "Spent", value: pl.expenses }, { label: "Net profit", value: pl.netProfit }],
        sections: [{ columns: [{ label: "Particulars" }, M("Amount")], rows: [
          ...sec("Revenue", pl.directIncome.rows, pl.directIncome.total), ...sec("Direct costs", pl.directExpense.rows, pl.directExpense.total),
          { tone: "total", cells: ["Gross profit", pl.grossProfit] },
          ...sec("Other income", pl.indirectIncome.rows, pl.indirectIncome.total), ...sec("Operating expenses", pl.indirectExpense.rows, pl.indirectExpense.total),
          { tone: "total", cells: ["Net profit", pl.netProfit] },
        ] }],
      };
    }
    case "bs": {
      const bs = await getBalanceSheet(cid, to, schedule3);
      return {
        ...base, title: schedule3 ? "Balance Sheet (Schedule III)" : "Balance Sheet", period: `As at ${fmtDate(to)}`,
        kpis: [{ label: "Total assets", value: bs.totalAssets }],
        sections: [
          { heading: schedule3 ? "Equity and liabilities" : "Liabilities & capital", columns: [{ label: "Particulars" }, M("Amount")], rows: [...bs.liabilities.map((x) => ({ cells: [x.label, x.amount] as Cell[] })), { tone: "total", cells: ["Total", bs.totalLiabilities] }] },
          { heading: "Assets", columns: [{ label: "Particulars" }, M("Amount")], rows: [...bs.assets.map((x) => ({ cells: [x.label, x.amount] as Cell[] })), { tone: "total", cells: ["Total", bs.totalAssets] }] },
        ],
        footnote: schedule3 ? "Heads follow Schedule III; current/non-current split and notes are prepared at finalisation." : undefined,
      };
    }
    case "daybook": {
      const vs = await dayBook(cid, from, to);
      return {
        ...base, title: "Day Book",
        sections: [{ columns: [{ label: "Date" }, { label: "Voucher" }, { label: "Type" }, { label: "Particulars" }, M("Debit"), M("Credit")], rows: vs.flatMap((v) => [
          { tone: v.reversal || v.status === "REVERSED" ? "muted" as const : undefined, cells: [fmtDate(v.date), { text: v.number ?? "", href: `/vouchers/${v.id}` }, v.type.toLowerCase(), v.narration ?? v.party ?? "", null, null] as Cell[] },
          ...v.lines.map((l) => ({ tone: "muted" as const, cells: ["", "", "", `${l.side === "CR" ? "    To " : "  "}${l.ledger}`, l.side === "DR" ? l.amount : null, l.side === "CR" ? l.amount : null] as Cell[] })),
        ]) }],
      };
    }
    case "ledger": {
      const ledgers = await db.ledger.findMany({ where: { companyId: cid }, orderBy: { name: "asc" } });
      const id = params.ledger ?? ledgers.find((l) => l.kind === "BANK")?.id ?? ledgers[0]?.id;
      const st = id ? await ledgerStatement(cid, id, from, to) : null;
      if (!st) return null;
      return {
        ...base, title: `Ledger · ${st.ledger.name}${st.ledger.bankAccountNo ? ` (${mask(st.ledger.bankAccountNo)})` : ""}`,
        sections: [{ columns: [{ label: "Date" }, { label: "Voucher" }, { label: "Particulars" }, M("Debit"), M("Credit"), { label: "Dr/Cr" }, M("Balance")], rows: [
          { tone: "muted", cells: ["", "", "Opening balance", null, null, st.opening >= 0 ? "Dr" : "Cr", Math.abs(st.opening)] },
          ...st.rows.map((r) => ({ tone: r.reversed ? "muted" as const : undefined, cells: [fmtDate(r.date), { text: r.number ?? "", href: `/vouchers/${r.id}` }, `${r.particulars}${r.narration ? ` — ${r.narration}` : ""}`, r.dr || null, r.cr || null, r.balance >= 0 ? "Dr" : "Cr", Math.abs(r.balance)] as Cell[] })),
          { tone: "total", cells: ["", "", "Closing balance", st.rows.reduce((t, r) => t + r.dr, 0), st.rows.reduce((t, r) => t + r.cr, 0), st.closing >= 0 ? "Dr" : "Cr", Math.abs(st.closing)] },
        ] }],
      };
    }
    case "cashflow": {
      const cf = await cashFlow(cid, from, to);
      const block = (k: "operating" | "investing" | "financing", title: string): Section["rows"] => [
        { tone: "heading", cells: [title, null] },
        ...cf.detail.filter((d) => d.category === k).map((d) => ({ cells: [d.label, d.amount] as Cell[] })),
        { tone: "subtotal", cells: [`Net cash from ${k} activities`, cf[k].in - cf[k].out] },
      ];
      return {
        ...base, title: "Cash Flow (direct method)", kpis: [{ label: "Opening cash & bank", value: cf.opening }, { label: "Net change", value: cf.net }, { label: "Closing cash & bank", value: cf.closing }],
        sections: [{ columns: [{ label: "Particulars" }, M("Amount")], rows: [{ cells: ["Opening cash & bank", cf.opening] }, ...block("operating", "Operating activities"), ...block("investing", "Investing activities"), ...block("financing", "Financing activities"), { tone: "total", cells: ["Closing cash & bank", cf.closing] }] }],
        footnote: "Each cash/bank movement is classified by the main counter-ledger of its voucher. Cash↔bank transfers are excluded.",
      };
    }
    case "gstr1": {
      const g = await gstr1Working(cid, from, to);
      const invRow = (i: (typeof g.b2b)[number]): Cell[] => [{ text: i.number, href: `/invoices/${i.id}` }, fmtDate(i.date), i.party.name, i.party.gstin ?? "—", i.placeOfSupply, n(i.taxablePaise), n(i.igstPaise), n(i.cgstPaise), n(i.sgstPaise), n(i.totalPaise)];
      const cols = [{ label: "Invoice" }, { label: "Date" }, { label: "Customer" }, { label: "GSTIN" }, { label: "POS" }, M("Taxable"), M("IGST"), M("CGST"), M("SGST"), M("Invoice value")];
      return {
        ...base, title: "GSTR-1 working", kpis: [{ label: "B2B taxable", value: g.b2bTotals.taxable }, { label: "B2C taxable", value: g.b2cTotals.taxable }, { label: "Output tax", value: g.b2bTotals.tax + g.b2cTotals.tax }],
        sections: [
          { heading: `B2B invoices (Table 4A) · ${g.b2bTotals.count}`, columns: cols, rows: g.b2b.map((i) => ({ cells: invRow(i) })) },
          { heading: `B2C invoices (Tables 5/7) · ${g.b2cTotals.count}`, columns: cols, rows: g.b2c.map((i) => ({ cells: invRow(i) })) },
          { heading: "HSN summary (Table 12)", columns: [{ label: "HSN/SAC" }, { label: "Rate" }, { label: "Quantity", align: "right" }, M("Taxable value")], rows: g.hsn.map((h) => ({ cells: [h.hsn, `${h.rate}%`, String(h.qty), h.taxable] })) },
        ],
        footnote: "Working paper for filing. Upload via the GST portal or your GSP — direct API filing isn't connected.",
      };
    }
    case "gstr3b": {
      const t = await taxHeadTotals(cid, from, to);
      const sales = await db.invoice.aggregate({ _sum: { taxablePaise: true }, where: { companyId: cid, date: { gte: from, lte: to }, status: { not: "CANCELLED" } } });
      return {
        ...base, title: "GSTR-3B working", kpis: [{ label: "Output tax", value: t.totalOut }, { label: "Eligible ITC", value: t.totalIn }, { label: "Net payable in cash", value: t.netPayable }],
        sections: [
          { heading: "3.1(a) Outward taxable supplies", columns: [{ label: "Particulars" }, M("Taxable value"), M("IGST"), M("CGST"), M("SGST")], rows: [{ cells: ["Outward taxable supplies", n(sales._sum.taxablePaise), t.output.igst, t.output.cgst, t.output.sgst] }] },
          { heading: "3.1(d) Inward supplies liable to reverse charge", columns: [{ label: "Particulars" }, M("Tax")], rows: [{ cells: ["RCM tax payable", t.rcm] }] },
          { heading: "4 Eligible ITC", columns: [{ label: "Particulars" }, M("IGST"), M("CGST"), M("SGST")], rows: [{ cells: ["All other ITC (purchase bills)", t.input.igst, t.input.cgst, t.input.sgst] }] },
          { heading: "Payment", columns: [{ label: "Particulars" }, M("Amount")], rows: [{ cells: ["Total output tax + RCM", t.totalOut + t.rcm] }, { cells: ["Less: ITC utilised", Math.min(t.totalIn, t.totalOut + t.rcm)] }, { tone: "total", cells: ["Net payable in cash", t.netPayable] }, { tone: "muted", cells: ["ITC carried forward", t.carryForward] }] },
        ],
        footnote: "Simplified set-off (total ITC against total output). The portal applies head-wise utilisation rules; RCM must be paid in cash.",
      };
    }
    case "itc": {
      const bills = await itcRegister(cid, from, to);
      return {
        ...base, title: "ITC register",
        sections: [{ columns: [{ label: "Date" }, { label: "Vendor" }, { label: "GSTIN" }, { label: "Bill no." }, M("Taxable"), M("IGST"), M("CGST"), M("SGST"), { label: "RCM" }], rows: [
          ...bills.map((b) => ({ cells: [fmtDate(b.date), b.party.name, b.party.gstin ?? "—", b.vendorBillNo, n(b.taxablePaise), n(b.igstPaise), n(b.cgstPaise), n(b.sgstPaise), b.reverseCharge ? "Yes" : ""] as Cell[] })),
          { tone: "total", cells: ["Total", "", "", "", bills.reduce((t, b) => t + n(b.taxablePaise), 0), bills.reduce((t, b) => t + n(b.igstPaise), 0), bills.reduce((t, b) => t + n(b.cgstPaise), 0), bills.reduce((t, b) => t + n(b.sgstPaise), 0), ""] },
        ] }],
        footnote: "Match against GSTR-2B before claiming. Bills from vendors without a GSTIN aren't eligible for ITC.",
      };
    }
    case "tds": {
      const t = await tdsSummary(cid, from, to);
      const total = t.sections.reduce((s, x) => s + x.amount, 0);
      return {
        ...base, title: "TDS summary", kpis: [{ label: "TDS deducted", value: total }, { label: "Deposited", value: t.deposited }, { label: "Balance to deposit", value: Math.max(0, total - t.deposited) }],
        sections: [
          { heading: "By section", columns: [{ label: "Section" }, { label: "Entries", align: "right" }, M("Amount paid/credited"), M("TDS")], rows: [...t.sections.map((s) => ({ cells: [s.section, String(s.count), s.base, s.amount] as Cell[] })), { tone: "total", cells: ["Total", "", t.sections.reduce((s, x) => s + x.base, 0), total] }] },
          { heading: "Deductee details", columns: [{ label: "Date" }, { label: "Voucher" }, { label: "Deductee" }, { label: "PAN" }, { label: "Section" }, M("Base"), M("TDS")], rows: t.rows.map((r) => ({ cells: [fmtDate(r.date), { text: r.number ?? "", href: `/vouchers/${r.id}` }, r.party, r.pan ? mask(r.pan) : "PAN missing", r.section, r.base, r.amount] })) },
        ],
        footnote: "Deposit by the 7th of the next month (30 April for March). File 24Q/26Q quarterly.",
      };
    }
    default: return null;
  }
}
