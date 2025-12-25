import type { Tile, BuildingType, ZoneType, GameState, Building, ServiceCoverage } from '@/types/game';
import { requiresWaterAdjacency, getWaterAdjacency } from './BuildingRules';

// Building sizes for multi-tile buildings (width x height)
const BUILDING_SIZES: Partial<Record<BuildingType, { width: number; height: number }>> = {
  power_plant: { width: 2, height: 2 },
  hospital: { width: 2, height: 2 },
  school: { width: 2, height: 2 },
  stadium: { width: 3, height: 3 },
  museum: { width: 3, height: 3 },
  university: { width: 3, height: 3 },
  airport: { width: 4, height: 4 },
  space_program: { width: 3, height: 3 },
  park_large: { width: 3, height: 3 },
  mansion: { width: 2, height: 2 },
  apartment_low: { width: 2, height: 2 },
  apartment_high: { width: 2, height: 2 },
  office_low: { width: 2, height: 2 },
  office_high: { width: 2, height: 2 },
  mall: { width: 3, height: 3 },
  // Industrial buildings - small is 1x1, medium is 2x2, large is 3x3
  factory_medium: { width: 2, height: 2 },
  factory_large: { width: 3, height: 3 },
  warehouse: { width: 2, height: 2 },
  city_hall: { width: 2, height: 2 },
  amusement_park: { width: 4, height: 4 },
  // Parks (new sprite sheet)
  playground_large: { width: 2, height: 2 },
  baseball_field_small: { width: 2, height: 2 },
  football_field: { width: 2, height: 2 },
  baseball_stadium: { width: 3, height: 3 },
  mini_golf_course: { width: 2, height: 2 },
  go_kart_track: { width: 2, height: 2 },
  amphitheater: { width: 2, height: 2 },
  greenhouse_garden: { width: 2, height: 2 },
  marina_docks_small: { width: 2, height: 2 },
  roller_coaster_small: { width: 2, height: 2 },
  mountain_lodge: { width: 2, height: 2 },
  mountain_trailhead: { width: 3, height: 3 },
  // Transportation
  rail_station: { width: 2, height: 2 },
};

// Get the size of a building (how many tiles it spans)
export function getBuildingSize(buildingType: BuildingType): { width: number; height: number } {
  return BUILDING_SIZES[buildingType] || { width: 1, height: 1 };
}

// Building types that don't require construction (already complete when placed)
const NO_CONSTRUCTION_TYPES: BuildingType[] = ['grass', 'empty', 'water', 'road', 'tree'];

function createBuilding(type: BuildingType): Building {
  // Buildings that don't require construction start at 100% complete
  const constructionProgress = NO_CONSTRUCTION_TYPES.includes(type) ? 100 : 0;

  return {
    type,
    level: type === 'grass' || type === 'empty' || type === 'water' ? 0 : 1,
    population: 0,
    jobs: 0,
    powered: false,
    watered: false,
    onFire: false,
    fireProgress: 0,
    age: 0,
    constructionProgress,
    abandoned: false,
  };
}

// Service building types cache (imported from simulation.ts)
const SERVICE_BUILDING_TYPES = new Set([
  'police_station',
  'fire_station',
  'hospital',
  'school',
  'university',
  'power_plant',
  'water_tower',
]);

// Cache invalidation counter for service building locations
let serviceBuildingCacheVersion = 0;

export function invalidateServiceBuildingCache(): void {
  serviceBuildingCacheVersion++;
}

// Check if a multi-tile building can be placed at the given position
export function canPlaceMultiTileBuilding(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  gridSize: number
): boolean {
  // Check bounds
  if (x + width > gridSize || y + height > gridSize) {
    return false;
  }

  // Check all tiles are available (grass or tree only - not water, roads, or existing buildings)
  // NOTE: 'empty' tiles are placeholders from multi-tile buildings, so we can't build on them
  // without first bulldozing the entire parent building
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tile = grid[y + dy]?.[x + dx];
      if (!tile) return false;
      // Can only build on grass or trees - roads must be bulldozed first
      if (tile.building.type !== 'grass' && tile.building.type !== 'tree') {
        return false;
      }
    }
  }

  return true;
}

