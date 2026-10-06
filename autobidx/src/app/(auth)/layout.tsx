import { BadgeCheck, Gavel, Lock } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { CarArt } from "@/components/vehicles/car-art";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative hidden overflow-hidden bg-ink-950 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_80%_20%,rgba(224,27,36,0.25),transparent_60%)]" />
        <div className="relative p-10"><Link href="/" aria-label="Alpha Cars home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/alpha-cars-logo.png" alt="Alpha Cars — Pre Owned Cars" width={752} height={596} className="h-32 w-auto mix-blend-lighten" />
        </Link></div>
        <div className="relative mx-10 aspect-[16/10] overflow-hidden rounded-3xl ring-1 ring-white/10">
          <CarArt kind="SEDAN" color="#b3202a" scene="dusk" seed={777} className="absolute inset-0" />
        </div>
        <div className="relative mt-auto p-10">
          <h2 className="text-[30px] font-bold leading-tight">Buy Smarter.<br />Sell Faster.</h2>
          <ul className="mt-6 space-y-3 text-[14.5px] text-white/75">
            <li className="flex items-center gap-3"><BadgeCheck className="h-5 w-5 text-emerald-400" />Every dealer KYC-verified before trading</li>
            <li className="flex items-center gap-3"><Gavel className="h-5 w-5 text-ignite-400" />Real-time auctions with proxy bidding</li>
            <li className="flex items-center gap-3"><Lock className="h-5 w-5 text-emerald-400" />Server-verified bids & payments</li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="p-5 lg:hidden"><Logo /></div>
        <div className="flex flex-1 items-start justify-center px-4 py-6 sm:items-center sm:py-12">{children}</div>
      </div>
    </div>
  );
}
