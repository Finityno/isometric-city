import type { Tile, Building, BuildingType, ZoneType, ServiceCoverage } from '@/types/game';
import { BUILDING_STATS, RESIDENTIAL_BUILDINGS, COMMERCIAL_BUILDINGS, INDUSTRIAL_BUILDINGS } from '@/data';
import { getBuildingSize, applyBuildingFootprint } from './BuildingPlacement';
import { isStarterBuilding } from './BuildingRules';

// Footprint helpers for organic growth and merging
// IMPORTANT: Only allow consolidation of truly empty land (grass, tree).
// Do NOT include 'empty' tiles - those are placeholders for existing multi-tile buildings!
// Including 'empty' would allow buildings to overlap with each other during evolution.
const MERGEABLE_TILE_TYPES = new Set<BuildingType>(['grass', 'tree']);

// Small buildings that can be consolidated into larger ones when demand is high
const CONSOLIDATABLE_BUILDINGS: Record<ZoneType, Set<BuildingType>> = {
  residential: new Set(['house_small', 'house_medium']),
  commercial: new Set(['shop_small', 'shop_medium']),
  industrial: new Set(['factory_small']),
  none: new Set(),
};

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

// Get construction speed for a building type (larger buildings take longer)
// Returns percentage progress per tick
function getConstructionSpeed(buildingType: BuildingType): number {
  const size = getBuildingSize(buildingType);
  const area = size.width * size.height;

  // Base speed: 24-36% per tick for 1x1 buildings (~3-4 ticks to complete)
  // Scale down by sqrt of area so larger buildings take proportionally longer:
  // - 1x1 (1 tile):  24-36% per tick → ~3-4 ticks
  // - 2x2 (4 tiles): 12-18% per tick → ~6-8 ticks
  // - 3x3 (9 tiles): 8-12% per tick → ~9-12 ticks
  // - 4x4 (16 tiles): 6-9% per tick → ~11-16 ticks
  // Construction takes 30% longer overall (speed reduced by 1/1.3)
  const baseSpeed = 24 + Math.random() * 12;
  return (baseSpeed / Math.sqrt(area)) / 1.3;
}

function isMergeableZoneTile(
  tile: Tile,
  zone: ZoneType,
  excludeTile?: { x: number; y: number },
  allowBuildingConsolidation?: boolean
): boolean {
  // The tile being upgraded is always considered mergeable (it's the source of the evolution)
  if (excludeTile && tile.x === excludeTile.x && tile.y === excludeTile.y) {
    return tile.zone === zone && !tile.building.onFire &&
           tile.building.type !== 'water' && tile.building.type !== 'road';
  }

  if (tile.zone !== zone) return false;
  if (tile.building.onFire) return false;
  if (tile.building.type === 'water' || tile.building.type === 'road') return false;

  // Always allow merging grass and trees - truly unoccupied tiles
  if (MERGEABLE_TILE_TYPES.has(tile.building.type)) {
    return true;
  }

  // When demand is high, allow consolidating small buildings into larger ones
  // This enables developed areas to densify without requiring empty land
  if (allowBuildingConsolidation && CONSOLIDATABLE_BUILDINGS[zone]?.has(tile.building.type)) {
    return true;
  }

  // 'empty' tiles are placeholders for multi-tile buildings and must NOT be merged
  return false;
}

function footprintAvailable(
  grid: Tile[][],
  originX: number,
  originY: number,
  width: number,
  height: number,
  zone: ZoneType,
  gridSize: number,
  excludeTile?: { x: number; y: number },
  allowBuildingConsolidation?: boolean
): boolean {
  if (originX < 0 || originY < 0 || originX + width > gridSize || originY + height > gridSize) {
    return false;
  }

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tile = grid[originY + dy][originX + dx];
      if (!isMergeableZoneTile(tile, zone, excludeTile, allowBuildingConsolidation)) {
        return false;
      }
    }
  }
  return true;
}

