"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Toast = { id: number; tone: "success" | "error" | "info"; title: string; body?: string };
const Ctx = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3.5 shadow-[var(--shadow-lift)]", t.tone === "error" ? "border-red-200" : t.tone === "success" ? "border-emerald-200" : "border-slate-200")}>
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-verified-500" /> : t.tone === "error" ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /> : <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink-900">{t.title}</div>
              {t.body && <div className="mt-0.5 text-[13px] text-slate-600">{t.body}</div>}
            </div>
            <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
