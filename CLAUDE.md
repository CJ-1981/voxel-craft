# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VoxelCraft is a browser-based Minecraft-style voxel game built with Next.js 16, TypeScript, and Three.js. It features procedural terrain generation, survival/creative modes, mobs (sheep/zombies), day/night cycle, and save/load persistence—all without external assets (textures and sounds are procedurally generated).

**Technology Stack:**
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript 5
- **3D Rendering**: Three.js r185 with custom chunk meshing
- **Styling**: Tailwind CSS 4 + shadcn/ui components
- **Database**: Prisma + SQLite (User/Post models—minimal backend)
- **Runtime**: Bun (package manager and runtime)

## Development Commands

```bash
# Development (port 3000, logs to dev.log)
bun run dev

# Production build
bun run build

# Start production server (standalone mode)
bun run start

# Linting
bun run lint

# Database operations
bun run db:push      # Push schema changes (accepts data loss)
bun run db:generate  # Generate Prisma client
bun run db:migrate   # Run migrations
bun run db:reset     # Reset database
```

## Game Engine Architecture

The game engine is modular, located in `src/lib/game/`:

### Core Systems

**`blocks.ts`** — Block type definitions (30+ blocks). Key points:
- Block types have flags: `solid`, `transparent`, `translucent`, `liquid`, `cross`, `slab`, `light`
- `HOTBAR_BLOCKS` defines the creative hotbar order
- When adding new block types: append to `BlockType`, add to `BLOCKS`, extend atlas in `textures.ts`

**`textures.ts`** — Procedural 16×16 pixel-art texture atlas (4×8 grid, 32 tiles):
- All textures generated via Canvas API—no external assets
- Uses `NearestFilter` for crisp pixel art look
- Each block defines `[top, side, bottom]` tile indices
- When adding blocks: extend atlas to 4×9 (36 tiles) or beyond, add drawing functions

**`world.ts`** — World data, terrain generation, chunk meshing:
- Fixed-size world: 208×48×208 blocks (configurable via `WORLD_SIZE_*`)
- Chunk-based meshing: 16×16×16 chunks, separate opaque/cutout/translucent passes
- Face culling: only renders faces between different render-pass blocks
- Supports biomes (plains, forest, desert, snow, ocean), caves, ore veins
- DDA voxel raycasting for block targeting
- Save/load via `localStorage` (base64-encoded ~262KB per save)
- When modifying world serialization: update `SAVE_KEY` version to invalidate old saves

**`player.ts`** — Physics, collision, survival stats:
- AABB collision with swept-axis tests
- Gravity, jumping, swimming, flying (creative mode)
- Health/hunger/oxygen system with fall damage, drowning, starvation
- `blockOverlapsPlayer()` helper checks safe placement

**`mobs.ts`** — Sheep (passive) and zombies (hostile):
- AABB physics, wander AI, aggro when player within range
- Zombies spawn at night, despawn when far from player
- Build box-based models (body/head/legs)

**`daynight.ts`** — Day/night cycle:
- Animated sun/moon orbit, sky color interpolation (day/sunset/night)
- Star field, dynamic lighting intensity
- Default 8-minute day cycle

**`sound.ts`** — Procedural Web Audio API sounds:
- White noise bursts (footsteps, block break/place)
- Oscillator tones (jump, damage, explosion)
- Ambient wind/water loops

**`particles.ts`** — Break particles (blocks, mobs):
- Colored cube particles with gravity and tumbling
- Spawns on block break and mob hit/kill

**`postprocessing.ts`** — Bloom + FXAA + vignette:
- Uses Three.js EffectComposer
- Disabled by default for performance

**`items.ts`** + **`inventory.ts`** — Item system:
- `ItemType` = `block:${BlockType}` pattern
- 39-slot inventory (27 main + 12 hotbar)
- Drag-and-drop UI in `InventoryUI.tsx`

**`seoul.ts`** — Landmark generator:
- Procedurally builds N Seoul Tower, Lotte World Tower, etc. at fixed offsets

### Game Component

**`src/components/game/MinecraftGame.tsx`** — Main game component (~1500 lines):
- Integrates all game systems
- Handles input (desktop: WASD + mouse; mobile: touch D-pad + buttons)
- Pointer lock management (with fallback for touch devices)
- HUD: crosshair, hotbar, FPS, position, time, health/hunger
- Game loop: physics → mobs → particles → day/night → render
- Save/load persistence, death/respawn, menu system

### Key Architectural Patterns

**Three Render Passes:**
1. Opaque (grass, dirt, stone, etc.) — `MeshLambertMaterial`, `alphaTest: 0.5`
2. Cutout (leaves) — `alphaTest: 0.5`, `DoubleSide`, `depthWrite: true`
3. Translucent (water, glass, ice) — `transparent: true`, `opacity: 0.75`, `depthWrite: true`

**Chunk Meshing:**
- Chunks are 16×16×16, rebuild only on edit
- Boundary chunks rebuild when neighbor edits cross chunk borders
- Index winding order matters: `(0,2,1)(0,3,2)` for outward-facing normals

**Mobile Support:**
- Touch detection: `'ontouchstart' in window`, `navigator.maxTouchPoints`, `matchMedia('(pointer: coarse)')`
- Virtual D-pad (left half), look drag (right half), action buttons
- No pointer lock on iOS Safari—uses `playingRef` state instead

**Save System:**
- World data → base64 → `localStorage` key `voxelcraft_world_v1`
- Metadata (seed, player pos/rotation) → `voxelcraft_meta_v1`
- Auto-saves every 30s during play

**Texture Atlas:**
- 4-column layout, rows grow as needed (currently 8 rows = 32 tiles)
- UV calculation: `tileUV(tileIndex)` → normalized coordinates

## Adding New Features

**New Block Type:**
1. Add to `BlockType` union in `blocks.ts`
2. Define in `BLOCKS` with appropriate flags
3. Add texture drawing function in `textures.ts` and increment `ATLAS_ROWS` if needed
4. Add to `HOTBAR_BLOCKS` or `ALL_BLOCK_ITEMS` if placeable

**New Mob Type:**
1. Add to `MobType` union
2. Add `build<Model>Model()` static method
3. Wire up spawn conditions in `MobManager.update()`

**New Biome:**
1. Add to `BiomeType` union
2. Define in `BIOMES` with surface/cactus/flower rates
3. Update biome noise thresholds in `generateWorld()`

## Important File Locations

- Game entry point: `src/app/page.tsx` (uses `dynamic` import for SSR exclusion)
- Tailwind config: `tailwind.config.ts`, `postcss.config.mjs`
- Prisma schema: `prisma/schema.prisma`
- ESLint config: `eslint.config.mjs`
- Next config: `next.config.ts` (standalone output, build errors ignored)

## Testing Notes

The project has minimal test infrastructure. Use the browser dev console and in-game testing for verification. The game runs in headless browsers (Agent Browser) with ~8-11 FPS due to software WebGL—real browsers with GPU acceleration achieve 60 FPS.

## Known Limitations

- Fixed world size (not infinite)
- No multiplayer
- No redstone/wiring system
- Post-processing disabled by default for performance

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
