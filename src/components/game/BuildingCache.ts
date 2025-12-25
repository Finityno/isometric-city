/**
 * PERF: Centralized BuildingCache for O(1) building lookups
 *
 * Replaces multiple O(n²) grid scans with cached spatial data.
 * Rebuilds automatically when grid version changes.
 *
 * Used by:
 * - gridFinders.ts functions (findResidentialBuildings, findPedestrianDestinations, etc.)
 * - vehicleSystems.ts (crime spawning, emergency dispatch)
 * - pedestrianSystem.ts (spawning)
 */

import { BuildingType, Tile } from '@/types/game';
import { GridSpatialHash } from './SpatialHash';
import { PedestrianDestType } from './types';

// Building category sets for O(1) type checking
const RESIDENTIAL_TYPES = new Set<BuildingType>([
  'house_small', 'house_medium', 'mansion', 'apartment_low', 'apartment_high'
]);

const SCHOOL_TYPES = new Set<BuildingType>(['school', 'university']);

const COMMERCIAL_TYPES = new Set<BuildingType>([
  'shop_small', 'shop_medium', 'office_low', 'office_high', 'mall'
]);

const INDUSTRIAL_TYPES = new Set<BuildingType>([
  'factory_small', 'factory_medium', 'factory_large', 'warehouse'
]);

const PARK_TYPES = new Set<BuildingType>([
  'park', 'park_large', 'tennis', 'basketball_courts', 'playground_small',
  'playground_large', 'baseball_field_small', 'soccer_field_small',
  'football_field', 'baseball_stadium', 'community_center', 'swimming_pool',
  'skate_park', 'mini_golf_course', 'bleachers_field', 'go_kart_track',
  'amphitheater', 'greenhouse_garden', 'animal_pens_farm', 'cabin_house',
  'campground', 'marina_docks_small', 'pier_large', 'roller_coaster_small',
  'community_garden', 'pond_park', 'park_gate', 'mountain_lodge', 'mountain_trailhead'
]);

const SPORTS_TYPES = new Set<BuildingType>([
  'basketball_courts', 'tennis', 'soccer_field_small', 'baseball_field_small',
  'football_field', 'baseball_stadium', 'stadium', 'swimming_pool', 'skate_park'
]);

const RELAXATION_TYPES = new Set<BuildingType>([
  'park', 'park_large', 'community_garden', 'pond_park', 'greenhouse_garden',
  'amphitheater', 'campground', 'marina_docks_small', 'pier_large'
]);

const ACTIVE_RECREATION_TYPES = new Set<BuildingType>([
  'playground_small', 'playground_large', 'mini_golf_course', 'go_kart_track',
  'roller_coaster_small', 'amusement_park', 'mountain_trailhead'
]);

const ENTERABLE_TYPES = new Set<BuildingType>([
  'shop_small', 'shop_medium', 'office_low', 'office_high', 'mall',
  'school', 'university', 'hospital', 'museum', 'community_center',
  'factory_small', 'factory_medium', 'factory_large', 'warehouse',
  'police_station', 'fire_station', 'city_hall', 'rail_station',
  'subway_station', 'mountain_lodge'
]);

const HELIPORT_TYPES = new Set<BuildingType>([
  'hospital', 'airport', 'police_station', 'mall'
]);

// Building entry for spatial hash
export interface BuildingEntry {
  gridX: number;
  gridY: number;
  type: BuildingType;
  category: BuildingCategory;
}

export type BuildingCategory =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'school'
  | 'park'
  | 'sports'
  | 'relaxation'
  | 'active_recreation'
  | 'enterable'
  | 'fire_station'
  | 'police_station'
  | 'hospital'
  | 'airport'
  | 'heliport'
  | 'marina'
  | 'pier'
  | 'factory_medium'
  | 'factory_large'
  | 'on_fire'
  | 'other';

