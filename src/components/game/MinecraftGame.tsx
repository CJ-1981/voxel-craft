'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { World, WORLD_SIZE_X, WORLD_SIZE_Z, WATER_LEVEL } from '@/lib/game/world'
import { Player, InputState, GameMode } from '@/lib/game/player'
import { BLOCKS, HOTBAR_BLOCKS } from '@/lib/game/blocks'
import { buildAtlasTexture, tileDataUrl } from '@/lib/game/textures'
import { DayNightCycle } from '@/lib/game/daynight'
import { MobManager } from '@/lib/game/mobs'
import { SoundSystem } from '@/lib/game/sound'
import { PostProcessing } from '@/lib/game/postprocessing'
import { BreakParticles } from '@/lib/game/particles'
import { Minimap } from '@/lib/game/minimap'
import { buildSeoulCity } from '@/lib/game/seoul'
import { buildTokyoCity } from '@/lib/game/maps/tokyo'
import { Inventory, MAIN_SIZE, HOTBAR_SIZE, Slot } from '@/lib/game/inventory'
import { ITEMS, blockDropItem } from '@/lib/game/items'
import { InventoryUI } from '@/components/game/InventoryUI'
import { ChestUI } from '@/components/game/ChestUI'
import { generateDungeonLoot } from '@/lib/game/structures'

export type MapType = 'seoul' | 'tokyo' | 'wilderness'

interface GameHandle {
  world: World
  player: Player
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  input: InputState
  selectionMesh: THREE.LineSegments
  dayNight: DayNightCycle
  mobs: MobManager
  sound: SoundSystem
  post: PostProcessing
  particles: BreakParticles
  minimap: Minimap | null
  inventory: Inventory
  dispose: () => void
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches
}
function supportsPointerLock(): boolean {
  if (typeof document === 'undefined') return false
  return typeof document.documentElement.requestPointerLock === 'function'
}

interface Settings {
  fov: number
  sensitivity: number
  renderDistance: number
  volume: number
  soundEnabled: boolean
  postProcessing: boolean
  bloom: boolean
  unlimitedMap: boolean
}

const DEFAULT_SETTINGS: Settings = {
  fov: 75,
  sensitivity: 0.0022,
  renderDistance: 96,
  volume: 0.5,
  soundEnabled: true,
  // Default OFF — post-processing is heavy on low-end devices. Users can
  // enable it in Settings for the cinematic bloom/vignette look.
  postProcessing: false,
  bloom: true,
  // Default OFF — endless chunk streaming consumes significant CPU/GPU.
  unlimitedMap: false,
}

