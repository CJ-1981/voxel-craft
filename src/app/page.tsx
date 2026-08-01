'use client'

import dynamic from 'next/dynamic'

// VoxelCraft runs entirely client-side (Three.js, WebGL, pointer lock).
// Disable SSR so the component only mounts in the browser.
const MinecraftGame = dynamic(() => import('@/components/game/MinecraftGame'), {
  ssr: false,
})

export default function Home() {
  return <MinecraftGame />
}
