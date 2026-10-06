import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "Alpha Cars — Pre-Owned Cars from Verified Dealers", template: "%s · Alpha Cars" },
  description: "Buy used cars from verified dealers through competitive bidding. Thousands of verified vehicles, transparent fees and secure payments.",
  applicationName: "Alpha Cars",
  openGraph: { type: "website", siteName: "Alpha Cars", locale: "en_IN" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
