import { Tile } from '@/types/game';
import { CarDirection, TILE_WIDTH, TILE_HEIGHT } from './types';
import { OPPOSITE_DIRECTION, HALF_TILE_WIDTH, HALF_TILE_HEIGHT } from './constants';

// Constants
const MAX_ROAD_SEARCH_DISTANCE = 20;
const MAX_GRID_SIZE = 256;

// PERF: Pre-allocated typed arrays for BFS pathfinding to reduce GC pressure
// Max path length of 2048 nodes should be sufficient for most city sizes
const MAX_PATH_LENGTH = 2048;
const BFS_QUEUE_X = new Int16Array(MAX_PATH_LENGTH);
const BFS_QUEUE_Y = new Int16Array(MAX_PATH_LENGTH);
const BFS_PARENT_IDX = new Int16Array(MAX_PATH_LENGTH); // Parent index for O(1) path reconstruction

// Visited array versioning - avoids O(n) clear on each BFS call
let bfsVisitedVersion = 0;
const BFS_VISITED_VERSION = new Uint8Array(MAX_GRID_SIZE * MAX_GRID_SIZE);

// PERF: LRU cache for pathfinding results
// Caches computed paths to avoid repeated BFS for same start/target pairs
const PATH_CACHE_MAX_SIZE = 50;
type PathCacheEntry = {
  path: { x: number; y: number }[] | null;
  lastUsed: number;
};
const pathCache = new Map<string, PathCacheEntry>();
let pathCacheVersion = 0; // Incremented when grid changes (roads added/removed)
let currentGridVersion = -1;

// PERF: Pre-allocated direction arrays to avoid allocation in getDirectionOptions
const DIRECTION_RESULT: CarDirection[] = [];

// Call this when roads are added/removed to invalidate path cache
export function invalidatePathCache(): void {
  pathCache.clear();
  pathCacheVersion++;
}

// Update grid version for cache invalidation detection
export function setPathCacheGridVersion(version: number): void {
  if (version !== currentGridVersion) {
    currentGridVersion = version;
    pathCache.clear();
    pathCacheVersion++;
  }
}

// PERF: Use numeric cache key to avoid string allocation
// Encodes 4 coordinates into a single string using bit manipulation
// Supports coordinates 0-65535 (16 bits each)
function getPathCacheKey(startX: number, startY: number, targetX: number, targetY: number): string {
  // Using string template is still fastest for Map keys, but we minimize allocations
  // by using a compact format
  return `${startX}|${startY}|${targetX}|${targetY}`;
}

function evictOldestCacheEntry(): void {
  if (pathCache.size === 0) return;

  let oldestKey: string | null = null;
  let oldestTime = Infinity;

  for (const [key, entry] of pathCache) {
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    pathCache.delete(oldestKey);
  }
}

// Get opposite direction
// PERF: Inlined in hot paths, but exported for external use
export function getOppositeDirection(direction: CarDirection): CarDirection {
  return OPPOSITE_DIRECTION[direction];
}

// Check if a tile is a road
// PERF: Inlined in hot paths, but exported for external use
export function isRoadTile(gridData: Tile[][], gridSizeValue: number, x: number, y: number): boolean {
  // PERF: Use unsigned comparison trick - if x < 0, (x >>> 0) will be a large number > gridSizeValue
  // This combines the bounds checks into fewer comparisons
  if ((x >>> 0) >= gridSizeValue || (y >>> 0) >= gridSizeValue) return false;
  return gridData[y][x].building.type === 'road';
}

// Get available direction options from a tile
// PERF: Uses pre-allocated array and inline road checks
export function getDirectionOptions(gridData: Tile[][], gridSizeValue: number, x: number, y: number): CarDirection[] {
  // PERF: Reuse pre-allocated array
  DIRECTION_RESULT.length = 0;

  // PERF: Inline isRoadTile checks to avoid function call overhead
  // Check north (x-1, y)
  const x1 = x - 1;
  if ((x1 >>> 0) < gridSizeValue && gridData[y][x1].building.type === 'road') {
    DIRECTION_RESULT.push('north');
  }
  // Check east (x, y-1)
  const y1 = y - 1;
  if ((y1 >>> 0) < gridSizeValue && gridData[y1][x].building.type === 'road') {
    DIRECTION_RESULT.push('east');
  }
  // Check south (x+1, y)
  const x2 = x + 1;
  if (x2 < gridSizeValue && gridData[y][x2].building.type === 'road') {
    DIRECTION_RESULT.push('south');
  }
  // Check west (x, y+1)
  const y2 = y + 1;
  if (y2 < gridSizeValue && gridData[y2][x].building.type === 'road') {
    DIRECTION_RESULT.push('west');
  }

  return DIRECTION_RESULT;
}