// Pedestrian destination entry
export interface PedDestEntry {
  gridX: number;
  gridY: number;
  type: BuildingType;
  destType: PedestrianDestType;
}

// Crime-eligible building entry
export interface CrimeEligibleEntry {
  gridX: number;
  gridY: number;
  type: BuildingType;
  hasActivity: boolean;
}

// Cache state
let buildingCache: {
  // Main spatial hash for all buildings by category
  byCategory: Map<BuildingCategory, { gridX: number; gridY: number; type: BuildingType }[]>;

  // Specialized lists for common queries
  residentials: { x: number; y: number }[];
  pedestrianDestinations: { x: number; y: number; type: PedestrianDestType }[];
  crimeEligibleTiles: { x: number; y: number; type: BuildingType }[];
  fires: { x: number; y: number }[];

  // Spatial hash for nearest-neighbor queries
  spatialHash: GridSpatialHash<BuildingEntry>;

  // Grid version this cache was built for
  gridVersion: number;
} | null = null;

let lastCacheGridVersion = -1;

/**
 * Get the building category for a building type
 */
function getBuildingCategory(type: BuildingType): BuildingCategory {
  if (RESIDENTIAL_TYPES.has(type)) return 'residential';
  if (SCHOOL_TYPES.has(type)) return 'school';
  if (COMMERCIAL_TYPES.has(type)) return 'commercial';
  if (INDUSTRIAL_TYPES.has(type)) return 'industrial';
  if (SPORTS_TYPES.has(type)) return 'sports';
  if (RELAXATION_TYPES.has(type)) return 'relaxation';
  if (ACTIVE_RECREATION_TYPES.has(type)) return 'active_recreation';
  if (PARK_TYPES.has(type)) return 'park';
  if (type === 'fire_station') return 'fire_station';
  if (type === 'police_station') return 'police_station';
  if (type === 'hospital') return 'hospital';
  if (type === 'airport') return 'airport';
  if (type === 'marina_docks_small') return 'marina';
  if (type === 'pier_large') return 'pier';
  if (type === 'factory_medium') return 'factory_medium';
  if (type === 'factory_large') return 'factory_large';
  return 'other';
}

/**
 * Get the pedestrian destination type for a building type
 */
function getPedDestType(type: BuildingType): PedestrianDestType | null {
  if (SCHOOL_TYPES.has(type)) return 'school';
  if (COMMERCIAL_TYPES.has(type)) return 'commercial';
  if (INDUSTRIAL_TYPES.has(type)) return 'industrial';
  if (PARK_TYPES.has(type)) return 'park';
  return null;
}

/**
 * Build or get the cached building data
 */
