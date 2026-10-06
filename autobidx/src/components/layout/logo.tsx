import Link from "next/link";
import { cn } from "@/lib/cn";

/** The Alpha Cars "A" mark on its black ground. */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/alpha-mark.png" alt="" aria-hidden width={48} height={31} className={cn("h-8 w-auto mix-blend-lighten", className)} />
  );
}

/**
 * Horizontal lockup: "A" mark + ALPHA / CARS / PRE OWNED CARS wordmark.
 * The artwork sits on black, so on light surfaces it is placed on a black plate.
 */
export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label="Alpha Cars home" className={cn("flex shrink-0 items-center gap-2", !dark && "rounded-lg bg-black px-2.5 py-1.5", className)}>
      <LogoMark className="h-9" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/alpha-wordmark.png" alt="Alpha Cars" width={752} height={241} className="h-9 w-auto mix-blend-lighten" />
    </Link>
  );
}