// PERF: Pre-allocated arrays for pickNextDirection to avoid allocations
const FILTERED_DIRECTIONS: CarDirection[] = [];

// Pick next direction for vehicle movement
// PERF: Avoids array allocations by using pre-allocated arrays and inline checks
export function pickNextDirection(
  previousDirection: CarDirection,
  gridData: Tile[][],
  gridSizeValue: number,
  x: number,
  y: number
): CarDirection | null {
  // PERF: Inline direction options gathering to avoid function call
  let optionCount = 0;
  const incoming = OPPOSITE_DIRECTION[previousDirection];

  // PERF: Check each direction inline and filter in one pass
  FILTERED_DIRECTIONS.length = 0;
  let hasNonIncoming = false;

  // Check north (x-1, y)
  const x1 = x - 1;
  if ((x1 >>> 0) < gridSizeValue && gridData[y][x1].building.type === 'road') {
    optionCount++;
    if ('north' !== incoming) {
      FILTERED_DIRECTIONS.push('north');
      hasNonIncoming = true;
    }
  }
  // Check east (x, y-1)
  const y1 = y - 1;
  if ((y1 >>> 0) < gridSizeValue && gridData[y1][x].building.type === 'road') {
    optionCount++;
    if ('east' !== incoming) {
      FILTERED_DIRECTIONS.push('east');
      hasNonIncoming = true;
    }
  }
  // Check south (x+1, y)
  const x2 = x + 1;
  if (x2 < gridSizeValue && gridData[y][x2].building.type === 'road') {
    optionCount++;
    if ('south' !== incoming) {
      FILTERED_DIRECTIONS.push('south');
      hasNonIncoming = true;
    }
  }
  // Check west (x, y+1)
  const y2 = y + 1;
  if (y2 < gridSizeValue && gridData[y2][x].building.type === 'road') {
    optionCount++;
    if ('west' !== incoming) {
      FILTERED_DIRECTIONS.push('west');
      hasNonIncoming = true;
    }
  }

  if (optionCount === 0) return null;

  // If we have non-incoming directions, use those; otherwise use all options
  if (hasNonIncoming) {
    // PERF: Use bitwise OR 0 for fast floor
    return FILTERED_DIRECTIONS[(Math.random() * FILTERED_DIRECTIONS.length) | 0];
  }

  // All options are incoming (dead end U-turn), rebuild options array
  DIRECTION_RESULT.length = 0;
  if ((x1 >>> 0) < gridSizeValue && gridData[y][x1].building.type === 'road') DIRECTION_RESULT.push('north');
  if ((y1 >>> 0) < gridSizeValue && gridData[y1][x].building.type === 'road') DIRECTION_RESULT.push('east');
  if (x2 < gridSizeValue && gridData[y][x2].building.type === 'road') DIRECTION_RESULT.push('south');
  if (y2 < gridSizeValue && gridData[y2][x].building.type === 'road') DIRECTION_RESULT.push('west');

  return DIRECTION_RESULT[(Math.random() * DIRECTION_RESULT.length) | 0];
}

// PERF: Pre-allocated arrays for findNearestRoadToBuilding BFS
const ROAD_BFS_MAX_SIZE = 4096; // Max tiles to check
const ROAD_BFS_QUEUE_X = new Int16Array(ROAD_BFS_MAX_SIZE);
const ROAD_BFS_QUEUE_Y = new Int16Array(ROAD_BFS_MAX_SIZE);
const ROAD_BFS_QUEUE_DIST = new Int16Array(ROAD_BFS_MAX_SIZE);

// Visited array versioning for road BFS - avoids O(n) clear
let roadBfsVisitedVersion = 0;
const ROAD_BFS_VISITED_VERSION = new Uint8Array(MAX_GRID_SIZE * MAX_GRID_SIZE);

// Direction offsets for 8-directional search
const ADJ_DX = [-1, 1, 0, 0, -1, -1, 1, 1];
const ADJ_DY = [0, 0, -1, 1, -1, 1, -1, 1];

