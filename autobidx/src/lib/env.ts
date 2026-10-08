// Centralised, validated access to environment configuration (server only).
function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get appMode(): "development" | "demo" | "production" {
    const m = process.env.APP_MODE;
    if (m === "production" || m === "demo") return m;
    return process.env.NODE_ENV === "production" && !m ? "production" : "development";
  },
  get isProduction() {
    return this.appMode === "production";
  },
  get authSecret() {
    const s = required("AUTH_SECRET", process.env.NODE_ENV === "test" ? "test-secret-test-secret-test-secret-01" : undefined);
    if (s.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
    return s;
  },
  get storageDir() {
    return process.env.STORAGE_DIR || "./storage";
  },
  get mediaBaseUrl() {
    return (process.env.MEDIA_BASE_URL || "").replace(/\/$/, "");
  },
  get paymentGateway() {
    return process.env.PAYMENT_GATEWAY || "mock";
  },
  get paymentWebhookSecret() {
    return process.env.PAYMENT_WEBHOOK_SECRET || "dev-webhook-secret";
  },
  get jobsInProcess() {
    return process.env.JOBS_IN_PROCESS !== "false";
  },
};
