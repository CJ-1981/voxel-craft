'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { World, WORLD_SIZE_X, WORLD_SIZE_Z } from '@/lib/game/world'
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

// Detect touch-only devices (phones, tablets without mouse).
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  )
}

// Detect pointer-lock support (excluded on iOS Safari).
function supportsPointerLock(): boolean {
  if (typeof document === 'undefined') return false
  return typeof document.documentElement.requestPointerLock === 'function'
}

export default function MinecraftGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<GameHandle | null>(null)
  const selectedSlotRef = useRef(0)
  // "Playing" = the game loop is actively updating physics. True on desktop
  // when pointer is locked, AND on mobile after the user taps Play.
  const playingRef = useRef(false)

  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showMenu, setShowMenu] = useState(false) // in-game menu (restart/help)
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [fps, setFps] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 })
  const [hudReady, setHudReady] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // Bump this number to force a full world/player reset (Restart button).
  const [worldSeed, setWorldSeed] = useState(0)

  // ----- Initialize the Three.js world (re-runs when worldSeed changes) -----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      // Helps Safari/iOS avoid the default low-power fallback.
      stencil: false,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x8fc4ff)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x8fc4ff)
    scene.fog = new THREE.Fog(0x8fc4ff, 40, 80)

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7a55, 0.85)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.7)
    sun.position.set(0.5, 1, 0.3)
    scene.add(sun)
    const ambient = new THREE.AmbientLight(0xffffff, 0.35)
    scene.add(ambient)

    const atlas = buildAtlasTexture()
    const world = new World(scene, atlas)

    const spawnX = Math.floor(WORLD_SIZE_X / 2)
    const spawnZ = Math.floor(WORLD_SIZE_Z / 2)
    const spawnY = world.highestBlockY(spawnX, spawnZ) + 1
    const player = new Player(spawnX + 0.5, spawnY, spawnZ + 0.5)

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
        // Dispose all chunk geometries.
        scene.traverse(obj => {
          if (obj instanceof THREE.Mesh) obj.geometry?.dispose?.()
        })
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

      // Update player physics only while actively playing.
      if (playingRef.current) {
        player.update(world, input, dt)
      }

      player.getEyePosition(eyePos)
      camera.position.copy(eyePos)
      const q = new THREE.Quaternion()
      q.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'))
      camera.quaternion.copy(q)

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

      frameCount++
      fpsAccum += dt
      if (fpsAccum >= 0.5) {
        setFps(Math.round(frameCount / fpsAccum))
        frameCount = 0
        fpsAccum = 0
      }

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
    window.addEventListener('orientationchange', onResize)

    // ----- Desktop mouse look via pointer lock -----
    const onMouseMove = (e: MouseEvent) => {
      if (!playingRef.current) return
      if (supportsPointerLock() && document.pointerLockElement !== canvas) return
      const sensitivity = 0.0022
      player.yaw -= e.movementX * sensitivity
      player.pitch -= e.movementY * sensitivity
      const limit = Math.PI / 2 - 0.01
      player.pitch = Math.max(-limit, Math.min(limit, player.pitch))
    }
    document.addEventListener('mousemove', onMouseMove)

    // ----- Pointer lock change (desktop only) -----
    const onPointerLockChange = () => {
      if (!supportsPointerLock()) return
      const isLocked = document.pointerLockElement === canvas
      if (isLocked) {
        playingRef.current = true
        setPaused(false)
        setShowMenu(false)
      } else {
        // Lost lock while playing -> pause.
        if (playingRef.current) {
          playingRef.current = false
          setPaused(true)
        }
      }
    }
    document.addEventListener('pointerlockchange', onPointerLockChange)

    // ----- Mouse click: break / place blocks (desktop) -----
    const onMouseDown = (e: MouseEvent) => {
      if (!playingRef.current) return
      // On desktop with pointer-lock support, only act when locked.
      if (supportsPointerLock() && document.pointerLockElement !== canvas) return
      const g = gameRef.current
      if (!g) return
      player.getEyePosition(rayOrigin)
      player.getLookDirection(lookDir)
      const hit = g.world.raycast(rayOrigin, lookDir, 6)
      if (!hit) return

      if (e.button === 0) {
        const b = g.world.getBlock(hit.x, hit.y, hit.z)
        if (b === 'bedrock') return
        g.world.setBlockAndUpdate(g.scene, hit.x, hit.y, hit.z, 'air')
      } else if (e.button === 2) {
        const px = hit.x + hit.nx
        const py = hit.y + hit.ny
        const pz = hit.z + hit.nz
        if (g.world.getBlock(px, py, pz) !== 'air') return
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
      // Esc opens the menu (only meaningful while playing on desktop).
      if (c === 'Escape' || k === 'escape') {
        if (playingRef.current) {
          playingRef.current = false
          setPaused(true)
          setShowMenu(true)
          if (supportsPointerLock() && document.pointerLockElement === canvas) {
            document.exitPointerLock()
          }
        }
        return
      }
      // Don't process movement keys if not playing.
      if (!playingRef.current) return
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
      if (!playingRef.current) return
      if (supportsPointerLock() && document.pointerLockElement !== canvas) return
      e.preventDefault()
      const dir = e.deltaY > 0 ? 1 : -1
      const n = (selectedSlotRef.current + dir + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length
      selectedSlotRef.current = n
      setSelectedSlot(n)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // ----- Context menu: prevent -----
    const onContext = (e: Event) => e.preventDefault()
    canvas.addEventListener('contextmenu', onContext)

    // ----- Mobile touch look (drag on right half of screen) -----
    let touchLookId: number | null = null
    let touchLastX = 0
    let touchLastY = 0
    const onTouchStart = (e: TouchEvent) => {
      if (!playingRef.current) return
      // Only the look-drag (a touch that begins on the canvas, not on a UI button).
      // We use the right half of the screen as the look zone.
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        if (t.clientX > window.innerWidth * 0.5 && touchLookId === null) {
          touchLookId = t.identifier
          touchLastX = t.clientX
          touchLastY = t.clientY
        }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!playingRef.current) return
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        if (t.identifier === touchLookId) {
          const dx = t.clientX - touchLastX
          const dy = t.clientY - touchLastY
          touchLastX = t.clientX
          touchLastY = t.clientY
          const sens = 0.005
          player.yaw -= dx * sens
          player.pitch -= dy * sens
          const limit = Math.PI / 2 - 0.01
          player.pitch = Math.max(-limit, Math.min(limit, player.pitch))
        }
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchLookId) {
          touchLookId = null
        }
      }
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd, { passive: true })
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContext)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('touchcancel', onTouchEnd)
      gameRef.current?.dispose()
      gameRef.current = null
    }
  }, [worldSeed])

  // Detect mobile on mount.
  useEffect(() => {
    setIsMobile(isTouchDevice() || !supportsPointerLock())
  }, [])

  // ----- Mobile action handlers (break / place / jump) -----
  const mobileBreak = useCallback(() => {
    const g = gameRef.current
    if (!g || !playingRef.current) return
    const eye = new THREE.Vector3()
    g.player.getEyePosition(eye)
    const look = new THREE.Vector3()
    g.player.getLookDirection(look)
    const hit = g.world.raycast(eye, look, 6)
    if (!hit) return
    const b = g.world.getBlock(hit.x, hit.y, hit.z)
    if (b === 'bedrock') return
    g.world.setBlockAndUpdate(g.scene, hit.x, hit.y, hit.z, 'air')
  }, [])

  const mobilePlace = useCallback(() => {
    const g = gameRef.current
    if (!g || !playingRef.current) return
    const eye = new THREE.Vector3()
    g.player.getEyePosition(eye)
    const look = new THREE.Vector3()
    g.player.getLookDirection(look)
    const hit = g.world.raycast(eye, look, 6)
    if (!hit) return
    const px = hit.x + hit.nx
    const py = hit.y + hit.ny
    const pz = hit.z + hit.nz
    if (g.world.getBlock(px, py, pz) !== 'air') return
    if (Player.blockOverlapsPlayer(g.player.position.x, g.player.position.y, g.player.position.z, px, py, pz)) return
    const type = HOTBAR_BLOCKS[selectedSlotRef.current]
    g.world.setBlockAndUpdate(g.scene, px, py, pz, type)
  }, [])

  // Mobile jump: hold to keep jumping.
  const mobileJumpDown = useCallback(() => {
    if (gameRef.current) gameRef.current.input.jump = true
  }, [])
  const mobileJumpUp = useCallback(() => {
    if (gameRef.current) gameRef.current.input.jump = false
  }, [])

  // ----- Start / pause handlers -----
  const startGame = useCallback(() => {
    setStarted(true)
    setPaused(false)
    setShowMenu(false)
    playingRef.current = true
    if (supportsPointerLock() && !isMobile) {
      requestAnimationFrame(() => {
        canvasRef.current?.requestPointerLock?.()
      })
    }
  }, [isMobile])

  const resume = useCallback(() => {
    setPaused(false)
    setShowMenu(false)
    playingRef.current = true
    if (supportsPointerLock() && !isMobile) {
      canvasRef.current?.requestPointerLock?.()
    }
  }, [isMobile])

  const openMenu = useCallback(() => {
    playingRef.current = false
    setPaused(true)
    setShowMenu(true)
    if (supportsPointerLock() && document.pointerLockElement === canvasRef.current) {
      document.exitPointerLock()
    }
  }, [])

  const restartGame = useCallback(() => {
    // Reset state and re-create world by bumping the seed.
    playingRef.current = false
    setStarted(false)
    setPaused(false)
    setShowMenu(false)
    setWorldSeed(s => s + 1)
  }, [])

  const selectSlot = useCallback((n: number) => {
    selectedSlotRef.current = n
    setSelectedSlot(n)
  }, [])

  // Mobile movement: press-and-hold buttons set input flags.
  const setMove = useCallback((key: 'forward' | 'back' | 'left' | 'right', val: boolean) => {
    if (gameRef.current) gameRef.current.input[key] = val
  }, [])

  const active = started && !paused

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#8fc4ff] select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
        style={{ touchAction: 'none' }}
      />

      {/* Crosshair */}
      {hudReady && active && (
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

      {/* Top-right: menu button + controls help */}
      {hudReady && started && (
        <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
          <button
            onClick={openMenu}
            className="pointer-events-auto px-3 py-1.5 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs font-mono ring-1 ring-white/20 backdrop-blur-sm"
            aria-label="Open menu"
          >
            ☰ Menu
          </button>
          {active && !isMobile && (
            <div className="pointer-events-none font-mono text-[11px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] text-right space-y-0.5">
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
        </div>
      )}

      {/* Hotbar */}
      {hudReady && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 p-1.5 bg-black/40 backdrop-blur-sm rounded-md ring-1 ring-white/10 max-w-[95vw] overflow-x-auto">
          {HOTBAR_BLOCKS.map((type, i) => (
            <button
              key={type}
              onClick={() => selectSlot(i)}
              className={`relative flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-sm border-2 transition-colors ${
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

      {/* Mobile controls (only on touch devices, only while playing) */}
      {hudReady && isMobile && active && (
        <>
          {/* Left side: movement D-pad */}
          <div className="absolute bottom-24 left-4 grid grid-cols-3 grid-rows-3 gap-1 w-36 h-36 pointer-events-auto">
            <div />
            <button
              onTouchStart={(e) => { e.preventDefault(); setMove('forward', true) }}
              onTouchEnd={(e) => { e.preventDefault(); setMove('forward', false) }}
              className="rounded-md bg-white/15 active:bg-white/30 ring-1 ring-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xl"
              aria-label="Move forward"
            >▲</button>
            <div />
            <button
              onTouchStart={(e) => { e.preventDefault(); setMove('left', true) }}
              onTouchEnd={(e) => { e.preventDefault(); setMove('left', false) }}
              className="rounded-md bg-white/15 active:bg-white/30 ring-1 ring-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xl"
              aria-label="Move left"
            >◀</button>
            <button
              onTouchStart={(e) => { e.preventDefault(); setMove('back', true) }}
              onTouchEnd={(e) => { e.preventDefault(); setMove('back', false) }}
              className="rounded-md bg-white/15 active:bg-white/30 ring-1 ring-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xl"
              aria-label="Move back"
            >▼</button>
            <button
              onTouchStart={(e) => { e.preventDefault(); setMove('right', true) }}
              onTouchEnd={(e) => { e.preventDefault(); setMove('right', false) }}
              className="rounded-md bg-white/15 active:bg-white/30 ring-1 ring-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xl"
              aria-label="Move right"
            >▶</button>
            <div />
            <div />
            <div />
          </div>

          {/* Right side: jump + break + place */}
          <div className="absolute bottom-24 right-4 flex flex-col items-end gap-2 pointer-events-auto">
            <button
              onTouchStart={(e) => { e.preventDefault(); mobileBreak() }}
              className="w-16 h-16 rounded-full bg-red-500/80 active:bg-red-500 ring-2 ring-white/40 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold"
              aria-label="Break block"
            >⛏</button>
            <div className="flex gap-2">
              <button
                onTouchStart={(e) => { e.preventDefault(); mobileJumpDown() }}
                onTouchEnd={(e) => { e.preventDefault(); mobileJumpUp() }}
                className="w-16 h-16 rounded-full bg-sky-500/80 active:bg-sky-500 ring-2 ring-white/40 backdrop-blur-sm flex items-center justify-center text-white text-xl font-bold"
                aria-label="Jump"
              >↑</button>
              <button
                onTouchStart={(e) => { e.preventDefault(); mobilePlace() }}
                className="w-16 h-16 rounded-full bg-emerald-500/80 active:bg-emerald-500 ring-2 ring-white/40 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold"
                aria-label="Place block"
              >+</button>
            </div>
          </div>

          {/* Look hint */}
          <div className="absolute top-1/2 right-4 -translate-y-1/2 pointer-events-none font-mono text-[10px] text-white/40 text-right">
            drag here<br/>to look
          </div>
        </>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-sky-900/80 to-emerald-950/80 backdrop-blur-sm p-4">
          <div className="max-w-lg w-full p-6 sm:p-8 rounded-2xl bg-black/60 ring-1 ring-white/15 shadow-2xl text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-1" style={{ fontFamily: 'monospace' }}>
              VOXEL<span className="text-emerald-400">CRAFT</span>
            </h1>
            <p className="text-white/60 text-xs sm:text-sm mb-5 font-mono">A Minecraft-style sandbox — build, mine, explore.</p>
            {isMobile ? (
              <div className="grid grid-cols-2 gap-2 text-left text-xs text-white/80 font-mono mb-5">
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">D-pad</span> — Move</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Drag right</span> — Look</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">↑ button</span> — Jump</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">⛏ button</span> — Mine</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">+ button</span> — Place</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Tap slot</span> — Pick block</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-left text-xs sm:text-sm text-white/80 font-mono mb-5">
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">WASD</span> — Move</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Mouse</span> — Look</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Space</span> — Jump / Swim</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Shift</span> — Sprint</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">L-Click</span> — Mine block</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">R-Click</span> — Place block</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">1-9</span> — Pick block</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Wheel</span> — Cycle hotbar</div>
              </div>
            )}
            <button
              onClick={startGame}
              className="px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-lg transition-colors shadow-lg shadow-emerald-500/30"
            >
              Play
            </button>
            <p className="text-white/40 text-xs mt-4 font-mono">
              {isMobile ? 'Tap Play to start · ☰ Menu to pause' : 'Click the canvas to capture your mouse · Esc to pause'}
            </p>
          </div>
        </div>
      )}

      {/* Pause / in-game menu overlay */}
      {started && paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="max-w-sm w-full p-6 rounded-2xl bg-zinc-900/90 ring-1 ring-white/15 shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-white mb-1 font-mono">
              {showMenu ? 'Menu' : 'Paused'}
            </h2>
            <p className="text-white/50 text-xs mb-5 font-mono">
              Position: {position.x} / {position.y} / {position.z}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={resume}
                className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors"
              >
                Resume
              </button>
              <button
                onClick={restartGame}
                className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors"
              >
                Restart Game
              </button>
              <button
                onClick={() => { setStarted(false); setPaused(false); setShowMenu(false) }}
                className="px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
              >
                Back to Title
              </button>
            </div>
            <p className="text-white/40 text-xs mt-4 font-mono">
              {isMobile ? 'Tap Resume to continue' : 'Click Resume to recapture mouse'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