// Find the nearest road tile adjacent to a building
// PERF: Uses pre-allocated typed arrays, numeric visited keys, and version-based clearing
export function findNearestRoadToBuilding(
  gridData: Tile[][],
  gridSizeValue: number,
  buildingX: number,
  buildingY: number
): { x: number; y: number } | null {
  // Check adjacent tiles first (distance 1) - including diagonals
  for (let d = 0; d < 8; d++) {
    const nx = buildingX + ADJ_DX[d];
    const ny = buildingY + ADJ_DY[d];
    if (isRoadTile(gridData, gridSizeValue, nx, ny)) {
      return { x: nx, y: ny };
    }
  }

  // For larger grids, use legacy fallback
  if (gridSizeValue > MAX_GRID_SIZE) {
    return findNearestRoadLegacy(gridData, gridSizeValue, buildingX, buildingY);
  }

  // Increment version to "clear" visited array without O(n) loop
  roadBfsVisitedVersion = (roadBfsVisitedVersion + 1) % 255;
  if (roadBfsVisitedVersion === 0) roadBfsVisitedVersion = 1; // Skip 0 (initial state)

  // BFS using pre-allocated arrays
  let queueHead = 0;
  let queueTail = 1;
  ROAD_BFS_QUEUE_X[0] = buildingX;
  ROAD_BFS_QUEUE_Y[0] = buildingY;
  ROAD_BFS_QUEUE_DIST[0] = 0;
  ROAD_BFS_VISITED_VERSION[buildingY * gridSizeValue + buildingX] = roadBfsVisitedVersion;

  while (queueHead < queueTail && queueTail < ROAD_BFS_MAX_SIZE) {
    const cx = ROAD_BFS_QUEUE_X[queueHead];
    const cy = ROAD_BFS_QUEUE_Y[queueHead];
    const dist = ROAD_BFS_QUEUE_DIST[queueHead];
    queueHead++;

    if (dist > MAX_ROAD_SEARCH_DISTANCE) break;

    for (let d = 0; d < 8; d++) {
      const nx = cx + ADJ_DX[d];
      const ny = cy + ADJ_DY[d];

      if (nx < 0 || ny < 0 || nx >= gridSizeValue || ny >= gridSizeValue) continue;

      const visitedIdx = ny * gridSizeValue + nx;
      if (ROAD_BFS_VISITED_VERSION[visitedIdx] === roadBfsVisitedVersion) continue;
      ROAD_BFS_VISITED_VERSION[visitedIdx] = roadBfsVisitedVersion;

      if (isRoadTile(gridData, gridSizeValue, nx, ny)) {
        return { x: nx, y: ny };
      }

      ROAD_BFS_QUEUE_X[queueTail] = nx;
      ROAD_BFS_QUEUE_Y[queueTail] = ny;
      ROAD_BFS_QUEUE_DIST[queueTail] = dist + 1;
      queueTail++;
    }
  }

  return null;
}

// Legacy fallback for very large grids
function findNearestRoadLegacy(
  gridData: Tile[][],
  gridSizeValue: number,
  buildingX: number,
  buildingY: number
): { x: number; y: number } | null {
  const queue: { x: number; y: number; dist: number }[] = [{ x: buildingX, y: buildingY, dist: 0 }];
  const visited = new Set<number>(); // PERF: Use numeric keys
  visited.add(buildingY * gridSizeValue + buildingX);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.dist > MAX_ROAD_SEARCH_DISTANCE) break;
    
    for (let d = 0; d < 8; d++) {
      const nx = current.x + ADJ_DX[d];
      const ny = current.y + ADJ_DY[d];
      
      if (nx < 0 || ny < 0 || nx >= gridSizeValue || ny >= gridSizeValue) continue;
      
      const key = ny * gridSizeValue + nx;
      if (visited.has(key)) continue;
      visited.add(key);
      
      if (isRoadTile(gridData, gridSizeValue, nx, ny)) {
        return { x: nx, y: ny };
      }
      
      queue.push({ x: nx, y: ny, dist: current.dist + 1 });
    }
  }
  
  return null;
}