export function canSpawnMultiTileBuilding(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  zone: ZoneType,
  gridSize: number
): boolean {
  if (x + width > gridSize || y + height > gridSize) {
    return false;
  }

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tile = grid[y + dy]?.[x + dx];
      if (!tile) return false;
      // Must be in the same zone
      if (tile.zone !== zone) return false;
      // Can only spawn on grass or trees
      // NOT 'empty' - those are placeholders for existing multi-tile buildings
      if (tile.building.type !== 'grass' && tile.building.type !== 'tree') {
        return false;
      }
    }
  }

  return true;
}

// Find the origin tile of a multi-tile building that contains the given tile
// Returns null if the tile is not part of a multi-tile building
// PERF: Now uses cached originX/originY on empty tiles for O(1) lookup instead of O(16) search
export function findBuildingOrigin(
  grid: Tile[][],
  x: number,
  y: number,
  gridSize: number
): { originX: number; originY: number; buildingType: BuildingType } | null {
  const tile = grid[y]?.[x];
  if (!tile) return null;

  // If this tile has an actual building (not empty), check if it's multi-tile
  if (tile.building.type !== 'empty' && tile.building.type !== 'grass' &&
      tile.building.type !== 'water' && tile.building.type !== 'road' &&
      tile.building.type !== 'rail' && tile.building.type !== 'tree') {
    const size = getBuildingSize(tile.building.type);
    if (size.width > 1 || size.height > 1) {
      return { originX: x, originY: y, buildingType: tile.building.type };
    }
    return null; // Single-tile building
  }

  // If this is an 'empty' tile, it might be part of a multi-tile building
  if (tile.building.type === 'empty') {
    // PERF: Use cached origin coordinates if available (O(1) lookup)
    if (tile.building.originX !== undefined && tile.building.originY !== undefined) {
      const originTile = grid[tile.building.originY]?.[tile.building.originX];
      if (originTile && originTile.building.type !== 'empty' &&
          originTile.building.type !== 'grass') {
        return {
          originX: tile.building.originX,
          originY: tile.building.originY,
          buildingType: originTile.building.type
        };
      }
      // Origin was demolished, this empty tile is orphaned
      return null;
    }

    // Fallback: Search nearby tiles to find the origin (for legacy saves without cached origins)
    const maxSize = 4;
    for (let dy = 0; dy < maxSize; dy++) {
      for (let dx = 0; dx < maxSize; dx++) {
        const checkX = x - dx;
        const checkY = y - dy;
        if (checkX >= 0 && checkY >= 0 && checkX < gridSize && checkY < gridSize) {
          const checkTile = grid[checkY][checkX];
          if (checkTile.building.type !== 'empty' &&
              checkTile.building.type !== 'grass' &&
              checkTile.building.type !== 'water' &&
              checkTile.building.type !== 'road' &&
              checkTile.building.type !== 'rail' &&
              checkTile.building.type !== 'tree') {
            const size = getBuildingSize(checkTile.building.type);
            // Check if this building's footprint includes our original tile
            if (x >= checkX && x < checkX + size.width &&
                y >= checkY && y < checkY + size.height) {
              return { originX: checkX, originY: checkY, buildingType: checkTile.building.type };
            }
          }
        }
      }
    }
  }

  return null;
}

export function applyBuildingFootprint(
  grid: Tile[][],
  originX: number,
  originY: number,
  buildingType: BuildingType,
  zone: ZoneType,
  level: number,
  services?: ServiceCoverage
): Building {
  const size = getBuildingSize(buildingType);
  const BUILDING_STATS = require('@/data').BUILDING_STATS;
  const stats = BUILDING_STATS[buildingType] || { maxPop: 0, maxJobs: 0, pollution: 0, landValue: 0 };

  for (let dy = 0; dy < size.height; dy++) {
    for (let dx = 0; dx < size.width; dx++) {
      const cell = grid[originY + dy][originX + dx];
      if (dx === 0 && dy === 0) {
        cell.building = createBuilding(buildingType);
        cell.building.level = level;
        cell.building.age = 0;
        if (services) {
          cell.building.powered = services.power[originY + dy][originX + dx];
          cell.building.watered = services.water[originY + dy][originX + dx];
        }
      } else {
        cell.building = createBuilding('empty');
        cell.building.level = 0;
        // PERF: Store origin coordinates to avoid O(16) backward search in findBuildingOrigin
        cell.building.originX = originX;
        cell.building.originY = originY;
      }
      cell.zone = zone;
      cell.pollution = dx === 0 && dy === 0 ? stats.pollution : 0;
    }
  }

  return grid[originY][originX].building;
}

