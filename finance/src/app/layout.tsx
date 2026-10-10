import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Books", template: "%s · Books" },
  description: "Chat in. Books out. Chat-first accounting and GST compliance for Indian businesses.",
};
export const viewport: Viewport = { themeColor: "#0F2A22" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "";
  return (
    <html lang="en-IN" className={theme}>
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" toastOptions={{ style: { borderRadius: 16, fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
