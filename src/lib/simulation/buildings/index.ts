// Building Rules - adjacency and requirements
export {
  requiresWaterAdjacency,
  getWaterAdjacency,
  getRoadAdjacency,
  isStarterBuilding,
} from './BuildingRules';

// Building Placement - placing, bulldozing, and footprint management
export {
  getBuildingSize,
  canPlaceMultiTileBuilding,
  canSpawnMultiTileBuilding,
  findBuildingOrigin,
  applyBuildingFootprint,
  placeBuilding,
  bulldozeTile,
  placeSubway,
  invalidateServiceBuildingCache,
} from './BuildingPlacement';

// Building Evolution - growth and abandonment
export {
  evolveBuilding,
  findFootprintIncludingTile,
} from './BuildingEvolution';
