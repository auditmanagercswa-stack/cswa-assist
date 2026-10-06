import Link from "next/link";
import { getSettings } from "@/server/settings";

export async function SiteFooter() {
  const s = await getSettings(["platform.supportEmail", "platform.supportPhone", "gst.platformLegalName"]);
  const cols = [
    { title: "Marketplace", links: [["Browse cars", "/vehicles"], ["Live auctions", "/auctions"], ["Verified dealers", "/dealers"], ["SUVs", "/vehicles?body=SUV"], ["Electric cars", "/vehicles?fuel=ELECTRIC"]] },
    { title: "For dealers", links: [["Join as dealer", "/register"], ["List a vehicle", "/dashboard/vehicles/new"], ["Dealer dashboard", "/dashboard"], ["Help centre", "/help"], ["Fee policy", "/pages/fee-policy"]] },
    { title: "Policies", links: [["Terms & Conditions", "/pages/terms"], ["Privacy Policy", "/pages/privacy"], ["Auction Rules", "/pages/auction-rules"], ["Refund Policy", "/pages/refund-policy"], ["Dealer Agreement", "/pages/dealer-agreement"], ["Buyer Agreement", "/pages/buyer-agreement"], ["Cookie Policy", "/pages/cookie-policy"]] },
  ];
  return (
    <footer className="bg-ink-950 text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/alpha-cars-logo.png" alt="Alpha Cars — Pre Owned Cars" width={752} height={596} className="h-28 w-auto mix-blend-lighten" />
            <p className="mt-4 max-w-xs font-display text-[17px] italic text-slate-300">Buy Smarter. Sell Faster.</p>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed">India&apos;s dealer-to-dealer used-car marketplace with transparent, server-verified bidding. Built in Kerala.</p>
            <div className="mt-5 space-y-1 text-[13px]">
              <div>{s["platform.supportEmail"]}</div>
              <div>{s["platform.supportPhone"]}</div>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="mb-3 font-sans text-[12px] font-bold uppercase tracking-wider text-white">{c.title}</h4>
              <ul className="space-y-2 text-[13.5px]">
                {c.links.map(([l, h]) => (
                  <li key={h}>
                    <Link href={h} className="hover:text-white">{l}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-[12px] sm:flex-row">
          <span>© {new Date().getFullYear()} {s["gst.platformLegalName"]}. All rights reserved.</span>
          <span>Alpha Cars is a marketplace facilitator; vehicles are sold by independent verified dealers.</span>
        </div>
      </div>
    </footer>
  );
}
