import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

/** Friendly empty state with an optional action. */
export function EmptyState({ title, body, action, icon }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 grid size-12 place-items-center rounded-full bg-sand text-gold">{icon}</div>}
      <h3 className="text-lg text-ink">{title}</h3>
      {body && <p className="max-w-md text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Serif page title with one italic gold emphasis word: <PageTitle pre="Your" em="invoices" />. */
export function PageTitle({ pre, em, post, sub, actions }: { pre?: string; em?: string; post?: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-3xl text-ink md:text-4xl">
          {pre} {em && <em className="text-gold">{em}</em>} {post}
        </h1>
        {sub && <p className="text-sm text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Table shell with horizontal scroll on small screens. */
export function DataTable({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm [&_th]:smallcaps [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-ink-3 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_tbody_tr]:border-t [&_tbody_tr]:border-hairline [&_tbody_tr:hover]:bg-cream/60", className)} {...p} />
    </div>
  );
}
