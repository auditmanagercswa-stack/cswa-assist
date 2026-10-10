import Link from "next/link";
import { Landmark, Wallet, HandCoins, Banknote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/format";
import type { HomeData } from "@/lib/dashboard";

export function MiniCards({ d }: { d: HomeData }) {
  const tile = (href: string, icon: React.ReactNode, label: string, value: number, tone = "") => (
    <Link key={href} href={href} className="block">
      <Card className="flex items-center gap-3 p-4 transition-transform duration-200 hover:-translate-y-0.5">
        <span className="grid size-10 place-items-center rounded-full bg-sand text-gold">{icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-xs text-ink-2">{label}</span>
          <span className={"money block text-lg " + tone}>{inr(value, { round: true })}</span>
        </span>
      </Card>
    </Link>
  );
  return (
    <div className="grid gap-3">
      {d.cashBank.map((b) => tile(`/banking?ledger=${b.id}`, b.kind === "CASH" ? <Banknote className="size-5" /> : <Landmark className="size-5" />, b.name, b.balance, b.balance < 0 ? "text-danger" : ""))}
      {tile("/receivables", <HandCoins className="size-5" />, "Customers owe you", d.receivables, "text-mint-ink")}
      {tile("/payables", <Wallet className="size-5" />, "You owe vendors", d.payables)}
    </div>
  );
}
