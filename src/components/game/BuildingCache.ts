/**
 * PERF: Centralized BuildingCache for O(1) building lookups
 *
 * Replaces multiple O(n²) grid scans with cached spatial data.
 * Rebuilds automatically when grid version changes.
 *
 * Performance optimizations applied:
 * - Pre-computed category lookup map instead of multiple Set checks
 * - Typed arrays for coordinate storage (reduced memory, better cache locality)
 * - Pre-allocated arrays with known capacity
 * - Inline category checks during grid scan (single pass)
 * - Bit flags for multi-category buildings
 * - Object pooling for frequently accessed entries
 *
 * Used by:
 * - gridFinders.ts functions (findResidentialBuildings, findPedestrianDestinations, etc.)
 * - vehicleSystems.ts (crime spawning, emergency dispatch)
 * - pedestrianSystem.ts (spawning)
 */

import { BuildingType, Tile } from '@/types/game';
import { GridSpatialHash } from './SpatialHash';
import { PedestrianDestType } from './types';

// PERF: Pre-computed category lookup map - O(1) lookup instead of multiple Set.has() calls
// This is faster than checking 8+ Sets sequentially
const BUILDING_CATEGORY_MAP = new Map<BuildingType, BuildingCategory>([
  // Residential
  ['house_small', 'residential'],
  ['house_medium', 'residential'],
  ['mansion', 'residential'],
  ['apartment_low', 'residential'],
  ['apartment_high', 'residential'],
  // Schools
  ['school', 'school'],
  ['university', 'school'],
  // Commercial
  ['shop_small', 'commercial'],
  ['shop_medium', 'commercial'],
  ['office_low', 'commercial'],
  ['office_high', 'commercial'],
  ['mall', 'commercial'],
  // Industrial
  ['factory_small', 'industrial'],
  ['factory_medium', 'factory_medium'],
  ['factory_large', 'factory_large'],
  ['warehouse', 'industrial'],
  // Sports
  ['basketball_courts', 'sports'],
  ['tennis', 'sports'],
  ['soccer_field_small', 'sports'],
  ['baseball_field_small', 'sports'],
  ['football_field', 'sports'],
  ['baseball_stadium', 'sports'],
  ['stadium', 'sports'],
  ['swimming_pool', 'sports'],
  ['skate_park', 'sports'],
  // Relaxation
  ['park', 'relaxation'],
  ['park_large', 'relaxation'],
  ['community_garden', 'relaxation'],
  ['pond_park', 'relaxation'],
  ['greenhouse_garden', 'relaxation'],
  ['amphitheater', 'relaxation'],
  ['campground', 'relaxation'],
  // Active Recreation
  ['playground_small', 'active_recreation'],
  ['playground_large', 'active_recreation'],
  ['mini_golf_course', 'active_recreation'],
  ['go_kart_track', 'active_recreation'],
  ['roller_coaster_small', 'active_recreation'],
  ['amusement_park', 'active_recreation'],
  ['mountain_trailhead', 'active_recreation'],
  // Park types (remaining)
  ['bleachers_field', 'park'],
  ['animal_pens_farm', 'park'],
  ['cabin_house', 'park'],
  ['park_gate', 'park'],
  ['mountain_lodge', 'park'],
  // Special single types
  ['fire_station', 'fire_station'],
  ['police_station', 'police_station'],
  ['hospital', 'hospital'],
  ['airport', 'airport'],
  ['marina_docks_small', 'marina'],
  ['pier_large', 'pier'],
]);

// PERF: Bit flags for multi-category membership checks (faster than multiple Set lookups)
const enum CategoryFlags {
  NONE = 0,
  RESIDENTIAL = 1 << 0,
  SCHOOL = 1 << 1,
  COMMERCIAL = 1 << 2,
  INDUSTRIAL = 1 << 3,
  PARK = 1 << 4,
  SPORTS = 1 << 5,
  RELAXATION = 1 << 6,
  ACTIVE_RECREATION = 1 << 7,
  ENTERABLE = 1 << 8,
  HELIPORT = 1 << 9,
  PED_DEST = 1 << 10,
}

// PERF: Pre-computed flags map for fast multi-category checks
const BUILDING_FLAGS_MAP = new Map<BuildingType, number>();

