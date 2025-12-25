# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Production build with type checking
npm run lint         # Run ESLint
```

No test framework is configured.

## Architecture Overview

IsoCity is an isometric city-building simulation game using a custom Canvas-based rendering engine (no external game libraries). Built with Next.js 16 + React 19 + TypeScript.

### Core Systems

**State Management** (`src/store/`):
- Zustand store in `gameStore.ts` replaces older Context API
- Fine-grained selectors in `selectors.ts` prevent unnecessary re-renders
- Use `useShallow` for object selectors to avoid render thrashing
- Game state persists to localStorage with lz-string compression

**Rendering Engine** (`src/components/game/CanvasIsometricGrid.tsx`):
- Main 4,380-line component handling all canvas rendering
- Isometric projection: TILE_WIDTH=64px, TILE_HEIGHT=38.4px (0.60 ratio)
- `gridToScreen(x, y)` / `screenToGrid(x, y)` for coordinate transforms
- Depth sorting: higher Y = rendered earlier (back to front)
- Performance culling based on zoom thresholds (CAR_MIN_ZOOM=0.4, PEDESTRIAN_MIN_ZOOM=0.5)

**Simulation** (`src/lib/simulation.ts`):
- `simulateTick()` advances game state each frame
- `createInitialGameState()` generates terrain with Perlin noise
- Service coverage uses flood-fill from service buildings
- "Starter buildings" (house_small, shop_small, factory_small) work without power/water

**Sprite System** (`src/lib/renderConfig.ts`):
- Multiple sprite packs with building variants (construction, abandoned, dense, modern)
- `getSpriteCoords()` maps BuildingType to sprite sheet position
- Images cached via `loadImage()` in `imageLoader.ts`

### Key Patterns

**Vehicle/Entity Systems** (in `src/components/game/`):
- Each system follows hook pattern: `useVehicleSystems()`, `useAircraftSystems()`, `useBoatSystem()`, etc.
- Systems manage spawn/update/despawn with refs for state (avoids re-renders)
- Max entity caps prevent performance degradation (800 pedestrians, 25 trains, etc.)

**Building Types**:
- 77 BuildingType values defined in `src/types/game.ts`
- TOOL_INFO maps tools to costs and sizes
- BUILDING_STATS defines population/jobs/pollution per type
- Some buildings require water adjacency (`requiresWaterAdjacency()`) or road adjacency

**Grid & Tiles**:
```typescript
interface Tile {
  x, y: number;
  zone: ZoneType;  // 'none' | 'residential' | 'commercial' | 'industrial'
  building: Building;
  landValue, pollution, crime, traffic: number;
  hasSubway: boolean;
}
```

### Directory Structure

```
src/
├── app/                    # Next.js App Router (page.tsx is entry)
├── components/
│   ├── Game.tsx            # Main game controller
│   ├── game/               # Game systems (32 files)
│   │   ├── CanvasIsometricGrid.tsx  # Core renderer
│   │   ├── types.ts, constants.ts   # Game-specific types
│   │   ├── *System.ts               # Vehicle/entity systems
│   │   └── panels/                  # UI panels
│   └── ui/                 # shadcn components
├── store/                  # Zustand state (gameStore.ts, selectors.ts)
├── lib/                    # Utilities (simulation.ts, renderConfig.ts)
└── types/game.ts           # Core type definitions
```

## Code Style

- TypeScript strict mode; use `@/*` path alias for imports
- React functional components with `'use client'` directive
- shadcn/ui + Radix UI + Tailwind CSS for styling
- ESLint with eslint-config-next

## Important Implementation Details

**Adding New Buildings**:
1. Add type to `BuildingType` union in `src/types/game.ts`
2. Add tool entry to `Tool` union and `TOOL_INFO`
3. Add sprite mapping in `renderConfig.ts`
4. Add stats in `BUILDING_STATS` in `simulation.ts`

**Selector Usage**: Always use fine-grained selectors from `selectors.ts` rather than subscribing to full state. Components re-render on every tick if they subscribe to frequently-changing data.

**Mobile Optimization**: Grid size is 50x50 on mobile vs 70x70 on desktop. Various zoom thresholds are higher on mobile for performance.
