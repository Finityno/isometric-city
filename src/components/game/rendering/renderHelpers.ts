/**
 * Shared rendering helper utilities for canvas drawing operations
 *
 * PERFORMANCE OPTIMIZED:
 * - Pre-computed constants to avoid repeated calculations
 * - Set-based lookups for O(1) type checking
 * - Reusable objects to avoid allocations in hot paths
 * - Inlined calculations where beneficial
 * - Cached inverse values to replace division with multiplication
 */

import { BuildingType, Tile } from '@/types/game';
import { TILE_WIDTH, TILE_HEIGHT } from '../types';

// Pre-computed constants - avoid repeated calculations
const TILE_HEIGHT_X2 = TILE_HEIGHT * 2;
const DEFAULT_LEFT_PAD = TILE_WIDTH;
const DEFAULT_RIGHT_PAD = TILE_WIDTH;
const DEFAULT_TOP_PAD = TILE_HEIGHT_X2;
const DEFAULT_BOTTOM_PAD = TILE_HEIGHT_X2;

/**
 * Viewport bounds for culling objects outside the visible area
 */
export interface ViewportBounds {
  viewLeft: number;
  viewTop: number;
  viewRight: number;
  viewBottom: number;
  viewWidth: number;
  viewHeight: number;
}

// Reusable viewport bounds object to avoid allocations
// IMPORTANT: Only use when caller doesn't need to store the result
const _reusableBounds: ViewportBounds = {
  viewLeft: 0,
  viewTop: 0,
  viewRight: 0,
  viewBottom: 0,
  viewWidth: 0,
  viewHeight: 0,
};

/**
 * Building types that don't occlude vehicles/pedestrians
 * Using Set for O(1) lookup instead of Array.includes O(n)
 */
const NON_OCCLUDING_SET: Set<BuildingType> = new Set(['road', 'grass', 'empty', 'water', 'tree']);

/**
 * Calculate viewport bounds for rendering culling
 *
 * @param reusable - If true, returns a reusable object (caller must not store it)
 */
export function calculateViewportBounds(
  canvas: HTMLCanvasElement,
  offset: { x: number; y: number },
  zoom: number,
  dpr: number,
  padding?: { left?: number; right?: number; top?: number; bottom?: number },
  reusable: boolean = false
): ViewportBounds {
  // Pre-compute inverse to replace divisions with multiplications
  const invDprZoom = 1 / (dpr * zoom);
  const invZoom = 1 / zoom;

  const viewWidth = canvas.width * invDprZoom;
  const viewHeight = canvas.height * invDprZoom;

  // Use default values directly when no padding provided (common case)
  const leftPad = padding?.left ?? DEFAULT_LEFT_PAD;
  const rightPad = padding?.right ?? DEFAULT_RIGHT_PAD;
  const topPad = padding?.top ?? DEFAULT_TOP_PAD;
  const bottomPad = padding?.bottom ?? DEFAULT_BOTTOM_PAD;

  // Pre-compute offset/zoom once
  const offsetXInvZoom = -offset.x * invZoom;
  const offsetYInvZoom = -offset.y * invZoom;

  if (reusable) {
    // Update reusable object to avoid allocation
    _reusableBounds.viewWidth = viewWidth;
    _reusableBounds.viewHeight = viewHeight;
    _reusableBounds.viewLeft = offsetXInvZoom - leftPad;
    _reusableBounds.viewTop = offsetYInvZoom - topPad;
    _reusableBounds.viewRight = viewWidth + offsetXInvZoom + rightPad;
    _reusableBounds.viewBottom = viewHeight + offsetYInvZoom + bottomPad;
    return _reusableBounds;
  }

  return {
    viewWidth,
    viewHeight,
    viewLeft: offsetXInvZoom - leftPad,
    viewTop: offsetYInvZoom - topPad,
    viewRight: viewWidth + offsetXInvZoom + rightPad,
    viewBottom: viewHeight + offsetYInvZoom + bottomPad,
  };
}

/**
 * Check if an entity at a given tile position is occluded by a building in front of it
 * Uses isometric depth sorting - entities with lower depth (x+y) are behind higher depth
 *
 * OPTIMIZED: Loop unrolled for the 3 adjacent tiles (0,1), (1,0), (1,1)
 * OPTIMIZED: Uses Set.has() for O(1) lookup instead of Array.includes()
 * OPTIMIZED: Early bounds check before grid access
 */
export function isEntityBehindBuilding(
  grid: Tile[][],
  gridSize: number,
  entityTileX: number,
  entityTileY: number
): boolean {
  const entityDepth = entityTileX + entityTileY;
  const maxIndex = gridSize - 1;

  // Unrolled loop for the 3 tiles we need to check: (x+1,y), (x,y+1), (x+1,y+1)
  // This eliminates loop overhead and the (0,0) skip check

  // Check (entityTileX + 1, entityTileY) - depth = entityDepth + 1
  {
    const checkX = entityTileX + 1;
    if (checkX <= maxIndex && entityTileY >= 0 && entityTileY <= maxIndex) {
      const row = grid[entityTileY];
      if (row) {
        const tile = row[checkX];
        if (tile && !NON_OCCLUDING_SET.has(tile.building.type)) {
          // buildingDepth = checkX + entityTileY = entityDepth + 1 > entityDepth (always true)
          return true;
        }
      }
    }
  }

  // Check (entityTileX, entityTileY + 1) - depth = entityDepth + 1
  {
    const checkY = entityTileY + 1;
    if (checkY <= maxIndex && entityTileX >= 0 && entityTileX <= maxIndex) {
      const row = grid[checkY];
      if (row) {
        const tile = row[entityTileX];
        if (tile && !NON_OCCLUDING_SET.has(tile.building.type)) {
          // buildingDepth = entityTileX + checkY = entityDepth + 1 > entityDepth (always true)
          return true;
        }
      }
    }
  }

  // Check (entityTileX + 1, entityTileY + 1) - depth = entityDepth + 2
  {
    const checkX = entityTileX + 1;
    const checkY = entityTileY + 1;
    if (checkX <= maxIndex && checkY <= maxIndex) {
      const row = grid[checkY];
      if (row) {
        const tile = row[checkX];
        if (tile && !NON_OCCLUDING_SET.has(tile.building.type)) {
          // buildingDepth = checkX + checkY = entityDepth + 2 > entityDepth (always true)
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a point is within viewport bounds
 */
export function isInViewport(
  x: number,
  y: number,
  bounds: ViewportBounds,
  entityPadding: { x?: number; y?: number } = {}
): boolean {
  const padX = entityPadding.x ?? 0;
  const padY = entityPadding.y ?? 0;
  
  return (
    x >= bounds.viewLeft - padX &&
    x <= bounds.viewRight + padX &&
    y >= bounds.viewTop - padY &&
    y <= bounds.viewBottom + padY
  );
}

/**
 * Setup canvas context with standard transforms for world rendering
 */
export function setupCanvasContext(
  ctx: CanvasRenderingContext2D,
  offset: { x: number; y: number },
  zoom: number,
  dpr: number
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr * zoom, dpr * zoom);
  ctx.translate(offset.x / zoom, offset.y / zoom);
}

/**
 * Clear canvas and reset transforms
 */
export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  const canvas = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
