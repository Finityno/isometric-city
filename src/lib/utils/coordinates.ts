/**
 * Coordinate transformation utilities for isometric grid
 *
 * This module provides functions to convert between grid coordinates (x, y)
 * and screen coordinates (screenX, screenY) for isometric projection.
 *
 * Isometric projection constants:
 * - TILE_WIDTH: 64px
 * - TILE_HEIGHT: 38.4px (0.60 ratio)
 */

// Import tile dimensions from game types
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';

/**
 * Convert grid coordinates to screen coordinates (isometric projection)
 *
 * @param x - Grid X coordinate
 * @param y - Grid Y coordinate
 * @param offsetX - Screen X offset (camera position)
 * @param offsetY - Screen Y offset (camera position)
 * @returns Object with screenX and screenY coordinates
 */
export function gridToScreen(
  x: number,
  y: number,
  offsetX: number,
  offsetY: number
): { screenX: number; screenY: number } {
  const screenX = (x - y) * (TILE_WIDTH / 2) + offsetX;
  const screenY = (x + y) * (TILE_HEIGHT / 2) + offsetY;
  return { screenX, screenY };
}

/**
 * Convert screen coordinates to grid coordinates (isometric projection)
 *
 * Adjusts for the fact that tile centers are offset by half a tile from
 * gridToScreen coordinates. gridToScreen returns the top-left corner of
 * the bounding box, but the visual center of the diamond tile is at
 * (screenX + TILE_WIDTH/2, screenY + TILE_HEIGHT/2)
 *
 * @param screenX - Screen X coordinate
 * @param screenY - Screen Y coordinate
 * @param offsetX - Screen X offset (camera position)
 * @param offsetY - Screen Y offset (camera position)
 * @returns Object with gridX and gridY coordinates (rounded to nearest tile)
 */
export function screenToGrid(
  screenX: number,
  screenY: number,
  offsetX: number,
  offsetY: number
): { gridX: number; gridY: number } {
  // Adjust for the fact that tile centers are offset by half a tile from gridToScreen coordinates
  // gridToScreen returns the top-left corner of the bounding box, but the visual center of the
  // diamond tile is at (screenX + TILE_WIDTH/2, screenY + TILE_HEIGHT/2)
  const adjustedX = screenX - offsetX - TILE_WIDTH / 2;
  const adjustedY = screenY - offsetY - TILE_HEIGHT / 2;

  const gridX = (adjustedX / (TILE_WIDTH / 2) + adjustedY / (TILE_HEIGHT / 2)) / 2;
  const gridY = (adjustedY / (TILE_HEIGHT / 2) - adjustedX / (TILE_WIDTH / 2)) / 2;

  // Use Math.round for accurate tile selection - this gives us the tile whose center is closest
  return { gridX: Math.round(gridX), gridY: Math.round(gridY) };
}
