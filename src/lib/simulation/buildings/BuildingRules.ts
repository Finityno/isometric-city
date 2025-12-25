import type { Tile, BuildingType } from '@/types/game';

// Building types that require water adjacency
const WATERFRONT_BUILDINGS: BuildingType[] = ['marina_docks_small', 'pier_large'];

export function requiresWaterAdjacency(buildingType: BuildingType): boolean {
  return WATERFRONT_BUILDINGS.includes(buildingType);
}

// Check if a building footprint is adjacent to water (for multi-tile buildings, any edge touching water counts)
// Returns whether water is found and if the sprite should be flipped to face it
// In isometric view, sprites can only be normal or horizontally mirrored
export function getWaterAdjacency(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  gridSize: number
): { hasWater: boolean; shouldFlip: boolean } {
  // In isometric view (looking from SE toward NW):
  // - The default sprite faces toward the "front" (south-east in world coords)
  // - To face the opposite direction, we flip horizontally

  // Check all four edges and track which sides have water
  let waterOnSouthOrEast = false; // "Front" sides - no flip needed
  let waterOnNorthOrWest = false; // "Back" sides - flip needed

  // Check south edge (y + height) - front-right in isometric view
  for (let dx = 0; dx < width; dx++) {
    const checkX = x + dx;
    const checkY = y + height;
    if (checkY < gridSize && grid[checkY]?.[checkX]?.building.type === 'water') {
      waterOnSouthOrEast = true;
      break;
    }
  }

  // Check east edge (x + width) - front-left in isometric view
  if (!waterOnSouthOrEast) {
    for (let dy = 0; dy < height; dy++) {
      const checkX = x + width;
      const checkY = y + dy;
      if (checkX < gridSize && grid[checkY]?.[checkX]?.building.type === 'water') {
        waterOnSouthOrEast = true;
        break;
      }
    }
  }

  // Check north edge (y - 1) - back-left in isometric view
  for (let dx = 0; dx < width; dx++) {
    const checkX = x + dx;
    const checkY = y - 1;
    if (checkY >= 0 && grid[checkY]?.[checkX]?.building.type === 'water') {
      waterOnNorthOrWest = true;
      break;
    }
  }

  // Check west edge (x - 1) - back-right in isometric view
  if (!waterOnNorthOrWest) {
    for (let dy = 0; dy < height; dy++) {
      const checkX = x - 1;
      const checkY = y + dy;
      if (checkX >= 0 && grid[checkY]?.[checkX]?.building.type === 'water') {
        waterOnNorthOrWest = true;
        break;
      }
    }
  }

  const hasWater = waterOnSouthOrEast || waterOnNorthOrWest;
  // Only flip if water is on the back sides and NOT on the front sides
  const shouldFlip = hasWater && waterOnNorthOrWest && !waterOnSouthOrEast;

  return { hasWater, shouldFlip };
}

// Check if a building footprint is adjacent to roads and determine flip direction
// Similar to getWaterAdjacency but for roads - makes buildings face the road
export function getRoadAdjacency(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  gridSize: number
): { hasRoad: boolean; shouldFlip: boolean } {
  // In isometric view (looking from SE toward NW):
  // - The default sprite faces toward the "front" (south-east in world coords)
  // - To face the opposite direction, we flip horizontally

  // Check all four edges and track which sides have roads
  let roadOnSouthOrEast = false; // "Front" sides - no flip needed
  let roadOnNorthOrWest = false; // "Back" sides - flip needed

  // Check south edge (y + height) - front-right in isometric view
  for (let dx = 0; dx < width; dx++) {
    const checkX = x + dx;
    const checkY = y + height;
    if (checkY < gridSize && grid[checkY]?.[checkX]?.building.type === 'road') {
      roadOnSouthOrEast = true;
      break;
    }
  }

  // Check east edge (x + width) - front-left in isometric view
  if (!roadOnSouthOrEast) {
    for (let dy = 0; dy < height; dy++) {
      const checkX = x + width;
      const checkY = y + dy;
      if (checkX < gridSize && grid[checkY]?.[checkX]?.building.type === 'road') {
        roadOnSouthOrEast = true;
        break;
      }
    }
  }

  // Check north edge (y - 1) - back-left in isometric view
  for (let dx = 0; dx < width; dx++) {
    const checkX = x + dx;
    const checkY = y - 1;
    if (checkY >= 0 && grid[checkY]?.[checkX]?.building.type === 'road') {
      roadOnNorthOrWest = true;
      break;
    }
  }

  // Check west edge (x - 1) - back-right in isometric view
  if (!roadOnNorthOrWest) {
    for (let dy = 0; dy < height; dy++) {
      const checkX = x - 1;
      const checkY = y + dy;
      if (checkX >= 0 && grid[checkY]?.[checkX]?.building.type === 'road') {
        roadOnNorthOrWest = true;
        break;
      }
    }
  }

  const hasRoad = roadOnSouthOrEast || roadOnNorthOrWest;
  // Only flip if road is on the back sides and NOT on the front sides
  const shouldFlip = hasRoad && roadOnNorthOrWest && !roadOnSouthOrEast;

  return { hasRoad, shouldFlip };
}

export function isStarterBuilding(x: number, y: number, buildingType: string): boolean {
  if (buildingType === 'house_small' || buildingType === 'shop_small') return true;
  // ALL factory_small are starters - they can spawn without utilities
  // Some will render as farms (~50%), others as small factories
  // Both represent small-scale operations that can function off-grid
  if (buildingType === 'factory_small') return true;
  return false;
}
