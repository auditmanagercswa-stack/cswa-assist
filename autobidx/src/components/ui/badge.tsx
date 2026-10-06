import { cn } from "@/lib/cn";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

const tones = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  ink: "bg-ink-900 text-white ring-ink-900",
  orange: "bg-ignite-50 text-ignite-700 ring-ignite-100",
  green: "bg-verified-50 text-verified-600 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS: Record<string, [string, Tone]> = {
  // vehicles
  DRAFT: ["Draft", "neutral"],
  PENDING_APPROVAL: ["Pending Approval", "amber"],
  PUBLISHED: ["Published", "green"],
  AUCTION_LIVE: ["Auction Live", "orange"],
  AUCTION_ENDED: ["Auction Ended", "neutral"],
  RESERVED: ["Sale Pending", "violet"],
  SOLD: ["Sold", "ink"],
  SUSPENDED: ["Suspended", "red"],
  CANCELLED: ["Cancelled", "neutral"],
  REJECTED: ["Rejected", "red"],
  // auctions
  SCHEDULED: ["Scheduled", "blue"],
  LIVE: ["Live", "orange"],
  ENDED: ["Ended", "neutral"],
  WON: ["Won", "green"],
  RESERVE_NOT_MET: ["Reserve Not Met", "amber"],
  NO_BIDS: ["No Bids", "neutral"],
  SOLD_BUY_NOW: ["Sold (Buy Now)", "ink"],
  // orders
  PAYMENT_PENDING: ["Payment Pending", "amber"],
  PAYMENT_RECEIVED: ["Payment Received", "blue"],
  SELLER_CONFIRMED: ["Seller Confirmed", "blue"],
  DOCUMENTS_PENDING: ["Documents Pending", "violet"],
  VEHICLE_READY: ["Vehicle Ready", "blue"],
  IN_DELIVERY: ["Pickup / Delivery", "violet"],
  COMPLETED: ["Completed", "green"],
  DISPUTED: ["Disputed", "red"],
  // payments
  PENDING: ["Pending", "amber"],
  PROCESSING: ["Processing", "blue"],
  PAID: ["Paid", "green"],
  FAILED: ["Failed", "red"],
  REFUNDED: ["Refunded", "neutral"],
  PARTIALLY_REFUNDED: ["Partially Refunded", "amber"],
  // dealers & KYC
  UNDER_REVIEW: ["Under Review", "blue"],
  VERIFIED: ["Verified", "green"],
  BLOCKED: ["Blocked", "red"],
  NOT_SUBMITTED: ["Not Submitted", "neutral"],
  SUBMITTED: ["Submitted", "blue"],
  APPROVED: ["Approved", "green"],
  // offers
  COUNTERED: ["Countered", "violet"],
  ACCEPTED: ["Accepted", "green"],
  EXPIRED: ["Expired", "neutral"],
  WITHDRAWN: ["Withdrawn", "neutral"],
  // disputes
  OPEN: ["Open", "red"],
  INVESTIGATING: ["Investigating", "amber"],
  AWAITING_DOCUMENTS: ["Awaiting Documents", "violet"],
  RESOLVED: ["Resolved", "green"],
  CLOSED: ["Closed", "neutral"],
  ACTIVE: ["Active", "green"],
  DISMISSED: ["Dismissed", "neutral"],
  REVIEWED: ["Reviewed", "blue"],
  ACTIONED: ["Actioned", "ink"],
  ON_HOLD: ["On Hold", "amber"],
  RELEASED: ["Released", "green"],
  NOT_DUE: ["Not Due", "neutral"],
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return null;
  const [label, tone] = STATUS[status] ?? [status.replace(/_/g, " ").toLowerCase(), "neutral" as Tone];
  return (
    <Badge tone={tone} className={className} dot={status === "AUCTION_LIVE" || status === "LIVE"}>
      {label}
    </Badge>
  );
}

export function VerificationBadge({ verified = true, label = "Verified Dealer", className }: { verified?: boolean; label?: string; className?: string }) {
  if (!verified) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-semibold text-verified-600", className)}>
      <BadgeCheck className="h-4 w-4" aria-hidden /> {label}
    </span>
  );
}

export function InspectionBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score == null) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-ink-900/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur", className)}>
      <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> Inspected {score}/100
    </span>
  );
}
