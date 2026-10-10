import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-xl border border-hairline bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors duration-200 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/25 disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, "h-10", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-10 pr-8", className)} {...p} />
));
Select.displayName = "Select";

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("grid gap-1.5 text-xs font-medium text-ink-2", className)} {...p} />;
}
