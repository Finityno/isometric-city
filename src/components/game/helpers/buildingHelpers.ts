import { useCallback, useMemo } from 'react';
import { Tile, BuildingType } from '@/types/game';
import { getBuildingSize } from '@/lib/simulation';

/** Pre-computed tile metadata for O(1) lookups during rendering */
export interface TileMetadata {
  isPartOfMultiTileBuilding: boolean;
  isPartOfParkBuilding: boolean;
  isAdjacentToWater: boolean;
  adjacentWaterDirs: { north: boolean; east: boolean; south: boolean; west: boolean };
  needsGreyBase: boolean;
  needsGreenBaseOverWater: boolean;
  needsGreenBaseForPark: boolean;
}

// Park building types that get green bases
const PARK_BUILDINGS_SET = new Set<BuildingType>([
  'park_large', 'baseball_field_small', 'football_field',
  'mini_golf_course', 'go_kart_track', 'amphitheater', 'greenhouse_garden',
  'marina_docks_small', 'roller_coaster_small', 'mountain_lodge', 'playground_large', 'mountain_trailhead'
]);

// All park types for checking isPark (includes single-tile parks)
const ALL_PARK_TYPES = new Set<BuildingType>([
  'park', 'park_large', 'tennis', 'basketball_courts', 'playground_small',
  'playground_large', 'baseball_field_small', 'soccer_field_small', 'football_field',
  'skate_park', 'mini_golf_course', 'bleachers_field', 'go_kart_track', 'amphitheater',
  'greenhouse_garden', 'animal_pens_farm', 'cabin_house', 'campground', 'marina_docks_small',
  'pier_large', 'roller_coaster_small', 'community_garden', 'pond_park', 'park_gate',
  'mountain_lodge', 'mountain_trailhead'
]);

// PERF: Types that are not buildings (for grey base check)
const NON_BUILDING_TYPES = new Set<BuildingType>([
  'grass', 'empty', 'water', 'road', 'rail', 'tree'
]);

// PERF: Types that need green base
const GREEN_BASE_TYPES = new Set<BuildingType>([
  'grass', 'empty', 'tree'
]);

// PERF: Cache building sizes to avoid repeated lookups
// This avoids repeated object property access and default value creation
const buildingSizeCache = new Map<BuildingType, { width: number; height: number }>();
function getCachedBuildingSize(type: BuildingType): { width: number; height: number } {
  let size = buildingSizeCache.get(type);
  if (size === undefined) {
    size = getBuildingSize(type);
    buildingSizeCache.set(type, size);
  }
  return size;
}

// PERF: Pre-allocate reusable adjacency object to avoid object creation per tile
const REUSABLE_ADJACENCY = { north: false, east: false, south: false, west: false };

