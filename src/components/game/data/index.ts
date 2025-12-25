export { getBuildingCache, getCachedResidentialBuildings, getCachedPedestrianDestinations, getCachedCrimeEligibleTiles, getCachedFires, getCachedBuildingsByCategory, findNearestBuildingOfCategory, invalidateBuildingCache } from './BuildingCache';
export type { BuildingEntry, BuildingCategory, PedDestEntry, CrimeEligibleEntry } from './BuildingCache';
export { SpatialHash, GridSpatialHash } from './SpatialHash';
