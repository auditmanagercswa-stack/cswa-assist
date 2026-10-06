"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "../ui/toast";

export function WatchButton({ vehicleId, initial, signedIn, variant = "icon" }: { vehicleId: string; initial: boolean; signedIn: boolean; variant?: "icon" | "full" }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { push } = useToast();
  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setBusy(true);
    const next = !on;
    setOn(next);
    const { error } = await api(`/api/vehicles/${vehicleId}/watch`, { body: { on: next } });
    setBusy(false);
    if (error) {
      setOn(!next);
      push({ tone: "error", title: error.message });
    } else push({ tone: "success", title: next ? "Added to watchlist" : "Removed from watchlist", body: next ? "We'll alert you before the auction ends." : undefined });
  }
  if (variant === "full")
    return (
      <button onClick={toggle} disabled={busy} className={cn("inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition", on ? "border-ignite-200 bg-ignite-50 text-ignite-700" : "border-slate-300 bg-white text-ink-900 hover:border-ink-900")}>
        <Heart className={cn("h-4 w-4", on && "fill-current")} /> {on ? "Watching" : "Add to watchlist"}
      </button>
    );
  return (
    <button onClick={toggle} disabled={busy} aria-pressed={on} aria-label={on ? "Remove from watchlist" : "Add to watchlist"} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow-sm backdrop-blur transition hover:scale-105">
      <Heart className={cn("h-[18px] w-[18px]", on && "fill-ignite-500 text-ignite-500")} />
    </button>
  );
}
