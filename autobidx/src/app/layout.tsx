import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "AutoBidX — India's Smarter Used-Car Marketplace", template: "%s · AutoBidX" },
  description: "Buy used cars from verified dealers through competitive bidding. Thousands of verified vehicles, transparent fees and secure payments.",
  applicationName: "AutoBidX",
  openGraph: { type: "website", siteName: "AutoBidX", locale: "en_IN" },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0b1220", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