// Place a building or zone
export function placeBuilding(
  state: GameState,
  x: number,
  y: number,
  buildingType: BuildingType | null,
  zone: ZoneType | null
): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile) return state;

  // Can't build on water
  if (tile.building.type === 'water') return state;

  // Can't place roads on existing buildings (only allow on grass, tree, existing roads, or rail - rail+road creates combined tile)
  // Note: 'empty' tiles are part of multi-tile building footprints, so roads can't be placed there either
  if (buildingType === 'road') {
    const allowedTypes: BuildingType[] = ['grass', 'tree', 'road', 'rail'];
    if (!allowedTypes.includes(tile.building.type)) {
      return state; // Can't place road on existing building
    }
  }

  // Can't place rail on existing buildings (only allow on grass, tree, existing rail, or road - rail+road creates combined tile)
  if (buildingType === 'rail') {
    const allowedTypes: BuildingType[] = ['grass', 'tree', 'rail', 'road'];
    if (!allowedTypes.includes(tile.building.type)) {
      return state; // Can't place rail on existing building
    }
  }

  // Roads and rail can be combined, but other buildings require clearing first
  if (buildingType && buildingType !== 'road' && buildingType !== 'rail' && tile.building.type === 'road') {
    return state;
  }
  if (buildingType && buildingType !== 'road' && buildingType !== 'rail' && tile.building.type === 'rail') {
    return state;
  }

  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));

  if (zone !== null) {
    // De-zoning (zone === 'none') can work on any zoned tile/building
    // Regular zoning can only be applied to grass, tree, or road tiles
    if (zone === 'none') {
      // Check if this tile is part of a multi-tile building (handles both origin and 'empty' tiles)
      const origin = findBuildingOrigin(newGrid, x, y, state.gridSize);

      if (origin) {
        // Dezone the entire multi-tile building
        const size = getBuildingSize(origin.buildingType);
        for (let dy = 0; dy < size.height; dy++) {
          for (let dx = 0; dx < size.width; dx++) {
            const clearX = origin.originX + dx;
            const clearY = origin.originY + dy;
            if (clearX < state.gridSize && clearY < state.gridSize) {
              newGrid[clearY][clearX].building = createBuilding('grass');
              newGrid[clearY][clearX].zone = 'none';
            }
          }
        }
      } else {
        // Single tile - can only dezone tiles that actually have a zone
        if (tile.zone === 'none') {
          return state;
        }
        // De-zoning resets to grass
        newGrid[y][x].zone = 'none';
        newGrid[y][x].building = createBuilding('grass');
      }
    } else {
      // Can't zone over existing buildings (only allow zoning on grass, tree, or road)
      // NOTE: 'empty' tiles are part of multi-tile buildings, so we can't zone them either
      const allowedTypesForZoning: BuildingType[] = ['grass', 'tree', 'road'];
      if (!allowedTypesForZoning.includes(tile.building.type)) {
        return state; // Can't zone over existing building or part of multi-tile building
      }
      // Setting zone
      newGrid[y][x].zone = zone;
    }
  } else if (buildingType) {
    const size = getBuildingSize(buildingType);

    // Check water adjacency requirement for waterfront buildings (marina, pier)
    let shouldFlip = false;
    if (requiresWaterAdjacency(buildingType)) {
      const waterCheck = getWaterAdjacency(newGrid, x, y, size.width, size.height, state.gridSize);
      if (!waterCheck.hasWater) {
        return state; // Waterfront buildings must be placed next to water
      }
      shouldFlip = waterCheck.shouldFlip;
    }

    if (size.width > 1 || size.height > 1) {
      // Multi-tile building - check if we can place it
      if (!canPlaceMultiTileBuilding(newGrid, x, y, size.width, size.height, state.gridSize)) {
        return state; // Can't place here
      }
      applyBuildingFootprint(newGrid, x, y, buildingType, 'none', 1);
      // Set flip for waterfront buildings to face the water
      if (shouldFlip) {
        newGrid[y][x].building.flipped = true;
      }
    } else {
      // Single tile building - check if tile is available
      // Can't place on water, existing buildings, or 'empty' tiles (part of multi-tile buildings)
      // Note: 'road' and 'rail' are included here so they can extend over existing roads/rails,
      // but non-road/rail buildings are already blocked from roads/rails by the checks above
      const allowedTypes: BuildingType[] = ['grass', 'tree', 'road', 'rail'];
      if (!allowedTypes.includes(tile.building.type)) {
        return state; // Can't place on existing building or part of multi-tile building
      }

      // Handle combined rail+road tiles
      if (buildingType === 'rail' && tile.building.type === 'road') {
        // Placing rail on road: keep as road with rail overlay
        newGrid[y][x].hasRailOverlay = true;
        // Don't change the building type - it stays as road
      } else if (buildingType === 'road' && tile.building.type === 'rail') {
        // Placing road on rail: convert to road with rail overlay
        newGrid[y][x].building = createBuilding('road');
        newGrid[y][x].hasRailOverlay = true;
        newGrid[y][x].zone = 'none';
      } else if (buildingType === 'rail' && tile.hasRailOverlay) {
        // Already has rail overlay, do nothing
      } else if (buildingType === 'road' && tile.hasRailOverlay) {
        // Already has road with rail overlay, do nothing
      } else {
        // Normal placement
        newGrid[y][x].building = createBuilding(buildingType);
        newGrid[y][x].zone = 'none';
        // Clear rail overlay if placing non-combined building
        if (buildingType !== 'road') {
          newGrid[y][x].hasRailOverlay = false;
        }
      }
      // Set flip for waterfront buildings to face the water
      if (shouldFlip) {
        newGrid[y][x].building.flipped = true;
      }
    }
  }

  // PERF: Invalidate service building cache if we placed a service building
  if (buildingType && SERVICE_BUILDING_TYPES.has(buildingType)) {
    invalidateServiceBuildingCache();
  }

  return { ...state, grid: newGrid };
}

