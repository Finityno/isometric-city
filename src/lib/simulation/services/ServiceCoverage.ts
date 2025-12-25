import type { Tile, ServiceCoverage, BuildingType } from '@/types/game';
import { SERVICE_CONFIG, SERVICE_BUILDING_TYPES } from './ServiceBuildings';

// PERF: Optimized service coverage grid creation
// Uses typed arrays internally for faster operations
export function createServiceCoverage(size: number): ServiceCoverage {
  // Pre-allocate arrays with correct size to avoid resizing
  const createGrid = () => {
    const grid: number[][] = new Array(size);
    for (let y = 0; y < size; y++) {
      grid[y] = new Array(size).fill(0);
    }
    return grid;
  };

  const createBoolGrid = () => {
    const grid: boolean[][] = new Array(size);
    for (let y = 0; y < size; y++) {
      grid[y] = new Array(size).fill(false);
    }
    return grid;
  };

  return {
    police: createGrid(),
    fire: createGrid(),
    health: createGrid(),
    education: createGrid(),
    power: createBoolGrid(),
    water: createBoolGrid(),
  };
}

// PERF: Cache for service building positions to avoid O(n²) scan every tick
// Uses a version counter that increments when service buildings are placed/demolished
type ServiceBuildingInfo = { x: number; y: number; type: BuildingType };
let cachedServiceBuildings: ServiceBuildingInfo[] | null = null;
let serviceBuildingCacheVersion = 0;
let lastCachedVersion = -1;

// Call this to invalidate the service building cache when buildings change
// This should be called when:
// - Service buildings are placed (placeBuilding)
// - Service buildings are demolished (bulldozeTile)
// - Game is reloaded (newGame, loadState)
export function invalidateServiceBuildingCache(): void {
  serviceBuildingCacheVersion++;
  cachedServiceBuildings = null;
}

// Calculate service coverage from service buildings - optimized version
export function calculateServiceCoverage(grid: Tile[][], size: number): ServiceCoverage {
  const services = createServiceCoverage(size);

  // PERF: Use cached service buildings if version hasn't changed
  // This avoids the O(n²) first pass when no service buildings have been placed/demolished
  let serviceBuildings: ServiceBuildingInfo[];

  if (cachedServiceBuildings !== null && lastCachedVersion === serviceBuildingCacheVersion) {
    serviceBuildings = cachedServiceBuildings;
  } else {
    // First pass: collect all service building positions (including under construction)
    // We filter for construction/abandoned status in the second pass so cache remains valid
    // even when buildings complete construction or become abandoned
    serviceBuildings = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tile = grid[y][x];
        const buildingType = tile.building.type;

        // Quick check if this is a service building
        if (!SERVICE_BUILDING_TYPES.has(buildingType)) continue;

        serviceBuildings.push({ x, y, type: buildingType });
      }
    }

    // Cache the service building positions for next tick
    cachedServiceBuildings = serviceBuildings;
    lastCachedVersion = serviceBuildingCacheVersion;
  }

  // Second pass: apply coverage for each service building
  for (const building of serviceBuildings) {
    const { x, y, type } = building;
    const tile = grid[y][x];

    // Skip buildings under construction (checked here so cache stays valid across construction)
    if (tile.building.constructionProgress !== undefined && tile.building.constructionProgress < 100) {
      continue;
    }

    // Skip abandoned buildings
    if (tile.building.abandoned) {
      continue;
    }

    const config = SERVICE_CONFIG[type as keyof typeof SERVICE_CONFIG];
    if (!config) continue;

    const range = config.range;
    const rangeSquared = config.rangeSquared;

    // Calculate bounds to avoid checking tiles outside the grid
    const minY = Math.max(0, y - range);
    const maxY = Math.min(size - 1, y + range);
    const minX = Math.max(0, x - range);
    const maxX = Math.min(size - 1, x + range);

    // Handle power and water (boolean coverage)
    if (type === 'power_plant') {
      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x;
          const dy = ny - y;
          // Use squared distance comparison (avoid Math.sqrt)
          if (dx * dx + dy * dy <= rangeSquared) {
            services.power[ny][nx] = true;
          }
        }
      }
    } else if (type === 'water_tower') {
      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x;
          const dy = ny - y;
          if (dx * dx + dy * dy <= rangeSquared) {
            services.water[ny][nx] = true;
          }
        }
      }
    } else {
      // Handle percentage-based coverage (police, fire, health, education)
      const serviceType = (config as { type: 'police' | 'fire' | 'health' | 'education' }).type;
      const currentCoverage = services[serviceType] as number[][];

      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x;
          const dy = ny - y;
          const distSquared = dx * dx + dy * dy;

          if (distSquared <= rangeSquared) {
            // Only compute sqrt when we need the actual distance for coverage falloff
            const distance = Math.sqrt(distSquared);
            const coverage = Math.max(0, (1 - distance / range) * 100);
            currentCoverage[ny][nx] = Math.min(100, currentCoverage[ny][nx] + coverage);
          }
        }
      }
    }
  }

  return services;
}
