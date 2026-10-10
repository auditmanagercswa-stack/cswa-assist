"use client";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { inr } from "@/lib/format";

/** Dark hero card: profit margin donut (mint = profit share of income, gold = spent). */
export function ProfitCard({ fyLabel, periodLabel, income, expenses, net }: { fyLabel: string; periodLabel: string; income: number; expenses: number; net: number }) {
  const margin = income > 0 ? Math.round((net / income) * 100) : 0;
  const profitShare = Math.max(0, Math.min(income, net));
  const data = income > 0 ? [{ v: profitShare }, { v: Math.max(0, income - profitShare) }] : [{ v: 0 }, { v: 1 }];
  return (
    <section aria-label="Net profit" className="relative overflow-hidden rounded-[var(--radius-card)] bg-forest p-6 text-on-forest shadow-[var(--shadow-card)]"
      style={{ backgroundImage: "radial-gradient(120% 80% at 100% 0%, rgba(184,135,58,0.28) 0%, transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(127,224,176,0.12) 0%, transparent 60%)" }}>
      <p className="smallcaps text-gold">Net profit · {fyLabel}</p>
      <p className="mt-0.5 text-xs text-on-forest/60">{periodLabel}</p>
      <div className="relative mx-auto my-4 size-44">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="v" innerRadius="74%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive>
              <Cell fill="var(--mint)" />
              <Cell fill="var(--gold)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="money text-3xl">{margin}%</div>
            <div className="text-[11px] text-on-forest/60">margin</div>
          </div>
        </div>
      </div>
      <div className={"money text-center text-4xl " + (net < 0 ? "text-[#f3a59a]" : "")}>{inr(net, { round: true })}</div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-on-forest/80">
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-mint" />Income <b className="money font-semibold">{inr(income, { round: true })}</b></span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-gold" />Spent <b className="money font-semibold">{inr(expenses, { round: true })}</b></span>
      </div>
    </section>
  );
}
