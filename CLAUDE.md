# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VoxelCraft is a browser-based Minecraft-style voxel game built with Next.js 16, TypeScript, and Three.js. It features procedurally generated streaming terrain, selectable city maps (Seoul / Tokyo / Wilderness), natural structures and dungeons with loot chests, lava/water fluid interaction, survival/creative modes, mobs (sheep/zombies), day/night cycle, and save/load persistence—all without external assets (textures and sounds are procedurally generated).

**Technology Stack:**
- **Frontend**: Next.js 16 (App Router, static export), React 19, TypeScript 5
- **3D Rendering**: Three.js r185 with custom chunk meshing
- **Styling**: Tailwind CSS 4 + shadcn/ui components
- **Database**: Prisma + SQLite (User/Post models—minimal backend)
- **Runtime**: Bun (package manager and runtime)
- **E2E tests**: Playwright

## Development Commands

```bash
# Development (port 3000 — app is served at http://localhost:3000/voxel-craft due to basePath)
bun run dev

# Production build (static export to out/)
bun run build

# Linting
bun run lint

# E2E tests (Playwright; auto-starts the dev server, runs serially, chromium only)
bun run test
bun run test:ui          # interactive UI mode
bun run test:headed      # visible browser
bun run test:debug       # step-through debugger
bunx playwright test tests/e2e/game.spec.ts  # single test file

# Database operations
bun run db:push      # Push schema changes (accepts data loss)
bun run db:generate  # Generate Prisma client
bun run db:migrate   # Run migrations
bun run db:reset     # Reset database
```

**Deployment**: static GitHub Pages via `.github/workflows/deploy.yml`. `next.config.ts` sets `output: "export"`, `basePath: "/voxel-craft"`, and ignores TS build errors. All URLs (links, assets, Playwright `baseURL`) must include the `/voxel-craft` prefix.

## Game Engine Architecture

The game engine is modular, located in `src/lib/game/`:

### Core Systems

**`blocks.ts`** — Block type definitions (40+ blocks). Key points:
- Block types have flags: `solid`, `transparent`, `translucent`, `liquid`, `cross`, `slab`, `light`
- `HOTBAR_BLOCKS` defines the creative hotbar order
- When adding new block types: append to `BlockType`, add to `BLOCKS`, extend atlas in `textures.ts`

**`textures.ts`** — Procedural 16×16 pixel-art texture atlas (4×12 grid, 48 tiles):
- All textures generated via Canvas API—no external assets
- Uses `NearestFilter` for crisp pixel art look
- Each block defines `[top, side, bottom]` tile indices
- When adding blocks: increment `ATLAS_ROWS`/`ATLAS_TILES` and add drawing functions

**`world.ts`** — World data, terrain generation, chunk streaming, meshing, persistence:
- **Endless chunk streaming**: chunks (16×16 columns, full height) generate around the player and unload when far away. X/Z are unbounded; Y is hard-capped at `WORLD_SIZE_Y = 48`. `WORLD_SIZE_X/Z` (208) are legacy—city maps center on (104, 104).
- **Generation is fully deterministic from the seed**: noise fields are seeded once and sampled by absolute coordinates, so a chunk regenerates identically any time it reloads. Player edits live in a separate per-chunk overlay (`edits`), reapplied on generation.
- **`genClip` pattern**: during chunk generation, `setBlock` writes are clipped to the chunk being built so cross-chunk structures (trees, pyramids) regenerate identically from whichever chunk builds them.
- Separate opaque/cutout/translucent render passes with face culling between different-pass blocks
- Biomes (plains, forest, desert, snow, ocean), 3D caves, ore veins, DDA voxel raycasting for block targeting
- **Fluid interaction** in `setBlockAndUpdate()`: placing lava adjacent to water (or vice versa) converts to obsidian
- **Chest storage**: `getChestLoot`/`setChestLoot` keyed by `"x,y,z"` → 27 `Slot[]`
- **Save format v2**: `voxelcraft_world_v2` holds `{v, seed, edits}` where edits are per-chunk base64 blobs (3 bytes each: 2-byte LE local index + block ID); chests in `voxelcraft_chests_v2`; player meta in `voxelcraft_meta_v2`. Old v1 full-snapshot keys are migrated one-shot on load. When changing serialization, bump the `SAVE_KEY` version to invalidate old saves.

**`structures.ts`** — Natural structures: underground dungeons (mossy cobblestone rooms with spawner + loot chests), desert pyramids (with secret TNT vault below the altar), lava lakes, and `generateDungeonLoot()` (chance-based loot table). Spawned deterministically via region-hash in world generation.

**`maps/` + `seoul.ts`** — Landmark generators that overwrite the natural terrain:
- `seoul.ts` → `buildSeoulCity()`: N Seoul Tower, Lotte World Tower, etc.
- `maps/tokyo.ts` → `buildTokyoCity()`: Tokyo Skytree/Tower, Senso-ji Pagoda, Torii gate, Shibuya skyscrapers, Sakura groves, Shinkansen viaduct
- Map selection lives in `MinecraftGame.tsx`: `MapType = 'seoul' | 'tokyo' | 'wilderness'`, persisted at `localStorage` key `voxelcraft_selected_map`. The world-init effect re-runs when the seed changes; selecting a new map must reset the seed to trigger a rebuild.

