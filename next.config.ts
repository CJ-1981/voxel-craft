import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const basePath = process.env.BASE_PATH ?? (isProd ? "/voxel-craft" : undefined);

const nextConfig: NextConfig = {
  output: "export",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  // Set basePath for GitHub Pages deployment in production
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // Allow HMR when testing from devices on the LAN (e.g. phone at 192.168.0.6)
  allowedDevOrigins: ["192.168.0.6"],
};

export default nextConfig;
