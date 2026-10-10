import {
  Home, Sparkles, FilePlus2, FileText, HandCoins, BellRing, ReceiptText, Wallet, Users, Landmark, BarChart3, Percent, Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; mobile?: boolean }

/** Sidebar order follows the product spec. `mobile` items appear in the bottom tab bar. */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home, mobile: true },
  { href: "/ask", label: "Ask AI", icon: Sparkles, mobile: true },
  { href: "/invoices/new", label: "Invoice", icon: FilePlus2 },
  { href: "/invoices", label: "Invoices", icon: FileText, mobile: true },
  { href: "/receivables", label: "Receivables", icon: HandCoins },
  { href: "/collect", label: "Collect", icon: BellRing },
  { href: "/bills/new", label: "New bill", icon: ReceiptText },
  { href: "/payables", label: "Payables", icon: Wallet },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/banking", label: "Banking", icon: Landmark },
  { href: "/reports", label: "Reports", icon: BarChart3, mobile: true },
  { href: "/gst", label: "GST", icon: Percent },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Longest-prefix match so /invoices/new highlights "Invoice", not "Invoices". */
export function activeHref(pathname: string): string {
  let best = "/";
  for (const n of NAV) {
    const hit = n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(n.href + "/");
    if (hit && n.href.length > best.length) best = n.href;
  }
  if (pathname.startsWith("/invoices/") && !pathname.startsWith("/invoices/new")) return "/invoices";
  if (pathname.startsWith("/bills")) return "/bills/new";
  return best;
}
