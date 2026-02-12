import type { NextConfig } from "next";

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fr.onepiece-cardgame.com",
      },
    ],
  },
};

export default nextConfig;
