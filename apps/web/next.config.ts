import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow loading stock logos from Massive's branding CDN.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.massive.com",
        pathname: "/v1/reference/company-branding/**",
      },
    ],
  },
};

export default nextConfig;
