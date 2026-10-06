import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

export function Field({ label, error, hint, children, className, required, htmlFor }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean; htmlFor?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-slate-700">
          {label}
          {required && <span className="text-ignite-600"> *</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-[12px] font-medium text-red-600" role="alert">{error}</p> : hint ? <p className="text-[12px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

const control = "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-ink-900 placeholder:text-slate-400 transition focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10 disabled:bg-slate-50 disabled:text-slate-500";

export function Input({ className, invalid, ...rest }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input className={cn(control, invalid && "border-red-400 focus:border-red-500 focus:ring-red-500/10", className)} {...rest} />;
}

export function Select({ className, invalid, children, ...rest }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select className={cn(control, "pr-2", invalid && "border-red-400", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, invalid, ...rest }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea className={cn(control, "h-auto min-h-[96px] py-2.5", invalid && "border-red-400", className)} {...rest} />;
}

export function Checkbox({ label, className, ...rest }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm text-slate-700", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-ignite-500" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-slate-300">
      <span>
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        {description && <span className="mt-0.5 block text-[12.5px] text-slate-500">{description}</span>}
      </span>
      <span className={cn("relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-ignite-500" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}
