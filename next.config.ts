import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Ensures Prisma client is bundled correctly for serverless
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
