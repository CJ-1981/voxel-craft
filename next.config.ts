import type { NextConfig } from "next";

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
  // Set basePath for GitHub Pages deployment
  basePath: "/voxel-craft",
  // Ensure asset paths include the base path
  assetPrefix: "/voxel-craft",
};

export default nextConfig;
