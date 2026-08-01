import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VoxelCraft - Minecraft-style Game",
  description: "A Minecraft-style voxel sandbox built with Next.js, Three.js and TypeScript. Mine, build, and explore a procedurally generated 3D world.",
  keywords: ["Minecraft", "voxel", "sandbox game", "Three.js", "Next.js", "browser game"],
  authors: [{ name: "VoxelCraft" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "VoxelCraft",
    description: "A Minecraft-style voxel sandbox in your browser",
    siteName: "VoxelCraft",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VoxelCraft",
    description: "A Minecraft-style voxel sandbox in your browser",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