// BFS pathfinding on road network - finds path from start to a tile adjacent to target
// PERF: Uses pre-allocated typed arrays with O(1) path reconstruction via parent indices
// PERF: LRU cache for repeated path requests between same start/target pairs
export function findPathOnRoads(
  gridData: Tile[][],
  gridSizeValue: number,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number
): { x: number; y: number }[] | null {
  // Find the nearest road tile to the target (since buildings aren't on roads)
  const targetRoad = findNearestRoadToBuilding(gridData, gridSizeValue, targetX, targetY);
  if (!targetRoad) return null;

  // Find the nearest road tile to the start (station)
  const startRoad = findNearestRoadToBuilding(gridData, gridSizeValue, startX, startY);
  if (!startRoad) return null;

  // If start and target roads are the same, return a simple path
  if (startRoad.x === targetRoad.x && startRoad.y === targetRoad.y) {
    return [{ x: startRoad.x, y: startRoad.y }];
  }

  // PERF: Check cache first - use actual road positions as key
  const cacheKey = getPathCacheKey(startRoad.x, startRoad.y, targetRoad.x, targetRoad.y);
  const cached = pathCache.get(cacheKey);
  if (cached) {
    cached.lastUsed = Date.now();
    // Return a copy to prevent mutation
    return cached.path ? cached.path.map(p => ({ x: p.x, y: p.y })) : null;
  }

  // For larger grids, use legacy fallback (don't cache these)
  if (gridSizeValue > MAX_GRID_SIZE) {
    return findPathOnRoadsLegacy(gridData, gridSizeValue, startRoad, targetRoad);
  }

  // Increment version to "clear" visited array without O(n) loop
  bfsVisitedVersion = (bfsVisitedVersion + 1) % 255;
  if (bfsVisitedVersion === 0) bfsVisitedVersion = 1; // Skip 0 (initial state)

  // BFS using pre-allocated arrays
  let queueHead = 0;
  let queueTail = 1;
  BFS_QUEUE_X[0] = startRoad.x;
  BFS_QUEUE_Y[0] = startRoad.y;
  BFS_PARENT_IDX[0] = -1; // -1 indicates start node
  BFS_VISITED_VERSION[startRoad.y * gridSizeValue + startRoad.x] = bfsVisitedVersion;

  // Direction offsets (4-directional for roads)
  const DX = [-1, 1, 0, 0];
  const DY = [0, 0, -1, 1];

  let foundIdx = -1;

  while (queueHead < queueTail && queueTail < MAX_PATH_LENGTH) {
    const cx = BFS_QUEUE_X[queueHead];
    const cy = BFS_QUEUE_Y[queueHead];
    const currentIdx = queueHead;
    queueHead++;

    // Check if we reached the target road
    if (cx === targetRoad.x && cy === targetRoad.y) {
      foundIdx = currentIdx;
      break;
    }

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];

      if (nx < 0 || ny < 0 || nx >= gridSizeValue || ny >= gridSizeValue) continue;

      const visitedIdx = ny * gridSizeValue + nx;
      if (BFS_VISITED_VERSION[visitedIdx] === bfsVisitedVersion) continue;
      if (!isRoadTile(gridData, gridSizeValue, nx, ny)) continue;

      BFS_VISITED_VERSION[visitedIdx] = bfsVisitedVersion;
      BFS_QUEUE_X[queueTail] = nx;
      BFS_QUEUE_Y[queueTail] = ny;
      BFS_PARENT_IDX[queueTail] = currentIdx; // O(1) parent lookup via index
      queueTail++;
    }
  }

  if (foundIdx === -1) {
    // Cache null result to avoid repeated failed searches
    if (pathCache.size >= PATH_CACHE_MAX_SIZE) {
      evictOldestCacheEntry();
    }
    pathCache.set(cacheKey, { path: null, lastUsed: Date.now() });
    return null;
  }

  // Reconstruct path by walking back through parent indices - O(path_length)
  const pathReverse: { x: number; y: number }[] = [];
  let idx = foundIdx;

  while (idx >= 0) {
    pathReverse.push({ x: BFS_QUEUE_X[idx], y: BFS_QUEUE_Y[idx] });
    idx = BFS_PARENT_IDX[idx]; // O(1) parent lookup!
  }

  // Reverse to get path from start to target
  const path = pathReverse.reverse();

  // PERF: Cache the result for future use
  if (pathCache.size >= PATH_CACHE_MAX_SIZE) {
    evictOldestCacheEntry();
  }
  pathCache.set(cacheKey, { path: path.map(p => ({ x: p.x, y: p.y })), lastUsed: Date.now() });

  return path;
}

// Legacy implementation for very large grids (fallback)
function findPathOnRoadsLegacy(
  gridData: Tile[][],
  gridSizeValue: number,
  startRoad: { x: number; y: number },
  targetRoad: { x: number; y: number }
): { x: number; y: number }[] | null {
  const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [
    { x: startRoad.x, y: startRoad.y, path: [{ x: startRoad.x, y: startRoad.y }] }
  ];
  const visited = new Set<string>();
  visited.add(`${startRoad.x},${startRoad.y}`);
  
  const directions = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current.x === targetRoad.x && current.y === targetRoad.y) {
      return current.path;
    }
    
    for (const { dx, dy } of directions) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = `${nx},${ny}`;
      
      if (nx < 0 || ny < 0 || nx >= gridSizeValue || ny >= gridSizeValue) continue;
      if (visited.has(key)) continue;
      if (!isRoadTile(gridData, gridSizeValue, nx, ny)) continue;
      
      visited.add(key);
      queue.push({
        x: nx,
        y: ny,
        path: [...current.path, { x: nx, y: ny }],
      });
    }
  }
  
  return null;
}

// Get direction from current tile to next tile
export function getDirectionToTile(fromX: number, fromY: number, toX: number, toY: number): CarDirection | null {
  const dx = toX - fromX;
  const dy = toY - fromY;

  if (dx === -1 && dy === 0) return 'north';
  if (dx === 1 && dy === 0) return 'south';
  if (dx === 0 && dy === -1) return 'east';
  if (dx === 0 && dy === 1) return 'west';

  return null;
}

// Re-export coordinate utilities from centralized location
// These functions have been moved to @/lib/utils for better organization
export { gridToScreen, screenToGrid } from '@/lib/utils/coordinates';
