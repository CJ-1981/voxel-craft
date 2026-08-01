'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { World, WATER_LEVEL, WORLD_SIZE_X, WORLD_SIZE_Z } from '@/lib/game/world'
import { Player, InputState } from '@/lib/game/player'
import { BLOCKS, HOTBAR_BLOCKS } from '@/lib/game/blocks'
import { buildAtlasTexture, tileDataUrl } from '@/lib/game/textures'

interface GameHandle {
  world: World
  player: Player
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  input: InputState
  selectionMesh: THREE.LineSegments
  dispose: () => void
}

export default function MinecraftGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<GameHandle | null>(null)
  const selectedSlotRef = useRef(0)

  const [started, setStarted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [fps, setFps] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 })
  const [hudReady, setHudReady] = useState(false)

  // ----- Initialize the Three.js world once on mount -----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x8fc4ff)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x8fc4ff)
    scene.fog = new THREE.Fog(0x8fc4ff, 40, 80)

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500)

    // Lighting — hemisphere + directional sun.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7a55, 0.85)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.7)
    sun.position.set(0.5, 1, 0.3)
    scene.add(sun)
    const ambient = new THREE.AmbientLight(0xffffff, 0.35)
    scene.add(ambient)

    // Build atlas texture and world.
    const atlas = buildAtlasTexture()
    const world = new World(scene, atlas)

    // Spawn player at world center, on the surface.
    const spawnX = Math.floor(WORLD_SIZE_X / 2)
    const spawnZ = Math.floor(WORLD_SIZE_Z / 2)
    const spawnY = world.highestBlockY(spawnX, spawnZ) + 1
    const player = new Player(spawnX + 0.5, spawnY, spawnZ + 0.5)

    // Selection wireframe box.
    const boxGeo = new THREE.BoxGeometry(1.001, 1.001, 1.001)
    const edges = new THREE.EdgesGeometry(boxGeo)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 })
    const selectionMesh = new THREE.LineSegments(edges, lineMat)
    selectionMesh.visible = false
    scene.add(selectionMesh)

    const input: InputState = {
      forward: false, back: false, left: false, right: false, jump: false, sprint: false,
    }

    gameRef.current = {
      world, player, scene, camera, renderer, input, selectionMesh,
      dispose: () => {
        renderer.dispose()
        atlas.dispose()
        boxGeo.dispose()
        edges.dispose()
        lineMat.dispose()
      },
    }

    setHudReady(true)

    // ----- Animation loop -----
    const eyePos = new THREE.Vector3()
    const lookDir = new THREE.Vector3()
    const rayOrigin = new THREE.Vector3()
    let lastTime = performance.now()
    let frameCount = 0
    let fpsAccum = 0
    let rafId = 0
    let hudAccum = 0

    const loop = () => {
      rafId = requestAnimationFrame(loop)
      const now = performance.now()
      const dt = (now - lastTime) / 1000
      lastTime = now

      // Update player physics (only when locked, so paused state freezes the world).
      const isLocked = document.pointerLockElement === canvas
      if (isLocked) {
        player.update(world, input, dt)
      }

      // Sync camera to player eye.
      player.getEyePosition(eyePos)
      camera.position.copy(eyePos)
      // Apply yaw + pitch via quaternion (FPS camera, no roll).
      const q = new THREE.Quaternion()
      q.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'))
      camera.quaternion.copy(q)

      // Update selection box.
      player.getLookDirection(lookDir)
      rayOrigin.copy(eyePos)
      const hit = world.raycast(rayOrigin, lookDir, 6)
      if (hit) {
        selectionMesh.visible = true
        selectionMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
      } else {
        selectionMesh.visible = false
      }

      renderer.render(scene, camera)

      // FPS counter (averaged over 0.5s).
      frameCount++
      fpsAccum += dt
      if (fpsAccum >= 0.5) {
        setFps(Math.round(frameCount / fpsAccum))
        frameCount = 0
        fpsAccum = 0
      }

      // HUD position update (4 Hz).
      hudAccum += dt
      if (hudAccum >= 0.25) {
        hudAccum = 0
        setPosition({
          x: Math.floor(player.position.x),
          y: Math.floor(player.position.y),
          z: Math.floor(player.position.z),
        })
      }
    }
    loop()

    // ----- Resize -----
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    // ----- Mouse look (pointer lock) -----
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      const sensitivity = 0.0022
      player.yaw -= e.movementX * sensitivity
      player.pitch -= e.movementY * sensitivity
      const limit = Math.PI / 2 - 0.01
      player.pitch = Math.max(-limit, Math.min(limit, player.pitch))
    }
    document.addEventListener('mousemove', onMouseMove)

    // ----- Pointer lock change -----
    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === canvas
      setLocked(isLocked)
    }
    document.addEventListener('pointerlockchange', onPointerLockChange)

    // ----- Mouse click: break / place blocks -----
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      const g = gameRef.current
      if (!g) return
      player.getEyePosition(rayOrigin)
      player.getLookDirection(lookDir)
      const hit = g.world.raycast(rayOrigin, lookDir, 6)
      if (!hit) return

      if (e.button === 0) {
        // Left click: break block (don't break bedrock).
        const b = g.world.getBlock(hit.x, hit.y, hit.z)
        if (b === 'bedrock') return
        g.world.setBlockAndUpdate(g.scene, hit.x, hit.y, hit.z, 'air')
      } else if (e.button === 2) {
        // Right click: place selected block adjacent to hit face.
        const px = hit.x + hit.nx
        const py = hit.y + hit.ny
        const pz = hit.z + hit.nz
        // Target cell must be empty.
        if (g.world.getBlock(px, py, pz) !== 'air') return
        // Don't place a block where the player is standing.
        if (Player.blockOverlapsPlayer(player.position.x, player.position.y, player.position.z, px, py, pz)) return
        const type = HOTBAR_BLOCKS[selectedSlotRef.current]
        g.world.setBlockAndUpdate(g.scene, px, py, pz, type)
      }
    }
    canvas.addEventListener('mousedown', onMouseDown)

    // ----- Keyboard -----
    const onKeyDown = (e: KeyboardEvent) => {
      const g = gameRef.current
      if (!g) return
      const c = e.code
      const k = e.key.toLowerCase()
      if (c === 'KeyW' || c === 'ArrowUp' || k === 'w') input.forward = true
      else if (c === 'KeyS' || c === 'ArrowDown' || k === 's') input.back = true
      else if (c === 'KeyA' || c === 'ArrowLeft' || k === 'a') input.left = true
      else if (c === 'KeyD' || c === 'ArrowRight' || k === 'd') input.right = true
      else if (c === 'Space' || k === ' ') { input.jump = true; e.preventDefault() }
      else if (c === 'ShiftLeft' || c === 'ShiftRight' || k === 'shift') input.sprint = true
      else if (k >= '1' && k <= '9') {
        const n = parseInt(k, 10) - 1
        if (n < HOTBAR_BLOCKS.length) {
          selectedSlotRef.current = n
          setSelectedSlot(n)
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const c = e.code
      const k = e.key.toLowerCase()
      if (c === 'KeyW' || c === 'ArrowUp' || k === 'w') input.forward = false
      else if (c === 'KeyS' || c === 'ArrowDown' || k === 's') input.back = false
      else if (c === 'KeyA' || c === 'ArrowLeft' || k === 'a') input.left = false
      else if (c === 'KeyD' || c === 'ArrowRight' || k === 'd') input.right = false
      else if (c === 'Space' || k === ' ') input.jump = false
      else if (c === 'ShiftLeft' || c === 'ShiftRight' || k === 'shift') input.sprint = false
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)

    // ----- Mouse wheel: cycle hotbar -----
    const onWheel = (e: WheelEvent) => {
      if (document.pointerLockElement !== canvas) return
      e.preventDefault()
      const dir = e.deltaY > 0 ? 1 : -1
      let n = (selectedSlotRef.current + dir + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length
      selectedSlotRef.current = n
      setSelectedSlot(n)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // ----- Context menu: prevent -----
    const onContext = (e: Event) => e.preventDefault()
    canvas.addEventListener('contextmenu', onContext)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContext)
      gameRef.current?.dispose()
      gameRef.current = null
    }
  }, [])

  // ----- Start / pause handlers -----
  const startGame = useCallback(() => {
    setStarted(true)
    // Request pointer lock on next tick.
    requestAnimationFrame(() => {
      canvasRef.current?.requestPointerLock?.()
    })
  }, [])

  const resume = useCallback(() => {
    canvasRef.current?.requestPointerLock?.()
  }, [])

  // Update slot ref when slot changes via UI click.
  const selectSlot = useCallback((n: number) => {
    selectedSlotRef.current = n
    setSelectedSlot(n)
  }, [])

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#8fc4ff] select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
      />

      {/* Crosshair */}
      {hudReady && locked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-6 h-6 opacity-80">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-white mix-blend-difference" />
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white mix-blend-difference" />
          </div>
        </div>
      )}

      {/* Top-left HUD */}
      {hudReady && (
        <div className="pointer-events-none absolute top-3 left-3 font-mono text-xs text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] space-y-1">
          <div>FPS: <span className="text-emerald-300">{fps}</span></div>
          <div>XYZ: {position.x} / {position.y} / {position.z}</div>
          <div>Block: {BLOCKS[HOTBAR_BLOCKS[selectedSlot]].name}</div>
        </div>
      )}

      {/* Top-right controls help */}
      {hudReady && locked && (
        <div className="pointer-events-none absolute top-3 right-3 font-mono text-[11px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] text-right space-y-0.5">
          <div>WASD — move</div>
          <div>Space — jump / swim</div>
          <div>Shift — sprint</div>
          <div>Mouse — look</div>
          <div>L-click — break</div>
          <div>R-click — place</div>
          <div>1-9 / wheel — select</div>
          <div>Esc — pause</div>
        </div>
      )}

      {/* Hotbar */}
      {hudReady && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 p-1.5 bg-black/40 backdrop-blur-sm rounded-md ring-1 ring-white/10">
          {HOTBAR_BLOCKS.map((type, i) => (
            <button
              key={type}
              onClick={() => selectSlot(i)}
              className={`relative w-12 h-12 rounded-sm border-2 transition-colors ${
                i === selectedSlot ? 'border-white bg-white/15' : 'border-white/20 bg-black/30 hover:border-white/50'
              }`}
              title={BLOCKS[type].name}
            >
              <img
                src={tileDataUrl(BLOCKS[type].tiles[0])}
                alt={BLOCKS[type].name}
                className="w-full h-full object-cover pixelated"
                style={{ imageRendering: 'pixelated' }}
                draggable={false}
              />
              <span className="absolute bottom-0 right-0.5 text-[10px] font-mono text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                {i + 1 <= 9 ? i + 1 : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-sky-900/80 to-emerald-950/80 backdrop-blur-sm">
          <div className="max-w-lg mx-4 p-8 rounded-2xl bg-black/60 ring-1 ring-white/15 shadow-2xl text-center">
            <h1 className="text-4xl font-extrabold text-white tracking-tight mb-1" style={{ fontFamily: 'monospace' }}>
              VOXEL<span className="text-emerald-400">CRAFT</span>
            </h1>
            <p className="text-white/60 text-sm mb-6 font-mono">A Minecraft-style sandbox — build, mine, explore.</p>
            <div className="grid grid-cols-2 gap-3 text-left text-sm text-white/80 font-mono mb-6">
              <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">WASD</span> — Move</div>
              <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Mouse</span> — Look</div>
              <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Space</span> — Jump / Swim</div>
              <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Shift</span> — Sprint</div>
              <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">L-Click</span> — Mine block</div>
              <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">R-Click</span> — Place block</div>
              <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">1-9</span> — Pick block</div>
              <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Wheel</span> — Cycle hotbar</div>
            </div>
            <button
              onClick={startGame}
              className="px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-lg transition-colors shadow-lg shadow-emerald-500/30"
            >
              Play
            </button>
            <p className="text-white/40 text-xs mt-4 font-mono">Click the canvas to capture your mouse · Esc to pause</p>
          </div>
        </div>
      )}

      {/* Pause overlay */}
      {started && !locked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-4 font-mono">Paused</h2>
            <button
              onClick={resume}
              className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors"
            >
              Resume
            </button>
            <p className="text-white/50 text-xs mt-3 font-mono">Click Resume to recapture mouse</p>
          </div>
        </div>
      )}
    </div>
  )
}
