"use client";

export type ApiError = { code: string; message: string; details?: { fields?: Record<string, string> } & Record<string, unknown> };

/** Small fetch wrapper for client components. Never throws; returns { data } or { error }. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<{ data?: T; error?: ApiError }> {
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: opts.form ? undefined : { "Content-Type": "application/json" },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: "same-origin",
    });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await res.json() : null;
    if (!res.ok) {
      if (res.status === 401 && payload?.error?.code === "UNAUTHENTICATED") {
        return { error: { code: "UNAUTHENTICATED", message: payload.error.message ?? "Session expired. Please sign in again." } };
      }
      return { error: payload?.error ?? { code: "INTERNAL", message: res.status === 429 ? "Too many requests. Please slow down." : "Something went wrong. Please try again." } };
    }
    return { data: payload as T };
  } catch {
    return { error: { code: "NETWORK", message: "Network error — check your connection and try again." } };
  }
}
