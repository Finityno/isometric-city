import { Tile } from '@/types/game';

/**
 * Helper function to check if a tile is adjacent to water (uses pre-computed metadata for O(1) lookup)
 */
export function isAdjacentToWater(
  gridX: number,
  gridY: number,
  getTileMetadata: (x: number, y: number) => { isAdjacentToWater?: boolean } | null | undefined
): boolean {
  const metadata = getTileMetadata(gridX, gridY);
  return metadata?.isAdjacentToWater ?? false;
}

/**
 * Helper function to check if a tile is water
 */
export function isWater(gridX: number, gridY: number, grid: Tile[][], gridSize: number): boolean {
  if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) return false;
  return grid[gridY][gridX].building.type === 'water';
}

/**
 * Helper function to check if a tile has a road
 */
export function hasRoad(gridX: number, gridY: number, grid: Tile[][], gridSize: number): boolean {
  if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) return false;
  return grid[gridY][gridX].building.type === 'road';
}

/**
 * Helper function to check if a tile has a marina dock or pier (no beaches next to these)
 * Also checks 'empty' tiles that are part of multi-tile marina buildings
 */
export function hasMarinaPier(
  gridX: number,
  gridY: number,
  grid: Tile[][],
  gridSize: number
): boolean {
  if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) return false;
  const buildingType = grid[gridY][gridX].building.type;
  if (buildingType === 'marina_docks_small' || buildingType === 'pier_large') return true;

  // Check if this is an 'empty' tile that belongs to a marina (2x2 building)
  // Marina is 2x2, so check up to 1 tile away for the origin
  if (buildingType === 'empty') {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const checkX = gridX - dx;
        const checkY = gridY - dy;
        if (checkX >= 0 && checkY >= 0 && checkX < gridSize && checkY < gridSize) {
          const checkType = grid[checkY][checkX].building.type;
          if (checkType === 'marina_docks_small') {
            // Verify this tile is within the 2x2 footprint
            if (gridX >= checkX && gridX < checkX + 2 && gridY >= checkY && gridY < checkY + 2) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}