export default function MinecraftGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<GameHandle | null>(null)
  const selectedSlotRef = useRef(0)
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS)
  const playingRef = useRef(false)
  // Mirror of showInventory state for use in event handlers (which capture
  // stale closures). The keyboard handler reads this ref instead of the state.
  const showInventoryRef = useRef(false)
  // For double-tap-to-fly detection.
  const lastJumpTapRef = useRef(0)
  // Footstep audio accumulator.
  const stepDistRef = useRef(0)
  // Persistent inventory — survives world restarts.
  const inventoryRef = useRef<Inventory>(new Inventory())

  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [invVersion, setInvVersion] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [fps, setFps] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 })
  const [hudReady, setHudReady] = useState(false)
  const [meshProgress, setMeshProgress] = useState(1)
  const [isMobile, setIsMobile] = useState(false)
  const [worldSeed, setWorldSeed] = useState(0)
  const [hasSave, setHasSave] = useState(false)
  const [gameMode, setGameMode] = useState<GameMode>('survival')
  const [health, setHealth] = useState(20)
  const [hunger, setHunger] = useState(20)
  const [oxygen, setOxygen] = useState(10)
  const [timeOfDay, setTimeOfDay] = useState(0.3)
  const [isNight, setIsNight] = useState(false)
  const [mobCount, setMobCount] = useState(0)
  const [chunkCount, setChunkCount] = useState(0)
  const [flying, setFlying] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [dead, setDead] = useState(false)

  const [selectedMap, setSelectedMap] = useState<MapType>('seoul')
  const selectedMapRef = useRef<MapType>('seoul')
  const [openChest, setOpenChest] = useState<{ pos: { x: number; y: number; z: number }; slots: Slot[] } | null>(null)

  // Load settings and map selection from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('voxelcraft_settings')
      if (raw) {
        const s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
        setSettings(s)
        settingsRef.current = s
      }
      const savedMap = localStorage.getItem('voxelcraft_selected_map') as MapType
      if (savedMap && ['seoul', 'tokyo', 'wilderness'].includes(savedMap)) {
        setSelectedMap(savedMap)
        selectedMapRef.current = savedMap
      }
    } catch { /* ignore */ }
    setHasSave(World.hasSave())
  }, [])

  // Persist settings.
  const saveSettings = useCallback((s: Settings) => {
    setSettings(s)
    settingsRef.current = s
    try { localStorage.setItem('voxelcraft_settings', JSON.stringify(s)) } catch { /* ignore */ }
    // Apply to live game.
    const g = gameRef.current
    if (g) {
      g.camera.fov = s.fov
      g.camera.updateProjectionMatrix()
      g.sound.setVolume(s.volume)
      g.sound.setEnabled(s.soundEnabled)
      g.post.setEnabled(s.postProcessing)
      g.post.setBloomStrength(s.bloom ? 0.5 : 0)
      g.world.setRenderDistance(s.renderDistance)
      g.world.setUnlimitedMap(s.unlimitedMap)
    }
  }, [])

  // ----- Initialize the Three.js world (re-runs when worldSeed changes) -----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x8fc4ff)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x8fc4ff)

    const s = settingsRef.current
    // Fog hides the streaming chunk edge — tie it to the render distance.
    scene.fog = new THREE.Fog(0x8fc4ff, s.renderDistance * 0.45, s.renderDistance)

    const camera = new THREE.PerspectiveCamera(s.fov, window.innerWidth / window.innerHeight, 0.1, 600)

    const atlas = buildAtlasTexture()
    // Try to load saved world; if found, use the saved seed.
    const meta = World.loadMeta()
    const world = new World(scene, atlas, meta?.seed, meta ? { x: meta.playerX, z: meta.playerZ } : undefined, s.unlimitedMap)
    if (World.hasSave() && meta) {
      const result = world.loadFromSave(scene)
      if (!result) {
        World.clearSave()
      }
    } else {
      // Fresh world — build selected map landmarks.
      if (selectedMapRef.current === 'tokyo') {
        buildTokyoCity(world, scene)
      } else if (selectedMapRef.current === 'seoul') {
        buildSeoulCity(world, scene)
      }
      // 'wilderness' generates pure procedural biomes with dungeons, pyramids & lava
    }

    // Spawn player — either from save or world center.
    const spawnX = meta ? meta.playerX : Math.floor(WORLD_SIZE_X / 2) + 0.5
    const spawnZ = meta ? meta.playerZ : Math.floor(WORLD_SIZE_Z / 2) + 0.5
    const spawnY = meta ? meta.playerY : world.highestBlockY(Math.floor(spawnX), Math.floor(spawnZ)) + 1
    const player = new Player(spawnX, spawnY, spawnZ)
    if (meta) {
      player.yaw = meta.playerYaw
      player.pitch = meta.playerPitch
    }
    player.gameMode = gameMode

    // Selection wireframe.
    const boxGeo = new THREE.BoxGeometry(1.001, 1.001, 1.001)
    const edges = new THREE.EdgesGeometry(boxGeo)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 })
    const selectionMesh = new THREE.LineSegments(edges, lineMat)
    selectionMesh.visible = false
    scene.add(selectionMesh)

    const dayNight = new DayNightCycle(scene)
    const mobs = new MobManager(scene)
    const sound = new SoundSystem()
    sound.setVolume(s.volume)
    sound.setEnabled(s.soundEnabled)
    const post = new PostProcessing(renderer, scene, camera)
    post.setEnabled(s.postProcessing)
    post.setBloomStrength(s.bloom ? 0.5 : 0)
    const particles = new BreakParticles(scene, atlas)
    // Wire the particle system into the mob manager so mob hits/kills spawn
    // demolition particles.
    mobs.setParticles(particles)

    // Corner minimap (canvas is always mounted; hidden until the game starts).
    const minimap = minimapCanvasRef.current ? new Minimap(minimapCanvasRef.current) : null

    const input: InputState = {
      forward: false, back: false, left: false, right: false,
      jump: false, sprint: false, crouch: false,
    }

    gameRef.current = {
      world, player, scene, camera, renderer, input, selectionMesh,
      dayNight, mobs, sound, post, particles, minimap,
      inventory: inventoryRef.current,
      dispose: () => {
        renderer.dispose()
        atlas.dispose()
        boxGeo.dispose()
        edges.dispose()
        lineMat.dispose()
        dayNight.dispose()
        mobs.dispose()
        sound.dispose()
        post.dispose()
        particles.dispose()
        minimap?.dispose()
        world.dispose()
        scene.traverse(obj => {
          if (obj instanceof THREE.Mesh) obj.geometry?.dispose?.()
        })
      },
    }

    if (typeof window !== 'undefined') {
      (window as unknown as { __game: unknown }).__game = gameRef.current
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
    let autoSaveAccum = 0
    let minimapAccum = 0

    const loop = () => {
      rafId = requestAnimationFrame(loop)
      const now = performance.now()
      const dt = (now - lastTime) / 1000
      lastTime = now

      if (playingRef.current) {
        player.update(world, input, dt)
        mobs.update(world, player, dayNight.isNight(), dt)
        dayNight.update(dt, player.position)
        particles.update(dt)
        // Endless terrain: stream chunks in around the player (budgeted).
        world.updateStreaming(scene, player.position.x, player.position.z, 2)

        // Footstep audio: when walking on ground, play a sound every ~0.35m.
        const horizSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z)
        if (player.onGround && horizSpeed > 0.5) {
          stepDistRef.current += horizSpeed * dt
          if (stepDistRef.current > 0.4) {
            sound.footstep()
            stepDistRef.current = 0
          }
        }

        // Underwater ambience boost.
        sound.setAmbientMultiplier(player.stats.headInWater ? 4 : 1)

        // Death check.
        if (player.stats.health <= 0 && !dead) {
          setDead(true)
          playingRef.current = false
          setPaused(true)
        }

        // Auto-save every 30 seconds.
        autoSaveAccum += dt
        if (autoSaveAccum > 30) {
          autoSaveAccum = 0
          world.save({
            x: player.position.x, y: player.position.y, z: player.position.z,
            yaw: player.yaw, pitch: player.pitch,
          })
        }
      } else {
        // Still update day/night for ambient feel on menus.
        dayNight.update(dt, player.position)
        // Keep updating particles so they finish their animation even if paused.
        particles.update(dt)
      }

      // Sync camera.
      player.getEyePosition(eyePos)
      camera.position.copy(eyePos)
      const q = new THREE.Quaternion()
      q.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'))
      camera.quaternion.copy(q)

      // Selection box.
      player.getLookDirection(lookDir)
      rayOrigin.copy(eyePos)
      const hit = world.raycast(rayOrigin, lookDir, 6)
      if (hit) {
        selectionMesh.visible = true
        selectionMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
      } else {
        selectionMesh.visible = false
      }

      // Gradually mesh dirty chunks (a few per frame).
      if (world.isMeshing) {
        world.meshDirtyChunks(scene, 3)
        setMeshProgress(world.meshProgress)
      }

      // Minimap redraw (~8 Hz).
      if (minimap) {
        minimapAccum += dt
        if (minimapAccum >= 0.12) {
          minimapAccum = 0
          minimap.update(
            world,
            mobs.mobs.map(m => ({ x: m.position.x, z: m.position.z, hostile: m.type === 'zombie' })),
            player.position.x, player.position.z, player.yaw,
          )
        }
      }

      // Render via post-processing composer (which includes the scene render
      // pass), or fall back to direct rendering for performance.
      if (post.enabled) {
        post.render()
      } else {
        renderer.render(scene, camera)
      }

      // FPS.
      frameCount++
      fpsAccum += dt
      if (fpsAccum >= 0.5) {
        setFps(Math.round(frameCount / fpsAccum))
        frameCount = 0
        fpsAccum = 0
      }

      // HUD updates (4 Hz).
      hudAccum += dt
      if (hudAccum >= 0.25) {
        hudAccum = 0
        setPosition({
          x: Math.floor(player.position.x),
          y: Math.floor(player.position.y),
          z: Math.floor(player.position.z),
        })
        setHealth(player.stats.health)
        setHunger(player.stats.hunger)
        setOxygen(player.stats.oxygen)
        setTimeOfDay(dayNight.timeOfDay)
        setIsNight(dayNight.isNight())
        setMobCount(mobs.mobs.length)
        setChunkCount(world.chunkCount)
        setFlying(player.flying)
      }
    }
    loop()

    // ----- Resize -----
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
      post.resize(window.innerWidth, window.innerHeight)
      minimap?.resize()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)

    // ----- Mouse look -----
    const onMouseMove = (e: MouseEvent) => {
      if (!playingRef.current) return
      if (supportsPointerLock() && document.pointerLockElement !== canvas) return
      const sens = settingsRef.current.sensitivity
      player.yaw -= e.movementX * sens
      player.pitch -= e.movementY * sens
      const limit = Math.PI / 2 - 0.01
      player.pitch = Math.max(-limit, Math.min(limit, player.pitch))
    }
    document.addEventListener('mousemove', onMouseMove)

    // ----- Pointer lock change -----
    const onPointerLockChange = () => {
      if (!supportsPointerLock()) return
      const isLocked = document.pointerLockElement === canvas
      if (isLocked) {
        playingRef.current = true
        setPaused(false)
        setShowMenu(false)
        sound.resume()
      } else {
        if (playingRef.current) {
          playingRef.current = false
          setPaused(true)
        }
      }
    }
    document.addEventListener('pointerlockchange', onPointerLockChange)

    // ----- Mouse click: break / place / attack -----
    const onMouseDown = (e: MouseEvent) => {
      if (!playingRef.current) return
      if (supportsPointerLock() && document.pointerLockElement !== canvas) return
      const g = gameRef.current
      if (!g) return
      player.getEyePosition(rayOrigin)
      player.getLookDirection(lookDir)

      if (e.button === 0) {
        // Left click: first try to hit a mob, else break a block.
        const hitMob = mobs.tryHitMob(rayOrigin, lookDir, 6)
        if (hitMob) {
          sound.collect()
          return
        }
        const hit = g.world.raycast(rayOrigin, lookDir, 6)
        if (!hit) return
        const b = g.world.getBlock(hit.x, hit.y, hit.z)
        if (b === 'bedrock') return
        // TNT: explode (3x3x3) instead of just breaking.
        if (b === 'tnt') {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dz = -1; dz <= 1; dz++) {
                const tb = g.world.getBlock(hit.x + dx, hit.y + dy, hit.z + dz)
                if (tb !== 'bedrock' && tb !== 'air') {
                  particles.spawn(tb, hit.x + dx, hit.y + dy, hit.z + dz, 8)
                  g.world.setBlockAndUpdate(g.scene, hit.x + dx, hit.y + dy, hit.z + dz, 'air')
                }
              }
            }
          }
          sound.explosion()
          // Damage nearby mobs.
          for (const m of mobs.mobs) {
            const mdx = m.position.x - (hit.x + 0.5)
            const mdy = m.position.y - (hit.y + 0.5)
            const mdz = m.position.z - (hit.z + 0.5)
            const md = Math.sqrt(mdx * mdx + mdy * mdy + mdz * mdz)
            if (md < 5) m.takeDamage(20)
          }
          // Damage player if too close.
          const pdx = player.position.x - (hit.x + 0.5)
          const pdy = player.position.y - (hit.y + 0.5)
          const pdz = player.position.z - (hit.z + 0.5)
          const pd = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz)
          if (pd < 5) player.takeDamage(Math.floor(15 - pd * 2), 'tnt')
          return
        }
        // Break the block + drop its item into the inventory.
        const drop = blockDropItem(b)
        if (drop) g.inventory.addItem(drop, 1)
        g.world.setBlockAndUpdate(g.scene, hit.x, hit.y, hit.z, 'air')
        particles.spawn(b, hit.x, hit.y, hit.z, 14)
        sound.blockBreak()
        setInvVersion(v => v + 1)
        // Vibrate on mobile.
        if (navigator.vibrate) navigator.vibrate(15)
      } else if (e.button === 2) {
        const hit = g.world.raycast(rayOrigin, lookDir, 6)
        if (!hit) return
        const clickedBlock = g.world.getBlock(hit.x, hit.y, hit.z)
        if (clickedBlock === 'chest') {
          let loot = g.world.getChestLoot(hit.x, hit.y, hit.z)
          if (!loot) {
            loot = generateDungeonLoot()
            g.world.setChestLoot(hit.x, hit.y, hit.z, loot)
          }
          setOpenChest({ pos: { x: hit.x, y: hit.y, z: hit.z }, slots: loot })
          playingRef.current = false
          setPaused(true)
          if (document.pointerLockElement) document.exitPointerLock?.()
          return
        }
        const px = hit.x + hit.nx
        const py = hit.y + hit.ny
        const pz = hit.z + hit.nz
        if (g.world.getBlock(px, py, pz) !== 'air') return
        if (Player.blockOverlapsPlayer(player.position.x, player.position.y, player.position.z, px, py, pz)) return
        // Place the selected hotbar block (consume from inventory).
        const held = g.inventory.getSelectedItem()
        if (!held) return
        const blockType = ITEMS[held.item].blockType
        g.world.setBlockAndUpdate(g.scene, px, py, pz, blockType)
        g.inventory.removeOneFromSelected()
        sound.blockPlace()
        setInvVersion(v => v + 1)
        if (navigator.vibrate) navigator.vibrate(10)
      }
    }
    canvas.addEventListener('mousedown', onMouseDown)

    // ----- Keyboard -----
    const onKeyDown = (e: KeyboardEvent) => {
      const g = gameRef.current
      if (!g) return
      const c = e.code
      const k = e.key.toLowerCase()
      if (c === 'Escape' || k === 'escape') {
        if (showInventoryRef.current) {
          // Close inventory first.
          setShowInventory(false)
          showInventoryRef.current = false
          playingRef.current = true
          setPaused(false)
          // Delay pointer lock to avoid browser security error
          if (supportsPointerLock() && !isMobile) {
            requestAnimationFrame(() => canvasRef.current?.requestPointerLock?.())
          }
        } else if (playingRef.current) {
          playingRef.current = false
          setPaused(true)
          setShowMenu(true)
          if (supportsPointerLock() && document.pointerLockElement === canvas) {
            document.exitPointerLock()
          }
        }
        return
      }
      // E: open/close inventory (works while playing OR while inventory is open).
      if (c === 'KeyE' || k === 'e') {
        if (playingRef.current) {
          setShowInventory(true)
          showInventoryRef.current = true
          playingRef.current = false
          setPaused(true)
          if (supportsPointerLock() && document.pointerLockElement === canvas) {
            document.exitPointerLock()
          }
        } else if (showInventoryRef.current) {
          setShowInventory(false)
          showInventoryRef.current = false
          playingRef.current = true
          setPaused(false)
          // Delay pointer lock to avoid browser security error
          if (supportsPointerLock() && !isMobile) {
            requestAnimationFrame(() => canvasRef.current?.requestPointerLock?.())
          }
        }
        return
      }
      // Toggle fly mode with double-tap Space (creative only).
      if ((c === 'Space' || k === ' ') && player.gameMode === 'creative') {
        const now = performance.now()
        if (now - lastJumpTapRef.current < 300) {
          player.flying = !player.flying
          player.velocity.y = 0
          setFlying(player.flying)
          if (player.flying) sound.jump()
        }
        lastJumpTapRef.current = now
      }
      if (c === 'KeyF') {
        // Toggle game mode (creative <-> survival).
        player.gameMode = player.gameMode === 'creative' ? 'survival' : 'creative'
        setGameMode(player.gameMode)
        if (player.gameMode === 'survival') player.flying = false
      }
      if (c === 'KeyM') {
        // Cycle the minimap zoom (2 → 1 → 4 px/block).
        gameRef.current?.minimap?.toggleZoom()
      }
      if (!playingRef.current) return
      if (c === 'KeyW' || c === 'ArrowUp' || k === 'w') input.forward = true
      else if (c === 'KeyS' || c === 'ArrowDown' || k === 's') input.back = true
      else if (c === 'KeyA' || c === 'ArrowLeft' || k === 'a') input.left = true
      else if (c === 'KeyD' || c === 'ArrowRight' || k === 'd') input.right = true
      else if (c === 'Space' || k === ' ') { input.jump = true; e.preventDefault() }
      else if (c === 'ShiftLeft' || c === 'ShiftRight' || k === 'shift') input.crouch = true
      else if (c === 'ControlLeft' || c === 'ControlRight' || k === 'control') input.sprint = true
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
      else if (c === 'ShiftLeft' || c === 'ShiftRight' || k === 'shift') input.crouch = false
      else if (c === 'ControlLeft' || c === 'ControlRight' || k === 'control') input.sprint = false
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

    const onContext = (e: Event) => e.preventDefault()
    canvas.addEventListener('contextmenu', onContext)

    // ----- Mobile touch look -----
    // Look-drag works on most of the screen, EXCEPT the bottom-left D-pad
    // zone and bottom-right action-button zone where the mobile controls live.
    let touchLookId: number | null = null
    let touchLastX = 0
    let touchLastY = 0
    const isInControlZone = (x: number, y: number): boolean => {
      const w = window.innerWidth
      const h = window.innerHeight
      // Bottom-left D-pad: 0..180px wide, bottom 200px tall.
      if (x < 180 && y > h - 200) return true
      // Bottom-right action buttons: right 240px, bottom 200px tall.
      if (x > w - 240 && y > h - 200) return true
      // Top-left HUD: 220px wide, 100px tall.
      if (x < 220 && y < 100) return true
      // Top-right buttons + minimap: 190px wide, 240px tall.
      if (x > w - 190 && y < 240) return true
      // Bottom hotbar: center, 80px tall.
      if (y > h - 80) return true
      return false
    }
    const onTouchStart = (e: TouchEvent) => {
      if (!playingRef.current) return
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        // Accept look-drag anywhere that's NOT a control zone.
        if (!isInControlZone(t.clientX, t.clientY) && touchLookId === null) {
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
          const sens = settingsRef.current.sensitivity * 2.5
          player.yaw -= dx * sens
          player.pitch -= dy * sens
          const limit = Math.PI / 2 - 0.01
          player.pitch = Math.max(-limit, Math.min(limit, player.pitch))
        }
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchLookId) touchLookId = null
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
  }, [worldSeed, gameMode])

  useEffect(() => {
    setIsMobile(isTouchDevice() || !supportsPointerLock())
  }, [])

  // ----- Mobile action handlers -----
  const mobileBreak = useCallback(() => {
    const g = gameRef.current
    if (!g || !playingRef.current) return
    const eye = new THREE.Vector3()
    g.player.getEyePosition(eye)
    const look = new THREE.Vector3()
    g.player.getLookDirection(look)
    // Try mob first.
    if (g.mobs.tryHitMob(eye, look, 6)) {
      g.sound.collect()
      if (navigator.vibrate) navigator.vibrate(15)
      return
    }
    const hit = g.world.raycast(eye, look, 6)
    if (!hit) return
    const b = g.world.getBlock(hit.x, hit.y, hit.z)
    if (b === 'bedrock') return
    if (b === 'tnt') {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const tb = g.world.getBlock(hit.x + dx, hit.y + dy, hit.z + dz)
        if (tb !== 'bedrock' && tb !== 'air') {
          g.particles.spawn(tb, hit.x + dx, hit.y + dy, hit.z + dz, 8)
          g.world.setBlockAndUpdate(g.scene, hit.x + dx, hit.y + dy, hit.z + dz, 'air')
        }
      }
      g.sound.explosion()
      return
    }
    // Drop item + break block.
    const drop = blockDropItem(b)
    if (drop) g.inventory.addItem(drop, 1)
    g.world.setBlockAndUpdate(g.scene, hit.x, hit.y, hit.z, 'air')
    g.particles.spawn(b, hit.x, hit.y, hit.z, 14)
    g.sound.blockBreak()
    setInvVersion(v => v + 1)
    if (navigator.vibrate) navigator.vibrate(15)
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
    const clickedBlock = g.world.getBlock(hit.x, hit.y, hit.z)
    if (clickedBlock === 'chest') {
      let loot = g.world.getChestLoot(hit.x, hit.y, hit.z)
      if (!loot) {
        loot = generateDungeonLoot()
        g.world.setChestLoot(hit.x, hit.y, hit.z, loot)
      }
      setOpenChest({ pos: { x: hit.x, y: hit.y, z: hit.z }, slots: loot })
      playingRef.current = false
      setPaused(true)
      return
    }
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz
    if (g.world.getBlock(px, py, pz) !== 'air') return
    if (Player.blockOverlapsPlayer(g.player.position.x, g.player.position.y, g.player.position.z, px, py, pz)) return
    const held = g.inventory.getSelectedItem()
    if (!held) return
    g.world.setBlockAndUpdate(g.scene, px, py, pz, ITEMS[held.item].blockType)
    g.inventory.removeOneFromSelected()
    g.sound.blockPlace()
    setInvVersion(v => v + 1)
    if (navigator.vibrate) navigator.vibrate(10)
  }, [])

  const mobileJumpDown = useCallback(() => {
    if (gameRef.current) gameRef.current.input.jump = true
  }, [])
  const mobileJumpUp = useCallback(() => {
    if (gameRef.current) gameRef.current.input.jump = false
  }, [])

  // ----- Game flow handlers -----
  const startGame = useCallback((mode: GameMode = 'survival') => {
    setGameMode(mode)
    if (gameRef.current) {
      gameRef.current.player.gameMode = mode
      if (mode === 'creative') gameRef.current.player.flying = false
    }
    // Give starter kit.
    const inv = inventoryRef.current
    inv.clear()
    inv.giveStarterKit()
    setInvVersion(v => v + 1)
    setStarted(true)
    setPaused(false)
    setShowMenu(false)
    setDead(false)
    playingRef.current = true
    if (gameRef.current) {
      gameRef.current.sound.init()
      gameRef.current.sound.startAmbient()
      gameRef.current.sound.resume()
    }
    if (supportsPointerLock() && !isMobile) {
      requestAnimationFrame(() => canvasRef.current?.requestPointerLock?.())
    }
  }, [isMobile])

  const resume = useCallback(() => {
    setPaused(false)
    setShowMenu(false)
    setDead(false)
    playingRef.current = true
    if (gameRef.current) gameRef.current.sound.resume()
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
    // Save when opening the menu.
    const g = gameRef.current
    if (g) {
      g.world.save({
        x: g.player.position.x, y: g.player.position.y, z: g.player.position.z,
        yaw: g.player.yaw, pitch: g.player.pitch,
      })
      setHasSave(true)
    }
  }, [])

  const restartGame = useCallback(() => {
    playingRef.current = false
    setStarted(false)
    setPaused(false)
    setShowMenu(false)
    setDead(false)
    World.clearSave()
    setHasSave(false)
    setWorldSeed(s => s + 1)
  }, [])

  const continueFromSave = useCallback(() => {
    setStarted(true)
    setPaused(false)
    setShowMenu(false)
    setDead(false)
    playingRef.current = true
    if (gameRef.current) {
      gameRef.current.sound.init()
      gameRef.current.sound.startAmbient()
    }
    if (supportsPointerLock() && !isMobile) {
      requestAnimationFrame(() => canvasRef.current?.requestPointerLock?.())
    }
  }, [isMobile])

  const respawn = useCallback(() => {
    const g = gameRef.current
    if (!g) return
    const sx = Math.floor(WORLD_SIZE_X / 2) + 0.5
    const sz = Math.floor(WORLD_SIZE_Z / 2) + 0.5
    // Endless world: the spawn chunks may have streamed out while exploring —
    // synchronously regenerate + remesh the 3×3 area so respawn isn't a void.
    g.world.ensureAreaReady(g.scene, Math.floor(sx), Math.floor(sz))
    // Get highest solid block, but ensure spawn is above water level
    // so player doesn't respawn underwater.
    const groundY = g.world.highestBlockY(Math.floor(sx), Math.floor(sz)) + 1
    const sy = Math.max(groundY, WATER_LEVEL + 1)
    g.player.respawn(sx, sy, sz)
    setDead(false)
    setPaused(false)
    setShowMenu(false)
    playingRef.current = true
    if (supportsPointerLock() && !isMobile) {
      canvasRef.current?.requestPointerLock?.()
    }
  }, [isMobile])

  const selectSlot = useCallback((n: number) => {
    selectedSlotRef.current = n
    setSelectedSlot(n)
  }, [])

  const setMove = useCallback((key: 'forward' | 'back' | 'left' | 'right', val: boolean) => {
    if (gameRef.current) gameRef.current.input[key] = val
  }, [])

  const toggleFly = useCallback(() => {
    const g = gameRef.current
    if (!g) return
    if (g.player.gameMode !== 'creative') return
    g.player.flying = !g.player.flying
    g.player.velocity.y = 0
    setFlying(g.player.flying)
  }, [])

  const active = started && !paused

  // ----- Health/Hunger/Oxygen bars -----
  const hearts = Array.from({ length: 10 }, (_, i) => {
    const v = health - i * 2
    if (v >= 2) return 'full'
    if (v === 1) return 'half'
    return 'empty'
  })
  const drumsticks = Array.from({ length: 10 }, (_, i) => {
    const v = hunger - i * 2
    if (v >= 2) return 'full'
    if (v === 1) return 'half'
    return 'empty'
  })
  const bubbles = Array.from({ length: 10 }, (_, i) => {
    return oxygen - i >= 1 ? 'full' : 'empty'
  })

  // Time of day as HH:MM
  const totalMin = Math.floor(timeOfDay * 24 * 60)
  const hh = Math.floor(totalMin / 60).toString().padStart(2, '0')
  const mm = (totalMin % 60).toString().padStart(2, '0')

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#8fc4ff] select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
        style={{ touchAction: 'none' }}
      />

      {/* Crosshair */}
      {hudReady && active && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="crosshair">
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
          <div>Map: <span className="text-amber-300 font-semibold">{selectedMap === 'tokyo' ? '🇯🇵 Tokyo' : selectedMap === 'seoul' ? '🇰🇷 Seoul' : '🌲 Wilderness'}</span></div>
          <div>Block: {BLOCKS[HOTBAR_BLOCKS[selectedSlot]]?.name ?? 'Air'}</div>
          <div>Time: {hh}:{mm} {isNight ? '🌙' : '☀️'}</div>
          <div>Mode: {gameMode}{flying ? ' ✈' : ''}</div>
          <div>Mobs: {mobCount}</div>
          <div>Chunks: <span className="text-sky-300">{chunkCount}</span> <span className="text-white/40">({settings.unlimitedMap ? 'unlimited' : 'fixed'})</span></div>
        </div>
      )}

      {/* Top-right: menu + settings buttons, minimap, controls */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
        {hudReady && started && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="pointer-events-auto px-3 py-1.5 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs font-mono ring-1 ring-white/20 backdrop-blur-sm"
              aria-label="Settings"
            >
              ⚙ Settings
            </button>
            <button
              onClick={openMenu}
              className="pointer-events-auto px-3 py-1.5 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs font-mono ring-1 ring-white/20 backdrop-blur-sm"
              aria-label="Open menu"
            >
              ☰ Menu
            </button>
          </div>
        )}
        {/* Minimap — click to cycle zoom */}
        <canvas
          ref={minimapCanvasRef}
          onClick={() => gameRef.current?.minimap?.toggleZoom()}
          className={`w-32 h-32 sm:w-40 sm:h-40 rounded-lg ring-2 ring-white/25 shadow-lg shadow-black/40 bg-[#10141f] cursor-pointer ${hudReady && started ? 'pointer-events-auto' : 'invisible'}`}
          aria-label="Minimap — click to zoom"
          data-testid="minimap"
        />
        {hudReady && started && active && !isMobile && (
          <div className="font-mono text-[11px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] text-right space-y-0.5">
            <div>WASD — move · Ctrl — sprint</div>
            <div>Space — jump · Shift — crouch</div>
            <div>Double-Space — fly (creative)</div>
            <div>F — toggle creative</div>
            <div>L-click — break/attack · R-click — place</div>
            <div>1-9 / wheel — select block</div>
            <div>Esc — pause · E — inventory</div>
            <div>M — minimap zoom</div>
          </div>
        )}
      </div>

      {/* Bottom-left: health/hunger/oxygen bars (survival only) */}
      {hudReady && active && gameMode === 'survival' && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none">
          <div className="flex gap-0.5">
            {hearts.map((h, i) => (
              <span key={`h${i}`} className="text-sm" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.9))' }}>
                {h === 'full' ? '❤️' : h === 'half' ? '💔' : '🤍'}
              </span>
            ))}
          </div>
          <div className="flex gap-0.5">
            {drumsticks.map((d, i) => (
              <span key={`h${i}`} className="text-sm" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.9))' }}>
                {d === 'full' ? '🍗' : d === 'half' ? '🍖' : '🦴'}
              </span>
            ))}
          </div>
          {oxygen < 10 && (
            <div className="flex gap-0.5">
              {bubbles.map((b, i) => (
                <span key={`b${i}`} className="text-sm">
                  {b === 'full' ? '💧' : '•'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hotbar — backed by inventory (last 12 slots) */}
      {hudReady && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 p-1.5 bg-black/40 backdrop-blur-sm rounded-md ring-1 ring-white/10 max-w-[95vw] overflow-x-auto" key={invVersion}>
          {Array.from({ length: HOTBAR_SIZE }).map((_, i) => {
            const slot = inventoryRef.current.slots[MAIN_SIZE + i]
            return (
              <button
                key={i}
                data-testid="hotbar-slot"
                data-slot-index={i}
                onClick={() => selectSlot(i)}
                className={`relative flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-sm border-2 transition-colors ${
                  i === selectedSlot ? 'border-white bg-white/15' : 'border-white/20 bg-black/30 hover:border-white/50'
                }`}
                title={slot ? ITEMS[slot.item].name : 'Empty'}
              >
                {slot && (
                  <>
                    <img
                      src={tileDataUrl(ITEMS[slot.item].iconTile)}
                      alt={ITEMS[slot.item].name}
                      className="w-full h-full object-cover pixelated"
                      style={{ imageRendering: 'pixelated' }}
                      draggable={false}
                    />
                    {slot.count > 1 && (
                      <span className="absolute bottom-0 right-0.5 text-[10px] font-mono text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                        {slot.count}
                      </span>
                    )}
                  </>
                )}
                <span className="absolute top-0 left-0.5 text-[9px] font-mono text-white/40">
                  {i + 1 <= 9 ? i + 1 : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Mobile controls */}
      {hudReady && isMobile && active && (
        <>
          <div className="absolute bottom-24 left-4 grid grid-cols-3 grid-rows-3 gap-1 w-32 h-32 pointer-events-auto">
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
          <div className="absolute bottom-24 right-4 flex flex-col items-end gap-2 pointer-events-auto">
            <button
              onTouchStart={(e) => { e.preventDefault(); mobileBreak() }}
              className="w-14 h-14 rounded-full bg-red-500/80 active:bg-red-500 ring-2 ring-white/40 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold"
              aria-label="Break block"
            >⛏</button>
            <div className="flex gap-2">
              <button
                onTouchStart={(e) => { e.preventDefault(); if (gameRef.current) gameRef.current.input.sprint = true }}
                onTouchEnd={(e) => { e.preventDefault(); if (gameRef.current) gameRef.current.input.sprint = false }}
                className="w-12 h-12 rounded-full bg-purple-500/70 active:bg-purple-500 ring-2 ring-white/40 backdrop-blur-sm flex items-center justify-center text-white text-xs font-bold"
                aria-label="Sprint"
              >Run</button>
              <button
                onTouchStart={(e) => { e.preventDefault(); mobileJumpDown() }}
                onTouchEnd={(e) => { e.preventDefault(); mobileJumpUp() }}
                className="w-14 h-14 rounded-full bg-sky-500/80 active:bg-sky-500 ring-2 ring-white/40 backdrop-blur-sm flex items-center justify-center text-white text-xl font-bold"
                aria-label="Jump"
              >↑</button>
              <button
                onTouchStart={(e) => { e.preventDefault(); mobilePlace() }}
                className="w-14 h-14 rounded-full bg-emerald-500/80 active:bg-emerald-500 ring-2 ring-white/40 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold"
                aria-label="Place block"
              >+</button>
            </div>
            {gameMode === 'creative' && (
              <button
                onTouchStart={(e) => { e.preventDefault(); toggleFly() }}
                className={`w-12 h-12 rounded-full ${flying ? 'bg-yellow-500' : 'bg-white/15'} active:bg-yellow-400 ring-2 ring-white/40 backdrop-blur-sm flex items-center justify-center text-white text-xl`}
                aria-label="Toggle fly"
              >✈</button>
            )}
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-16 pointer-events-none font-mono text-[10px] text-white/30 text-center">
            drag anywhere to look
          </div>
        </>
      )}

      {/* World loading overlay */}
      {started && meshProgress < 1 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-30 pointer-events-none">
          <div className="text-center">
            <div className="text-white font-mono text-lg mb-3">
              {selectedMap === 'tokyo' ? 'Building Tokyo Megacity…' : selectedMap === 'seoul' ? 'Building Seoul City…' : 'Generating Wilderness…'}
            </div>
            <div className="w-64 h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.round(meshProgress * 100)}%` }} />
            </div>
            <div className="text-white/60 font-mono text-xs mt-2">{Math.round(meshProgress * 100)}%</div>
          </div>
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-sky-900/80 to-emerald-950/80 backdrop-blur-sm p-4">
          <div className="max-w-lg w-full p-6 sm:p-8 rounded-2xl bg-black/60 ring-1 ring-white/15 shadow-2xl text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-1" style={{ fontFamily: 'monospace' }}>
              VOXEL<span className="text-emerald-400">CRAFT</span>
            </h1>
            <p className="text-white/60 text-xs sm:text-sm mb-4 font-mono">Build · mine · explore · survive</p>

            {/* Map Selection */}
            <div className="mb-5 p-2 bg-white/5 rounded-xl border border-white/10">
              <div className="text-white/70 text-xs font-mono mb-2">Select World Map</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    setSelectedMap('seoul')
                    selectedMapRef.current = 'seoul'
                    try { localStorage.setItem('voxelcraft_selected_map', 'seoul') } catch {}
                    World.clearSave()
                    setHasSave(false)
                    setWorldSeed(s => s + 1)
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-mono font-bold transition-all ${
                    selectedMap === 'seoul'
                      ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-300 scale-102'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  🇰🇷 Seoul
                </button>
                <button
                  onClick={() => {
                    setSelectedMap('tokyo')
                    selectedMapRef.current = 'tokyo'
                    try { localStorage.setItem('voxelcraft_selected_map', 'tokyo') } catch {}
                    World.clearSave()
                    setHasSave(false)
                    setWorldSeed(s => s + 1)
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-mono font-bold transition-all ${
                    selectedMap === 'tokyo'
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 ring-2 ring-rose-300 scale-102'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  🇯🇵 Tokyo
                </button>
                <button
                  onClick={() => {
                    setSelectedMap('wilderness')
                    selectedMapRef.current = 'wilderness'
                    try { localStorage.setItem('voxelcraft_selected_map', 'wilderness') } catch {}
                    World.clearSave()
                    setHasSave(false)
                    setWorldSeed(s => s + 1)
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-mono font-bold transition-all ${
                    selectedMap === 'wilderness'
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 ring-2 ring-amber-300 scale-102'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  🌲 Wild
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 mb-5">
              <button
                onClick={() => startGame('survival')}
                className="px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-lg transition-colors shadow-lg shadow-emerald-500/30"
              >
                New Survival Game
              </button>
              <button
                onClick={() => startGame('creative')}
                className="px-8 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-bold transition-colors"
              >
                New Creative Game
              </button>
              {hasSave && (
                <button
                  onClick={continueFromSave}
                  className="px-8 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors"
                >
                  Continue Saved Game
                </button>
              )}
            </div>
            {isMobile ? (
              <div className="grid grid-cols-2 gap-2 text-left text-xs text-white/80 font-mono mb-3">
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">D-pad</span> — Move</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Drag right</span> — Look</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">↑</span> — Jump</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">⛏</span> — Mine/Attack</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">+</span> — Place / Chest</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Run</span> — Sprint</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-left text-xs sm:text-sm text-white/80 font-mono mb-3">
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">WASD</span> — Move</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Mouse</span> — Look</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Space</span> — Jump</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Shift</span> — Crouch</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">Ctrl</span> — Sprint</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">F</span> — Toggle mode</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">L-Click</span> — Mine/Attack</div>
                <div className="bg-white/5 rounded p-2"><span className="text-emerald-300">R-Click</span> — Place / Open Chest</div>
              </div>
            )}
            <p className="text-white/40 text-xs mt-4 font-mono">
              {isMobile ? 'Tap a button to start · World auto-saves' : 'Click a button to start · World auto-saves every 30s'}
            </p>
          </div>
        </div>
      )}

      {/* Pause / in-game menu overlay */}
      {started && paused && !dead && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="max-w-sm w-full p-6 rounded-2xl bg-zinc-900/90 ring-1 ring-white/15 shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-white mb-1 font-mono">
              {showSettings ? '' : showMenu ? 'Menu' : 'Paused'}
            </h2>
            <p className="text-white/50 text-xs mb-5 font-mono">
              Position: {position.x} / {position.y} / {position.z} · {hh}:{mm}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={resume}
                className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors"
              >
                Resume
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="px-6 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-bold transition-colors"
              >
                Settings
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
          </div>
        </div>
      )}

      {/* Death overlay */}
      {dead && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/80 backdrop-blur-sm p-4">
          <div className="max-w-sm w-full p-8 rounded-2xl bg-black/80 ring-1 ring-red-500/30 shadow-2xl text-center">
            <h2 className="text-4xl font-bold text-red-400 mb-2 font-mono">You Died</h2>
            <p className="text-white/60 text-sm mb-6 font-mono">
              Final position: {position.x} / {position.y} / {position.z}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={respawn}
                className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors"
              >
                Respawn
              </button>
              <button
                onClick={restartGame}
                className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors"
              >
                New World
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory UI */}
      {showInventory && hudReady && (
        <InventoryUI
          inventory={inventoryRef.current}
          onClose={() => {
            setShowInventory(false)
            showInventoryRef.current = false
            playingRef.current = true
            setPaused(false)
            if (supportsPointerLock() && !isMobile) canvasRef.current?.requestPointerLock?.()
            setInvVersion(v => v + 1)
          }}
          onChange={() => setInvVersion(v => v + 1)}
        />
      )}

      {/* Chest Loot UI */}
      {openChest && hudReady && (
        <ChestUI
          chestPos={openChest.pos}
          chestSlots={openChest.slots}
          playerInventory={inventoryRef.current}
          onClose={() => {
            setOpenChest(null)
            playingRef.current = true
            setPaused(false)
            if (supportsPointerLock() && !isMobile) canvasRef.current?.requestPointerLock?.()
            setInvVersion(v => v + 1)
          }}
          onChange={() => setInvVersion(v => v + 1)}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 z-50">
          <div className="max-w-md w-full p-6 rounded-2xl bg-zinc-900/95 ring-1 ring-white/15 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4 font-mono text-center">Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="text-white/80 text-sm font-mono flex justify-between">
                  <span>Field of View</span>
                  <span className="text-emerald-300">{settings.fov}°</span>
                </label>
                <input
                  type="range" min={50} max={110} value={settings.fov}
                  onChange={(e) => saveSettings({ ...settings, fov: parseInt(e.target.value, 10) })}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div>
                <label className="text-white/80 text-sm font-mono flex justify-between">
                  <span>Mouse Sensitivity</span>
                  <span className="text-emerald-300">{(settings.sensitivity * 1000).toFixed(1)}</span>
                </label>
                <input
                  type="range" min={5} max={50} value={Math.round(settings.sensitivity * 10000)}
                  onChange={(e) => saveSettings({ ...settings, sensitivity: parseInt(e.target.value, 10) / 10000 })}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div>
                <label className="text-white/80 text-sm font-mono flex justify-between">
                  <span>Render Distance</span>
                  <span className="text-emerald-300">{settings.renderDistance} blocks</span>
                </label>
                <input
                  type="range" min={48} max={176} step={16} value={settings.renderDistance}
                  onChange={(e) => saveSettings({ ...settings, renderDistance: parseInt(e.target.value, 10) })}
                  className="w-full accent-emerald-500"
                />
                <p className="text-white/40 text-[11px] font-mono mt-1">World streams endlessly — this sets how far terrain and fog reach.</p>
              </div>
              <div>
                <label className="text-white/80 text-sm font-mono flex justify-between">
                  <span>Volume</span>
                  <span className="text-emerald-300">{Math.round(settings.volume * 100)}%</span>
                </label>
                <input
                  type="range" min={0} max={100} value={Math.round(settings.volume * 100)}
                  onChange={(e) => saveSettings({ ...settings, volume: parseInt(e.target.value, 10) / 100 })}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-white/80 text-sm font-mono">Sound Enabled</label>
                <button
                  onClick={() => saveSettings({ ...settings, soundEnabled: !settings.soundEnabled })}
                  className={`px-4 py-1.5 rounded-md text-sm font-mono transition-colors ${
                    settings.soundEnabled ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white'
                  }`}
                >
                  {settings.soundEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-white/80 text-sm font-mono">Post-Processing</label>
                <button
                  onClick={() => saveSettings({ ...settings, postProcessing: !settings.postProcessing })}
                  className={`px-4 py-1.5 rounded-md text-sm font-mono transition-colors ${
                    settings.postProcessing ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white'
                  }`}
                >
                  {settings.postProcessing ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-white/80 text-sm font-mono">Bloom (glow)</label>
                <button
                  onClick={() => saveSettings({ ...settings, bloom: !settings.bloom })}
                  className={`px-4 py-1.5 rounded-md text-sm font-mono transition-colors ${
                    settings.bloom ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white'
                  }`}
                >
                  {settings.bloom ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <div>
                  <label className="text-white/80 text-sm font-mono block">Unlimited Map</label>
                  <span className="text-white/40 text-[11px] font-mono block">Endless chunk streaming (turn OFF for best FPS)</span>
                </div>
                <button
                  onClick={() => saveSettings({ ...settings, unlimitedMap: !settings.unlimitedMap })}
                  className={`px-4 py-1.5 rounded-md text-sm font-mono transition-colors ${
                    settings.unlimitedMap ? 'bg-emerald-500 text-black font-semibold' : 'bg-white/10 text-white'
                  }`}
                >
                  {settings.unlimitedMap ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="mt-6 w-full px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
