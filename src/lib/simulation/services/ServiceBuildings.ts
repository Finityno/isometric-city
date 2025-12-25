import type { BuildingType } from '@/types/game';

/**
 * Service building configuration - defines service ranges and types
 * Exported so overlay rendering can access radii
 */
export const SERVICE_CONFIG = {
  police_station: { range: 13, rangeSquared: 169, type: 'police' as const },
  fire_station: { range: 18, rangeSquared: 324, type: 'fire' as const },
  hospital: { range: 12, rangeSquared: 144, type: 'health' as const },
  school: { range: 11, rangeSquared: 121, type: 'education' as const },
  university: { range: 19, rangeSquared: 361, type: 'education' as const },
  power_plant: { range: 15, rangeSquared: 225 },
  water_tower: { range: 12, rangeSquared: 144 },
} as const;

/**
 * Building types that provide services
 */
export const SERVICE_BUILDING_TYPES = new Set<BuildingType>([
  'police_station',
  'fire_station',
  'hospital',
  'school',
  'university',
  'power_plant',
  'water_tower',
]);

/**
 * Check if a building type is a service building
 */
export function isServiceBuilding(buildingType: BuildingType): boolean {
  return SERVICE_BUILDING_TYPES.has(buildingType);
}

/**
 * Get the service range for a building type
 * Returns undefined if the building is not a service building
 */
export function getServiceRange(buildingType: BuildingType): number | undefined {
  const config = SERVICE_CONFIG[buildingType as keyof typeof SERVICE_CONFIG];
  return config?.range;
}

/**
 * Get the service type (police, fire, health, education) for a building
 * Returns undefined if the building is a utility (power/water) or not a service building
 */
export function getServiceType(
  buildingType: BuildingType
): 'police' | 'fire' | 'health' | 'education' | undefined {
  const config = SERVICE_CONFIG[buildingType as keyof typeof SERVICE_CONFIG];
  if (!config || !('type' in config)) return undefined;
  return config.type;
}

/**
 * Check if a building type provides police service
 */
export function isPoliceBuiding(buildingType: BuildingType): boolean {
  return buildingType === 'police_station';
}

/**
 * Check if a building type provides fire service
 */
export function isFireBuilding(buildingType: BuildingType): boolean {
  return buildingType === 'fire_station';
}

/**
 * Check if a building type provides health service
 */
export function isHealthBuilding(buildingType: BuildingType): boolean {
  return buildingType === 'hospital';
}

/**
 * Check if a building type provides education service
 */
export function isEducationBuilding(buildingType: BuildingType): boolean {
  return buildingType === 'school' || buildingType === 'university';
}

/**
 * Check if a building type provides power
 */
export function isPowerBuilding(buildingType: BuildingType): boolean {
  return buildingType === 'power_plant';
}

/**
 * Check if a building type provides water
 */
export function isWaterBuilding(buildingType: BuildingType): boolean {
  return buildingType === 'water_tower';
}
