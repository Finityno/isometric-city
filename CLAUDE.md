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

**Rendering Engine** (`src/components/game/`):
- Main component `CanvasIsometricGrid.tsx` (~3,800 lines) orchestrates all rendering
- Modular canvas renderers in `canvas/renderers/`:
  - `BuildingRenderer.ts` - building sprites and construction states
  - `RoadRenderer.ts` - roads, rails, crossings, traffic lights
  - `HoverRenderer.ts` - hover effects and selection highlights
  - `LightingRenderer.ts` - day/night cycle and lighting overlays
- Input handling in `canvas/input/`:
  - `MouseHandler.ts` - mouse interactions and dragging
  - `TouchHandler.ts` - mobile touch and pinch-zoom
  - `ViewportController.ts` - camera pan and zoom
- Isometric projection: TILE_WIDTH=64px, TILE_HEIGHT=38.4px (0.60 ratio)
- `gridToScreen(x, y)` / `screenToGrid(x, y)` for coordinate transforms
- Depth sorting: higher Y = rendered earlier (back to front)
- Performance culling based on zoom thresholds (CAR_MIN_ZOOM=0.4, PEDESTRIAN_MIN_ZOOM=0.5)

**Simulation** (`src/lib/simulation/`):
- Core simulation logic in `simulation.ts` (~1,460 lines) - `simulateTick()` advances game state
- Modular subsystems:
  - `terrain/` - Perlin noise generation, water placement, initial terrain
  - `buildings/` - building placement rules, evolution, and growth logic
  - `services/` - utilities (power/water), service coverage, service buildings
  - `economy/` - tax system, budget, demand calculations
- "Starter buildings" (house_small, shop_small, factory_small) work without power/water

**Sprite System** (`src/lib/sprites/`):
- Multiple sprite packs with building variants (construction, abandoned, dense, modern)
- Organized structure:
  - `packs/sprites4Base.ts` - base sprite pack definitions
  - `packs/sprites4Variants.ts` - construction, abandoned, dense variants
  - `packs/themes/` - themed sprite packs (Harry Potter, China)
  - `SpriteCoordinates.ts` - maps BuildingType to sprite sheet positions
- Legacy `renderConfig.ts` provides backward compatibility
- Images cached via `loadImage()` in `imageLoader.ts`

### Key Patterns

**Vehicle/Entity Systems** (`src/components/game/systems/`):
- Organized by category in subdirectories:
  - `vehicles/` - cars, emergency vehicles, traffic signals
  - `trains/` - train spawning, rail pathfinding
  - `aircraft/` - airplanes, helicopters
  - `marine/` - boats, barges, seaplanes
  - `pedestrians/` - pedestrian spawning and movement
- Each system exports hooks following pattern: `useVehicleSystem()`, `useTrainSystem()`, etc.
- Systems manage spawn/update/despawn with refs for state (avoids re-renders)
- Max entity caps prevent performance degradation (800 pedestrians, 25 trains, etc.)

**Building Types** (`src/data/` and `src/types/`):
- 77 BuildingType values defined in `src/types/game.ts`
- Centralized data in `src/data/`:
  - `toolInfo.ts` - TOOL_INFO maps tools to costs and sizes
  - `buildingStats.ts` - BUILDING_STATS defines population/jobs/pollution per type
  - `buildingCategories.ts` - categorizes buildings for UI organization
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
│   ├── game/               # Game rendering and UI
│   │   ├── CanvasIsometricGrid.tsx  # Core renderer (~3,800 lines)
│   │   ├── canvas/         # Canvas subsystems
│   │   │   ├── renderers/  # BuildingRenderer, RoadRenderer, HoverRenderer, LightingRenderer
│   │   │   ├── input/      # MouseHandler, TouchHandler, ViewportController
│   │   │   ├── hooks/      # useCanvasState, useRenderQueues, useViewport
│   │   │   └── RenderLoop.ts
│   │   ├── systems/        # Entity/vehicle systems
│   │   │   ├── vehicles/   # VehicleSystem, TrafficSystem
│   │   │   ├── trains/     # TrainSystem, RailSystem
│   │   │   ├── aircraft/   # AircraftSystem
│   │   │   ├── marine/     # BoatSystem, BargeSystem, SeaplaneSystem
│   │   │   └── pedestrians/ # PedestrianSystem
│   │   ├── panels/         # UI panels (Budget, Statistics, Settings, etc.)
│   │   └── types.ts, constants.ts, drawing.ts, utils.ts
│   ├── mobile/             # Mobile-specific components
│   └── ui/                 # shadcn components
├── store/                  # Zustand state
│   ├── gameStore.ts        # Main store (~750 lines)
│   └── selectors.ts        # Fine-grained selectors
├── lib/                    # Core logic
│   ├── simulation/         # Simulation subsystems
│   │   ├── terrain/        # NoiseGeneration, WaterGeneration, TerrainInit
│   │   ├── buildings/      # BuildingRules, BuildingEvolution, BuildingPlacement
│   │   ├── services/       # Utilities, ServiceCoverage, ServiceBuildings
│   │   └── economy/        # TaxSystem, BudgetSystem, DemandSystem
│   ├── sprites/            # Sprite management
│   │   ├── packs/          # sprites4Base, sprites4Variants
│   │   │   └── themes/     # harryPotter, china
│   │   ├── SpriteCoordinates.ts
│   │   └── types.ts
│   ├── storage/            # Persistence layer
│   │   ├── GameStateStorage.ts
│   │   ├── SavedCitiesStorage.ts
│   │   ├── SettingsStorage.ts
│   │   ├── serialization.ts
│   │   └── migrations.ts
│   ├── simulation.ts       # Main simulation logic (~1,460 lines)
│   ├── renderConfig.ts     # Legacy sprite config (backward compat)
│   └── utils/              # Math, coordinates utilities
├── data/                   # Static game data
│   ├── toolInfo.ts         # TOOL_INFO
│   ├── buildingStats.ts    # BUILDING_STATS
│   └── buildingCategories.ts
├── types/                  # Type definitions
│   ├── game.ts             # Core types (BuildingType, Tool, etc.)
│   ├── buildings.ts
│   └── simulation.ts
└── hooks/                  # Global hooks (useCheatCodes, useMobile)
```

## Code Style

- TypeScript strict mode; use `@/*` path alias for imports
- React functional components with `'use client'` directive
- shadcn/ui + Radix UI + Tailwind CSS for styling
- ESLint with eslint-config-next

## Important Implementation Details

**Adding New Buildings**:
1. Add type to `BuildingType` union in `src/types/game.ts`
2. Add tool entry to `Tool` union and `TOOL_INFO` in `src/data/toolInfo.ts`
3. Add sprite mapping in `src/lib/sprites/SpriteCoordinates.ts`
4. Add stats in `BUILDING_STATS` in `src/data/buildingStats.ts`
5. (Optional) Add to category in `src/data/buildingCategories.ts` for UI organization

**Selector Usage**: Always use fine-grained selectors from `selectors.ts` rather than subscribing to full state. Components re-render on every tick if they subscribe to frequently-changing data.

**Mobile Optimization**: Grid size is 50x50 on mobile vs 70x70 on desktop. Various zoom thresholds are higher on mobile for performance.
