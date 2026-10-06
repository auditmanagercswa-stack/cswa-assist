import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";

export type Breakdown = {
  price: number;
  lines: { code: string; name: string; payer: "BUYER" | "SELLER"; calcType: "FIXED" | "PERCENT"; rateBps: number; amount: number; gst: number; gstRateBps: number }[];
  buyer: { fees: number; gst: number; total: number };
  seller: { fees: number; gst: number; net: number };
};

/** Complete, server-computed fee breakdown. Pure presentational — never calculates fees itself. */
export function FeeBreakdown({ b, show = "buyer", className, priceLabel = "Vehicle price" }: { b: Breakdown; show?: "buyer" | "seller" | "both"; className?: string; priceLabel?: string }) {
  const buyerLines = b.lines.filter((l) => l.payer === "BUYER");
  const sellerLines = b.lines.filter((l) => l.payer === "SELLER");
  const rate = (l: Breakdown["lines"][number]) => (l.calcType === "PERCENT" ? ` (${(l.rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%)` : "");
  const gstRate = buyerLines.find((l) => l.gst > 0)?.gstRateBps;
  const Row = ({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "green" }) => (
    <div className={cn("flex items-baseline justify-between gap-3 py-2", strong && "border-t border-slate-200 pt-3 text-[15px]")}>
      <dt className={cn(strong ? "font-bold text-ink-900" : "text-slate-600", tone === "green" && "text-verified-600")}>{label}</dt>
      <dd className={cn("num whitespace-nowrap", strong ? "font-bold text-ink-900" : "font-semibold text-ink-900", tone === "green" && "text-verified-600")}>{value}</dd>
    </div>
  );
  return (
    <dl className={cn("text-[14px]", className)}>
      <Row label={priceLabel} value={formatINR(b.price)} />
      {(show === "buyer" || show === "both") && (
        <>
          {buyerLines.map((l) => <Row key={l.code} label={l.name + rate(l)} value={formatINR(l.amount)} />)}
          {b.buyer.gst > 0 && <Row label={`GST on fees${gstRate ? ` (${gstRate / 100}%)` : ""}`} value={formatINR(b.buyer.gst)} />}
          <Row label="Total buyer payable" value={formatINR(b.buyer.total)} strong />
        </>
      )}
      {(show === "seller" || show === "both") && (
        <div className={cn(show === "both" && "mt-3 border-t border-dashed border-slate-300 pt-2")}>
          {sellerLines.map((l) => <Row key={l.code} label={l.name + rate(l)} value={`− ${formatINR(l.amount)}`} />)}
          {b.seller.gst > 0 && <Row label="GST on seller fees" value={`− ${formatINR(b.seller.gst)}`} />}
          <Row label="Seller net receivable" value={formatINR(b.seller.net)} strong tone="green" />
        </div>
      )}
    </dl>
  );
}
