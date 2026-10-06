"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";

/**
 * Countdown synced to the server clock: `serverTime` is the server's "now" when the page was
 * rendered, so a wrong device clock never shows a wrong remaining time.
 */
export function AuctionTimer({ endAt, serverTime, startAt, className, compact, onEnd }: { endAt: string; serverTime?: string; startAt?: string; className?: string; compact?: boolean; onEnd?: () => void }) {
  const [offset] = useState(() => (serverTime ? new Date(serverTime).getTime() - Date.now() : 0));
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now() + offset);
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  const end = new Date(endAt).getTime();
  const start = startAt ? new Date(startAt).getTime() : 0;
  const n = now ?? (serverTime ? new Date(serverTime).getTime() : end - 1);
  const notStarted = start > n;
  const remaining = notStarted ? start - n : end - n;
  useEffect(() => {
    if (!notStarted && remaining <= 0 && now !== null) onEnd?.();
  }, [remaining <= 0, notStarted]); // eslint-disable-line react-hooks/exhaustive-deps
  const urgent = !notStarted && remaining > 0 && remaining < 5 * 60_000;
  const soon = !notStarted && remaining > 0 && remaining < 60 * 60_000;
  return (
    <span className={cn("num inline-flex items-center gap-1.5 font-semibold", urgent ? "text-red-600" : soon ? "text-amber-600" : "", className)} suppressHydrationWarning>
      <Clock className={cn("h-3.5 w-3.5 shrink-0", urgent && "animate-pulse-soft")} aria-hidden />
      {remaining <= 0 && !notStarted ? "Ended" : (notStarted ? (compact ? "Starts " : "Starts in ") : compact ? "" : "") + formatCountdown(remaining)}
    </span>
  );
}
