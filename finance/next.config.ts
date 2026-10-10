import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  poweredByHeader: false,
};

export default nextConfig;