// Bulldoze a tile (or entire multi-tile building if applicable)
export function bulldozeTile(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile) return state;
  if (tile.building.type === 'water') return state;

  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));

  // Check if this tile is part of a multi-tile building
  const origin = findBuildingOrigin(newGrid, x, y, state.gridSize);

  if (origin) {
    // Bulldoze the entire multi-tile building
    const size = getBuildingSize(origin.buildingType);
    for (let dy = 0; dy < size.height; dy++) {
      for (let dx = 0; dx < size.width; dx++) {
        const clearX = origin.originX + dx;
        const clearY = origin.originY + dy;
        if (clearX < state.gridSize && clearY < state.gridSize) {
          newGrid[clearY][clearX].building = createBuilding('grass');
          newGrid[clearY][clearX].zone = 'none';
          newGrid[clearY][clearX].hasRailOverlay = false; // Clear rail overlay
          // Don't remove subway when bulldozing surface buildings
        }
      }
    }
  } else {
    // Single tile bulldoze
    newGrid[y][x].building = createBuilding('grass');
    newGrid[y][x].zone = 'none';
    newGrid[y][x].hasRailOverlay = false; // Clear rail overlay
    // Don't remove subway when bulldozing surface buildings
  }

  // PERF: Invalidate service building cache if we demolished a service building
  const demolishedType = origin ? origin.buildingType : tile.building.type;
  if (SERVICE_BUILDING_TYPES.has(demolishedType)) {
    invalidateServiceBuildingCache();
  }

  return { ...state, grid: newGrid };
}

// Place a subway line underground (doesn't affect surface buildings)
export function placeSubway(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile) return state;

  // Can't place subway under water
  if (tile.building.type === 'water') return state;

  // Already has subway
  if (tile.hasSubway) return state;

  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));
  newGrid[y][x].hasSubway = true;

  return { ...state, grid: newGrid };
}