**`minimap.ts`** — Corner minimap viewer (top-right HUD):
- Caches a 16×16 top-color raster per chunk (cached rasters persist after chunk unload — the map remembers explored terrain), with height shading
- Redraws at ~8 Hz: cached chunk blits + mob dots (zombies red, sheep white) + rotating player arrow
- `M` key or clicking the map cycles zoom (2 → 1 → 4 px/block); recolors are driven by `world.consumeMinimapDirty()`

**`player.ts`** — Physics, collision, survival stats:
- AABB collision with swept-axis tests
- Gravity, jumping, swimming, flying (creative mode)
- Health/hunger/oxygen system with fall damage, drowning, starvation, lava burn (4 HP/s)
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
- Drag-and-drop UI in `InventoryUI.tsx`; chest looting UI in `ChestUI.tsx`

### Game Component

**`src/components/game/MinecraftGame.tsx`** — Main game component (~1450 lines):
- Integrates all game systems
- Handles input (desktop: WASD + mouse; mobile: touch D-pad + buttons)
- Pointer lock management (with fallback for touch devices)
- HUD: crosshair, hotbar, FPS, position, time, health/hunger, active map, minimap (top-right)
- Game loop: physics → mobs → particles → day/night → stream chunks → render
- Save/load persistence, death/respawn, menu system

### Key Architectural Patterns

**Three Render Passes:**
1. Opaque (grass, dirt, stone, etc.) — `MeshLambertMaterial`, `alphaTest: 0.5`
2. Cutout (leaves) — `alphaTest: 0.5`, `DoubleSide`, `depthWrite: true`
3. Translucent (water, glass, ice, lava) — `transparent: true`, `opacity: 0.78`, `depthWrite: true`

**Chunk Meshing:**
- Chunks are 16×16 horizontal columns (full 48-block height), rebuilt only on edit
- Boundary chunks rebuild when neighbor edits cross chunk borders
- Index winding order matters: `(0,2,1)(0,3,2)` for outward-facing normals

**Mobile Support:**
- Touch detection: `'ontouchstart' in window`, `navigator.maxTouchPoints`, `matchMedia('(pointer: coarse)')`
- Virtual D-pad (left half), look drag (right half), action buttons
- No pointer lock on iOS Safari—uses `playingRef` state instead

**Save System:**
- Per-chunk edit overlays + chest inventories + player meta → `localStorage` (see `world.ts` above)
- Auto-saves every 30s during play

## Adding New Features

**New Block Type:**
1. Add to `BlockType` union in `blocks.ts`
2. Define in `BLOCKS` with appropriate flags
3. Add texture drawing function in `textures.ts` and increment `ATLAS_ROWS`/`ATLAS_TILES` if needed
4. Add to `HOTBAR_BLOCKS` or `ALL_BLOCK_ITEMS` if placeable

**New Mob Type:**
1. Add to `MobType` union
2. Add `build<Model>Model()` static method
3. Wire up spawn conditions in `MobManager.update()`

**New Biome:**
1. Add to `BiomeType` union
2. Define in `BIOMES` with surface/cactus/flower rates
3. Update biome noise thresholds in `generateWorld()`

**New Structure (like dungeons/pyramids):**
1. Add a `build<Structure>()` function in `structures.ts` using `world.setBlock`/`setChestLoot`
2. Hook it into world generation's region-hash pass so it spawns deterministically per seed

**New City Map:**
1. Add a `build<City>()` landmark module (see `seoul.ts` / `maps/tokyo.ts` for the pattern)
2. Add the id to `MapType` in `MinecraftGame.tsx`, add a menu button, and call the builder in the world-init effect

## Important File Locations

- Game entry point: `src/app/page.tsx` (`dynamic` import with `ssr: false` — the game is fully client-side)
- E2E tests: `tests/e2e/` + `playwright.config.ts`
- Screenshots used by README: `docs/screenshots/`
- Tailwind config: `tailwind.config.ts`, `postcss.config.mjs`
- Prisma schema: `prisma/schema.prisma`
- ESLint config: `eslint.config.mjs`
- Next config: `next.config.ts` (static export, basePath, TS errors ignored)

## Testing Notes

Playwright tests run serially (`workers: 1`) against `http://localhost:3000/voxel-craft` and auto-start the dev server if it isn't running (`reuseExistingServer` locally). The game runs in headless browsers at ~8-11 FPS due to software WebGL—real browsers with GPU acceleration achieve 60 FPS. Use the browser dev console and in-game testing for anything beyond the covered smoke flows.

## Known Limitations

- No multiplayer
- No redstone/wiring system
- Post-processing disabled by default for performance
- World height hard-capped at 48 blocks

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
