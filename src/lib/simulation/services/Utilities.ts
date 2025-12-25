import type { Building } from '@/types/game';

/**
 * Utilities module - helpers for power and water network logic
 *
 * Note: The actual power/water network calculation (flood-fill coverage)
 * is implemented in ServiceCoverage.ts as part of calculateServiceCoverage.
 * This module contains helper functions for checking utility status.
 */

/**
 * Check if a building has both power and water utilities
 */
export function hasFullUtilities(building: Building): boolean {
  return building.powered && building.watered;
}

/**
 * Check if a building has at least one utility (power or water)
 */
export function hasAnyUtility(building: Building): boolean {
  return building.powered || building.watered;
}

/**
 * Calculate efficiency based on utility availability
 * Returns 0.5 for each utility (power and water)
 */
export function calculateUtilityEfficiency(building: Building): number {
  return (building.powered ? 0.5 : 0) + (building.watered ? 0.5 : 0);
}

/**
 * Check if a building type is a utility building (power plant or water tower)
 */
export function isUtilityBuilding(buildingType: string): boolean {
  return buildingType === 'power_plant' || buildingType === 'water_tower';
}

/**
 * Check if a building can construct without utilities
 * Utility buildings themselves don't need power/water to be built
 */
export function canConstructWithoutUtilities(buildingType: string): boolean {
  return isUtilityBuilding(buildingType);
}