export function getBuildingCache(
  grid: Tile[][],
  gridSize: number,
  gridVersion: number
): typeof buildingCache {
  if (buildingCache && lastCacheGridVersion === gridVersion) {
    return buildingCache;
  }

  // Rebuild the cache
  const byCategory = new Map<BuildingCategory, { gridX: number; gridY: number; type: BuildingType }[]>();
  const residentials: { x: number; y: number }[] = [];
  const pedestrianDestinations: { x: number; y: number; type: PedestrianDestType }[] = [];
  const crimeEligibleTiles: { x: number; y: number; type: BuildingType }[] = [];
  const fires: { x: number; y: number }[] = [];
  const spatialHash = new GridSpatialHash<BuildingEntry>(8);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const tile = grid[y][x];
      const type = tile.building.type;

      // Skip non-building tiles
      if (type === 'grass' || type === 'water' || type === 'road' || type === 'empty') {
        continue;
      }

      const category = getBuildingCategory(type);

      // Add to category map
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push({ gridX: x, gridY: y, type });

      // Add to spatial hash
      spatialHash.insert({ gridX: x, gridY: y, type, category });

      // Build specialized lists
      if (RESIDENTIAL_TYPES.has(type)) {
        residentials.push({ x, y });
      }

      const destType = getPedDestType(type);
      if (destType) {
        pedestrianDestinations.push({ x, y, type: destType });
      }

      // Crime-eligible: has population or jobs
      const hasActivity = (tile.building.population || 0) > 0 || (tile.building.jobs || 0) > 0;
      if (hasActivity && type !== 'tree') {
        crimeEligibleTiles.push({ x, y, type });
      }

      // Track fires
      if (tile.building.onFire) {
        fires.push({ x, y });
      }

      // Track heliports
      if (HELIPORT_TYPES.has(type)) {
        if (!byCategory.has('heliport')) {
          byCategory.set('heliport', []);
        }
        byCategory.get('heliport')!.push({ gridX: x, gridY: y, type });
      }

      // Track enterable buildings (only if active)
      if (
        ENTERABLE_TYPES.has(type) &&
        tile.building.constructionProgress >= 100 &&
        !tile.building.abandoned
      ) {
        if (!byCategory.has('enterable')) {
          byCategory.set('enterable', []);
        }
        byCategory.get('enterable')!.push({ gridX: x, gridY: y, type });
      }
    }
  }

  buildingCache = {
    byCategory,
    residentials,
    pedestrianDestinations,
    crimeEligibleTiles,
    fires,
    spatialHash,
    gridVersion,
  };
  lastCacheGridVersion = gridVersion;

  return buildingCache;
}

/**
 * Get residential buildings from cache
 */
export function getCachedResidentialBuildings(
  grid: Tile[][],
  gridSize: number,
  gridVersion: number
): { x: number; y: number }[] {
  const cache = getBuildingCache(grid, gridSize, gridVersion);
  return cache?.residentials ?? [];
}

/**
 * Get pedestrian destinations from cache
 */
export function getCachedPedestrianDestinations(
  grid: Tile[][],
  gridSize: number,
  gridVersion: number
): { x: number; y: number; type: PedestrianDestType }[] {
  const cache = getBuildingCache(grid, gridSize, gridVersion);
  return cache?.pedestrianDestinations ?? [];
}

/**
 * Get crime-eligible tiles from cache
 */
export function getCachedCrimeEligibleTiles(
  grid: Tile[][],
  gridSize: number,
  gridVersion: number
): { x: number; y: number; type: BuildingType }[] {
  const cache = getBuildingCache(grid, gridSize, gridVersion);
  return cache?.crimeEligibleTiles ?? [];
}

/**
 * Get buildings on fire from cache
 * Note: Fires change frequently, so this may need frequent cache updates
 */
export function getCachedFires(
  grid: Tile[][],
  gridSize: number,
  gridVersion: number
): { x: number; y: number }[] {
  const cache = getBuildingCache(grid, gridSize, gridVersion);
  return cache?.fires ?? [];
}

/**
 * Get buildings by category from cache
 */
export function getCachedBuildingsByCategory(
  grid: Tile[][],
  gridSize: number,
  gridVersion: number,
  category: BuildingCategory
): { gridX: number; gridY: number; type: BuildingType }[] {
  const cache = getBuildingCache(grid, gridSize, gridVersion);
  return cache?.byCategory.get(category) ?? [];
}

/**
 * Find nearest building of a category using spatial hash
 */
export function findNearestBuildingOfCategory(
  grid: Tile[][],
  gridSize: number,
  gridVersion: number,
  x: number,
  y: number,
  category: BuildingCategory,
  maxRadius: number = gridSize
): { gridX: number; gridY: number; type: BuildingType } | null {
  const cache = getBuildingCache(grid, gridSize, gridVersion);
  if (!cache) return null;

  return cache.spatialHash.queryNearest(x, y, maxRadius, (entry) => entry.category === category);
}

/**
 * Invalidate the building cache (call when buildings are placed/demolished)
 */
export function invalidateBuildingCache(): void {
  buildingCache = null;
  lastCacheGridVersion = -1;
}
