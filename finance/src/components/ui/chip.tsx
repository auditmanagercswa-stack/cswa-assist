import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-sand text-ink-2",
  gold: "bg-gold-soft text-gold",
  mint: "bg-mint/25 text-mint-ink",
  danger: "bg-danger-bg text-danger",
  warn: "bg-warn-bg text-warn",
  forest: "bg-forest text-on-forest",
} as const;

export function Chip({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)} {...p} />;
}