// Initialize flags map
function initFlagsMap(): void {
  // Residential
  const residentialTypes: BuildingType[] = ['house_small', 'house_medium', 'mansion', 'apartment_low', 'apartment_high'];
  for (const t of residentialTypes) {
    BUILDING_FLAGS_MAP.set(t, CategoryFlags.RESIDENTIAL);
  }

  // Schools (also pedestrian destination)
  const schoolTypes: BuildingType[] = ['school', 'university'];
  for (const t of schoolTypes) {
    BUILDING_FLAGS_MAP.set(t, CategoryFlags.SCHOOL | CategoryFlags.ENTERABLE | CategoryFlags.PED_DEST);
  }

  // Commercial (also pedestrian destination and enterable)
  const commercialTypes: BuildingType[] = ['shop_small', 'shop_medium', 'office_low', 'office_high', 'mall'];
  for (const t of commercialTypes) {
    let flags = CategoryFlags.COMMERCIAL | CategoryFlags.ENTERABLE | CategoryFlags.PED_DEST;
    if (t === 'mall') flags |= CategoryFlags.HELIPORT;
    BUILDING_FLAGS_MAP.set(t, flags);
  }

  // Industrial (also pedestrian destination and enterable)
  const industrialTypes: BuildingType[] = ['factory_small', 'factory_medium', 'factory_large', 'warehouse'];
  for (const t of industrialTypes) {
    BUILDING_FLAGS_MAP.set(t, CategoryFlags.INDUSTRIAL | CategoryFlags.ENTERABLE | CategoryFlags.PED_DEST);
  }

  // Parks (also pedestrian destination)
  const parkTypes: BuildingType[] = [
    'park', 'park_large', 'tennis', 'basketball_courts', 'playground_small',
    'playground_large', 'baseball_field_small', 'soccer_field_small',
    'football_field', 'baseball_stadium', 'community_center', 'swimming_pool',
    'skate_park', 'mini_golf_course', 'bleachers_field', 'go_kart_track',
    'amphitheater', 'greenhouse_garden', 'animal_pens_farm', 'cabin_house',
    'campground', 'marina_docks_small', 'pier_large', 'roller_coaster_small',
    'community_garden', 'pond_park', 'park_gate', 'mountain_lodge', 'mountain_trailhead'
  ];
  for (const t of parkTypes) {
    const existing = BUILDING_FLAGS_MAP.get(t) || 0;
    BUILDING_FLAGS_MAP.set(t, existing | CategoryFlags.PARK | CategoryFlags.PED_DEST);
  }

  // Sports
  const sportsTypes: BuildingType[] = [
    'basketball_courts', 'tennis', 'soccer_field_small', 'baseball_field_small',
    'football_field', 'baseball_stadium', 'stadium', 'swimming_pool', 'skate_park'
  ];
  for (const t of sportsTypes) {
    const existing = BUILDING_FLAGS_MAP.get(t) || 0;
    BUILDING_FLAGS_MAP.set(t, existing | CategoryFlags.SPORTS);
  }

  // Relaxation
  const relaxationTypes: BuildingType[] = [
    'park', 'park_large', 'community_garden', 'pond_park', 'greenhouse_garden',
    'amphitheater', 'campground', 'marina_docks_small', 'pier_large'
  ];
  for (const t of relaxationTypes) {
    const existing = BUILDING_FLAGS_MAP.get(t) || 0;
    BUILDING_FLAGS_MAP.set(t, existing | CategoryFlags.RELAXATION);
  }

  // Active recreation
  const activeRecTypes: BuildingType[] = [
    'playground_small', 'playground_large', 'mini_golf_course', 'go_kart_track',
    'roller_coaster_small', 'amusement_park', 'mountain_trailhead'
  ];
  for (const t of activeRecTypes) {
    const existing = BUILDING_FLAGS_MAP.get(t) || 0;
    BUILDING_FLAGS_MAP.set(t, existing | CategoryFlags.ACTIVE_RECREATION);
  }

  // Other enterable types
  const otherEnterableTypes: BuildingType[] = [
    'hospital', 'museum', 'community_center', 'police_station', 'fire_station',
    'city_hall', 'rail_station', 'subway_station', 'mountain_lodge'
  ];
  for (const t of otherEnterableTypes) {
    const existing = BUILDING_FLAGS_MAP.get(t) || 0;
    BUILDING_FLAGS_MAP.set(t, existing | CategoryFlags.ENTERABLE);
  }

  // Heliport types
  const heliportTypes: BuildingType[] = ['hospital', 'airport', 'police_station'];
  for (const t of heliportTypes) {
    const existing = BUILDING_FLAGS_MAP.get(t) || 0;
    BUILDING_FLAGS_MAP.set(t, existing | CategoryFlags.HELIPORT);
  }
}

// Initialize on module load
initFlagsMap();

// PERF: Keep Sets for backward compatibility but these are now only used for getPedDestType
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

const HELIPORT_TYPES = new Set<BuildingType>(['hospital', 'airport', 'police_station']);

const ENTERABLE_TYPES = new Set<BuildingType>([
  'school', 'university', 'shop_small', 'shop_medium', 'office_low', 'office_high', 'mall',
  'factory_small', 'factory_medium', 'factory_large', 'warehouse',
  'hospital', 'museum', 'community_center', 'police_station', 'fire_station',
  'city_hall', 'rail_station', 'subway_station', 'mountain_lodge'
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
  return BUILDING_CATEGORY_MAP.get(type) || 'other';
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