export function useBuildingHelpers(grid: Tile[][], gridSize: number) {
  // Pre-compute all tile metadata once when grid changes
  // This converts O(n) per-tile lookups during render to O(1) map lookups
  // PERF: Store gridSize for numeric key calculation
  const tileMetadataMap = useMemo(() => {
    // PERF: Use numeric keys (y * gridSize + x) instead of string keys
    // PERF: Pre-size the map to avoid rehashing
    const totalTiles = gridSize * gridSize;
    const map = new Map<number, TileMetadata>();

    // PERF: Cache grid rows to avoid repeated array access
    const gridRows = grid;
    const maxSize = 4;
    const lastIdx = gridSize - 1;

    // PERF: Pre-compute water positions as a bitset for O(1) lookup
    // Using Uint8Array is more memory efficient than a Set for dense grids
    const waterGrid = new Uint8Array(totalTiles);
    for (let y = 0; y < gridSize; y++) {
      const row = gridRows[y];
      const yOffset = y * gridSize;
      for (let x = 0; x < gridSize; x++) {
        if (row[x].building.type === 'water') {
          waterGrid[yOffset + x] = 1;
        }
      }
    }

    // PERF: Inline water check function (faster than function call overhead)
    // Returns true if position has water
    const checkWater = (x: number, y: number): boolean => {
      return x >= 0 && y >= 0 && x <= lastIdx && y <= lastIdx && waterGrid[y * gridSize + x] === 1;
    };

    // PERF: Single pass - compute multi-tile and park building coverage using flood-fill approach
    // Instead of checking 16 neighbors for each tile, we mark tiles when we find multi-tile buildings
    const multiTileFlags = new Uint8Array(totalTiles);
    const parkBuildingFlags = new Uint8Array(totalTiles);

    // Find all multi-tile building origins and mark their coverage
    for (let y = 0; y < gridSize; y++) {
      const row = gridRows[y];
      for (let x = 0; x < gridSize; x++) {
        const buildingType = row[x].building.type;
        const buildingSize = getCachedBuildingSize(buildingType);

        // Only process multi-tile buildings at their origin
        if (buildingSize.width > 1 || buildingSize.height > 1) {
          const isParkType = PARK_BUILDINGS_SET.has(buildingType);
          const maxY = Math.min(y + buildingSize.height, gridSize);
          const maxX = Math.min(x + buildingSize.width, gridSize);

          // Mark all tiles covered by this building
          for (let ty = y; ty < maxY; ty++) {
            const tyOffset = ty * gridSize;
            for (let tx = x; tx < maxX; tx++) {
              const tileKey = tyOffset + tx;
              multiTileFlags[tileKey] = 1;
              if (isParkType) {
                parkBuildingFlags[tileKey] = 1;
              }
            }
          }
        }
      }
    }

    // Second pass: compute all derived metadata using pre-computed flags
    for (let y = 0; y < gridSize; y++) {
      const row = gridRows[y];
      const yOffset = y * gridSize;

      for (let x = 0; x < gridSize; x++) {
        const key = yOffset + x;
        const buildingType = row[x].building.type;

        // PERF: Check cardinal water adjacency with inlined bounds checks
        const northWater = checkWater(x - 1, y);
        const eastWater = checkWater(x, y - 1);
        const southWater = checkWater(x + 1, y);
        const westWater = checkWater(x, y + 1);

        // PERF: Short-circuit diagonal checks if cardinal already found water
        const hasCardinalWater = northWater || eastWater || southWater || westWater;
        const isAdjacentToWater = hasCardinalWater ||
          checkWater(x - 1, y - 1) || checkWater(x + 1, y - 1) ||
          checkWater(x - 1, y + 1) || checkWater(x + 1, y + 1);

        const isPartOfMultiTileBuilding = multiTileFlags[key] === 1;
        const isPartOfParkBuilding = parkBuildingFlags[key] === 1;

        // PERF: Use Set lookup instead of multiple === comparisons
        const isPark = ALL_PARK_TYPES.has(buildingType) ||
                       (buildingType === 'empty' && isPartOfParkBuilding);

        // PERF: Use Set lookup for non-building check
        const isDirectBuilding = !isPark && !NON_BUILDING_TYPES.has(buildingType);
        const isPartOfBuilding = buildingType === 'empty' && isPartOfMultiTileBuilding;
        const needsGreyBase = (isDirectBuilding || isPartOfBuilding) && !isPark;

        // PERF: Use Set lookup for green base types
        const hasGreenBase = GREEN_BASE_TYPES.has(buildingType);
        const needsGreenBaseOverWater = hasGreenBase && isAdjacentToWater;
        const needsGreenBaseForPark = buildingType === 'park' || buildingType === 'park_large' ||
                                      (buildingType === 'empty' && isPartOfParkBuilding);

        map.set(key, {
          isPartOfMultiTileBuilding,
          isPartOfParkBuilding,
          isAdjacentToWater,
          adjacentWaterDirs: { north: northWater, east: eastWater, south: southWater, west: westWater },
          needsGreyBase,
          needsGreenBaseOverWater,
          needsGreenBaseForPark,
        });
      }
    }

    return map;
  }, [grid, gridSize]);
  
  // O(1) lookup functions that use the pre-computed map
  // PERF: Use numeric key calculation (gridY * gridSize + gridX)
  const isPartOfMultiTileBuilding = useCallback((gridX: number, gridY: number): boolean => {
    return tileMetadataMap.get(gridY * gridSize + gridX)?.isPartOfMultiTileBuilding ?? false;
  }, [tileMetadataMap, gridSize]);

  const isPartOfParkBuilding = useCallback((gridX: number, gridY: number): boolean => {
    return tileMetadataMap.get(gridY * gridSize + gridX)?.isPartOfParkBuilding ?? false;
  }, [tileMetadataMap, gridSize]);
  
  // Get full tile metadata for a position (O(1) lookup)
  const getTileMetadata = useCallback((gridX: number, gridY: number): TileMetadata | null => {
    return tileMetadataMap.get(gridY * gridSize + gridX) ?? null;
  }, [tileMetadataMap, gridSize]);

  const findBuildingOrigin = useCallback((gridX: number, gridY: number): { originX: number; originY: number; buildingType: BuildingType } | null => {
    const maxSize = 4;
    
    const tile = grid[gridY]?.[gridX];
    if (!tile) return null;
    
    if (tile.building.type !== 'empty' && 
        tile.building.type !== 'grass' && 
        tile.building.type !== 'water' && 
        tile.building.type !== 'road' && 
        tile.building.type !== 'rail' && 
        tile.building.type !== 'tree') {
      const size = getBuildingSize(tile.building.type);
      if (size.width > 1 || size.height > 1) {
        return { originX: gridX, originY: gridY, buildingType: tile.building.type };
      }
      return null;
    }
    
    if (tile.building.type === 'empty') {
      for (let dy = 0; dy < maxSize; dy++) {
        for (let dx = 0; dx < maxSize; dx++) {
          const originX = gridX - dx;
          const originY = gridY - dy;
          
          if (originX >= 0 && originX < gridSize && originY >= 0 && originY < gridSize) {
            const originTile = grid[originY][originX];
            
            if (originTile.building.type !== 'empty' && 
                originTile.building.type !== 'grass' &&
                originTile.building.type !== 'water' &&
                originTile.building.type !== 'road' &&
                originTile.building.type !== 'tree') {
              const size = getBuildingSize(originTile.building.type);
              
              if (size.width > 1 || size.height > 1) {
                if (gridX >= originX && gridX < originX + size.width &&
                    gridY >= originY && gridY < originY + size.height) {
                  return { originX, originY, buildingType: originTile.building.type };
                }
              }
            }
          }
        }
      }
    }
    
    return null;
  }, [grid, gridSize]);

  return {
    isPartOfMultiTileBuilding,
    findBuildingOrigin,
    isPartOfParkBuilding,
    getTileMetadata,
    tileMetadataMap,
  };
}
