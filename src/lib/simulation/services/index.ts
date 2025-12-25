/**
 * Services module - handles service coverage, utilities, and service buildings
 *
 * This module contains the logic for:
 * - Calculating service coverage (police, fire, health, education)
 * - Managing power and water networks
 * - Service building configuration and detection
 */

// Service Coverage
export {
  createServiceCoverage,
  calculateServiceCoverage,
  invalidateServiceBuildingCache,
} from './ServiceCoverage';

// Service Buildings
export {
  SERVICE_CONFIG,
  SERVICE_BUILDING_TYPES,
  isServiceBuilding,
  getServiceRange,
  getServiceType,
  isPoliceBuiding,
  isFireBuilding,
  isHealthBuilding,
  isEducationBuilding,
  isPowerBuilding,
  isWaterBuilding,
} from './ServiceBuildings';

// Utilities
export {
  hasFullUtilities,
  hasAnyUtility,
  calculateUtilityEfficiency,
  isUtilityBuilding,
  canConstructWithoutUtilities,
} from './Utilities';