function scoreFootprint(grid: Tile[][], originX: number, originY: number, width: number, height: number, gridSize: number): number {
  // Prefer footprints that touch roads for access
  let roadScore = 0;
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const gx = originX + dx;
      const gy = originY + dy;
      for (const [ox, oy] of offsets) {
        const nx = gx + ox;
        const ny = gy + oy;
        if (nx >= 0 && ny >= 0 && nx < gridSize && ny < gridSize) {
          if (grid[ny][nx].building.type === 'road') {
            roadScore++;
          }
        }
      }
    }
  }

  // Smaller footprints and more road contacts rank higher
  return roadScore - width * height * 0.25;
}

export function findFootprintIncludingTile(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  zone: ZoneType,
  gridSize: number,
  allowBuildingConsolidation?: boolean
): { originX: number; originY: number } | null {
  const candidates: { originX: number; originY: number; score: number }[] = [];
  // The tile at (x, y) is the one being upgraded, so it should be excluded from the "can't merge existing buildings" check
  const excludeTile = { x, y };

  for (let oy = y - (height - 1); oy <= y; oy++) {
    for (let ox = x - (width - 1); ox <= x; ox++) {
      if (!footprintAvailable(grid, ox, oy, width, height, zone, gridSize, excludeTile, allowBuildingConsolidation)) continue;
      if (x < ox || x >= ox + width || y < oy || y >= oy + height) continue;

      const score = scoreFootprint(grid, ox, oy, width, height, gridSize);
      candidates.push({ originX: ox, originY: oy, score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { originX: candidates[0].originX, originY: candidates[0].originY };
}

// Evolve buildings based on conditions, reserving footprints as density increases
export function evolveBuilding(grid: Tile[][], x: number, y: number, services: ServiceCoverage, demand?: { residential: number; commercial: number; industrial: number }): Building {
  const tile = grid[y][x];
  const building = tile.building;
  const zone = tile.zone;

  // Only evolve zoned tiles with real buildings
  if (zone === 'none' || building.type === 'grass' || building.type === 'water' || building.type === 'road') {
    return building;
  }

  // Placeholder tiles from multi-tile footprints stay inert but track utilities
  if (building.type === 'empty') {
    building.powered = services.power[y][x];
    building.watered = services.water[y][x];
    building.population = 0;
    building.jobs = 0;
    return building;
  }

  building.powered = services.power[y][x];
  building.watered = services.water[y][x];

  const hasPower = building.powered;
  const hasWater = building.watered;
  const landValue = tile.landValue;

  // Starter buildings (farms, house_small, shop_small) don't require power/water
  const isStarter = isStarterBuilding(x, y, building.type);

  if (!isStarter && (!hasPower || !hasWater)) {
    return building;
  }

  // Progress construction if building is not yet complete
  // Construction requires power and water to progress (except farms)
  if (building.constructionProgress !== undefined && building.constructionProgress < 100) {
    // Construction speed scales with building size (larger buildings take longer)
    const constructionSpeed = getConstructionSpeed(building.type);
    building.constructionProgress = Math.min(100, building.constructionProgress + constructionSpeed);

    // While under construction, buildings don't generate population or jobs
    building.population = 0;
    building.jobs = 0;

    // Don't age or evolve until construction is complete
    return building;
  }

  // Get zone demand for abandonment/recovery logic
  const zoneDemandValue = demand ? (
    zone === 'residential' ? demand.residential :
    zone === 'commercial' ? demand.commercial :
    zone === 'industrial' ? demand.industrial : 0
  ) : 0;

  // === ABANDONMENT MECHANIC ===
  // Buildings can become abandoned when demand is very negative (oversupply)
  // Abandoned buildings produce nothing but can recover when demand returns

  if (building.abandoned) {
    // Abandoned building - check for recovery
    // When demand is positive, abandoned buildings have a chance to be cleared
    // The cleared land (zoned grass) can then be redeveloped
    if (zoneDemandValue > 10) {
      // Higher demand = higher chance of clearing abandoned building
      // At demand 30, ~3% chance per tick; at demand 60, ~8% chance
      const clearingChance = Math.min(0.12, (zoneDemandValue - 10) / 600);
      if (Math.random() < clearingChance) {
        // Clear the abandoned building - revert to zoned grass
        // This allows natural redevelopment when demand recovers
        // For multi-tile buildings, clear the entire footprint to avoid orphaned 'empty' tiles
        const size = getBuildingSize(building.type);
        if (size.width > 1 || size.height > 1) {
          // Clear all tiles in the footprint
          for (let dy = 0; dy < size.height; dy++) {
            for (let dx = 0; dx < size.width; dx++) {
              const clearTile = grid[y + dy]?.[x + dx];
              if (clearTile) {
                const clearedBuilding = createBuilding('grass');
                clearedBuilding.powered = services.power[y + dy]?.[x + dx] ?? false;
                clearedBuilding.watered = services.water[y + dy]?.[x + dx] ?? false;
                clearTile.building = clearedBuilding;
              }
            }
          }
        }
        // Return grass for the origin tile
        const clearedBuilding = createBuilding('grass');
        clearedBuilding.powered = building.powered;
        clearedBuilding.watered = building.watered;
        return clearedBuilding;
      }
    }

    // Abandoned buildings produce nothing
    building.population = 0;
    building.jobs = 0;
    // Abandoned buildings still age but much slower
    building.age = (building.age || 0) + 0.1;
    return building;
  }

  // Check if building should become abandoned (oversupply situation)
  // Only happens when demand is significantly negative and building has been around a while
  // Abandonment is gradual - even at worst conditions, only ~2-3% of buildings abandon per tick
  if (zoneDemandValue < -20 && building.age > 30) {
    // Worse demand = higher chance of abandonment, but capped low for gradual effect
    // At demand -40, ~0.5% chance per tick; at demand -100, ~2% chance
    const abandonmentChance = Math.min(0.02, Math.abs(zoneDemandValue + 20) / 4000);

    // Buildings without power/water are slightly more likely to be abandoned (except starter buildings)
    const utilityPenalty = isStarter ? 0 : ((!hasPower ? 0.005 : 0) + (!hasWater ? 0.005 : 0));

    // Lower-level buildings are slightly more likely to be abandoned
    const levelPenalty = building.level <= 2 ? 0.003 : 0;

    if (Math.random() < abandonmentChance + utilityPenalty + levelPenalty) {
      building.abandoned = true;
      building.population = 0;
      building.jobs = 0;
      return building;
    }
  }

  building.age = (building.age || 0) + 1;

  // Determine target building based on zone and conditions
  const buildingList = zone === 'residential' ? RESIDENTIAL_BUILDINGS :
    zone === 'commercial' ? COMMERCIAL_BUILDINGS :
    zone === 'industrial' ? INDUSTRIAL_BUILDINGS : [];

  // Calculate level based on land value, services, and demand
  const serviceCoverage = (
    services.police[y][x] +
    services.fire[y][x] +
    services.health[y][x] +
    services.education[y][x]
  ) / 4;

  // Get zone demand to factor into level calculation
  const zoneDemandForLevel = demand ? (
    zone === 'residential' ? demand.residential :
    zone === 'commercial' ? demand.commercial :
    zone === 'industrial' ? demand.industrial : 0
  ) : 0;

  // High demand increases target level, encouraging densification
  // At demand 60, adds ~0.5 level; at demand 100, adds ~1 level
  const demandLevelBoost = Math.max(0, (zoneDemandForLevel - 30) / 70) * 0.7;

  const targetLevel = Math.min(5, Math.max(1, Math.floor(
    (landValue / 24) + (serviceCoverage / 28) + (building.age / 60) + demandLevelBoost
  )));

  const targetIndex = Math.min(buildingList.length - 1, targetLevel - 1);
  const targetType = buildingList[targetIndex];
  let anchorX = x;
  let anchorY = y;

  // Calculate consolidation probability based on demand
  // Base probability is low to make consolidation gradual
  let consolidationChance = 0.08;
  let allowBuildingConsolidation = false;

  // Check if this is a small/medium density building that could consolidate
  const isSmallResidential = zone === 'residential' &&
    (building.type === 'house_small' || building.type === 'house_medium');
  const isSmallCommercial = zone === 'commercial' &&
    (building.type === 'shop_small' || building.type === 'shop_medium');
  const isSmallIndustrial = zone === 'industrial' &&
    building.type === 'factory_small';

  // Get relevant demand for this zone
  const zoneDemand = demand ? (
    zone === 'residential' ? demand.residential :
    zone === 'commercial' ? demand.commercial :
    zone === 'industrial' ? demand.industrial : 0
  ) : 0;

  if (zoneDemand > 30) {
    if (isSmallResidential || isSmallCommercial || isSmallIndustrial) {
      // Gradual boost based on demand: at demand 60 adds ~10%, at demand 100 adds ~23%
      const demandBoost = Math.min(0.25, (zoneDemand - 30) / 300);
      consolidationChance += demandBoost;

      // At very high demand (> 70), allow consolidating existing small buildings
      // but keep the probability increase modest
      if (zoneDemand > 70) {
        consolidationChance += 0.05;
        // Allow consolidating existing small buildings (not just empty land)
        // This enables developed areas to densify
        allowBuildingConsolidation = true;
      }
    }
  }

  // Attempt to upgrade footprint/density when the tile is mature enough
  // Keep consistent age requirement to prevent sudden mass consolidation
  // Consolidation ALWAYS requires utilities (power and water) - no farm exemption
  // because consolidation upgrades buildings to larger types that need utilities
  const ageRequirement = 12;
  const hasUtilitiesForConsolidation = hasPower && hasWater;
  if (hasUtilitiesForConsolidation && building.age > ageRequirement && (targetLevel > building.level || targetType !== building.type) && Math.random() < consolidationChance) {
    const size = getBuildingSize(targetType);
    const footprint = findFootprintIncludingTile(grid, x, y, size.width, size.height, zone, grid.length, allowBuildingConsolidation);

    if (footprint) {
      const anchor = applyBuildingFootprint(grid, footprint.originX, footprint.originY, targetType, zone, targetLevel, services);
      anchor.level = targetLevel;
      anchorX = footprint.originX;
      anchorY = footprint.originY;
    } else if (targetLevel > building.level) {
      // If we can't merge lots, still allow incremental level gain
      building.level = Math.min(targetLevel, building.level + 1);
    }
  }

  // Always refresh stats on the anchor tile
  const anchorTile = grid[anchorY][anchorX];
  const anchorBuilding = anchorTile.building;
  anchorBuilding.powered = services.power[anchorY][anchorX];
  anchorBuilding.watered = services.water[anchorY][anchorX];
  anchorBuilding.level = Math.max(anchorBuilding.level, Math.min(targetLevel, anchorBuilding.level + 1));

  const buildingStats = BUILDING_STATS[anchorBuilding.type];
  const efficiency = (anchorBuilding.powered ? 0.5 : 0) + (anchorBuilding.watered ? 0.5 : 0);

  anchorBuilding.population = buildingStats?.maxPop > 0
    ? Math.floor(buildingStats.maxPop * Math.max(1, anchorBuilding.level) * efficiency * 0.8)
    : 0;
  anchorBuilding.jobs = buildingStats?.maxJobs > 0
    ? Math.floor(buildingStats.maxJobs * Math.max(1, anchorBuilding.level) * efficiency * 0.8)
    : 0;

  return grid[y][x].building;
}
