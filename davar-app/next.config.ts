import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Autorise l'aperçu en direct (preview) en plus de localhost.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
