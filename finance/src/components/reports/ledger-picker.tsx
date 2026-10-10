"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";

export function LedgerPicker({ ledgers, value }: { ledgers: { id: string; name: string; group: string }[]; value?: string }) {
  const router = useRouter();
  const groups = Object.entries(ledgers.reduce<Record<string, typeof ledgers>>((m, l) => ((m[l.group] ??= []).push(l), m), {}));
  return (
    <Select aria-label="Ledger" value={value} onChange={(e) => router.push(`/reports/ledger?ledger=${e.target.value}`)} className="w-auto min-w-64">
      {groups.map(([g, ls]) => <optgroup key={g} label={g}>{ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}
    </Select>
  );
}
