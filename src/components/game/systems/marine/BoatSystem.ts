import { useCallback, useRef } from 'react';
import { Boat, TourWaypoint, WorldRenderState, WakeParticle, TILE_WIDTH, TILE_HEIGHT } from '../../types';
import {
  BOAT_COLORS,
  BOAT_MIN_ZOOM,
  WAKE_MIN_ZOOM_MOBILE,
  BOATS_PER_DOCK,
  MAX_BOATS,
  WAKE_MAX_AGE,
  WAKE_SPAWN_INTERVAL,
} from '../../constants';
import { gridToScreen } from '../../utils';
import { findMarinasAndPiers, findAdjacentWaterTile, generateTourWaypoints, DockInfo } from '../../queries/gridFinders';
import { Tile } from '@/types/game';
import { normalizeAngleDiff } from '@/lib/utils/math';

// ============================================================================
// PERFORMANCE OPTIMIZATIONS
// ============================================================================

// PERF: Object pools to avoid GC pressure
const WAKE_POOL_SIZE = 500;
const wakePool: WakeParticle[] = [];
let wakePoolIndex = 0;

// Pre-populate wake pool
for (let i = 0; i < WAKE_POOL_SIZE; i++) {
  wakePool.push({ x: 0, y: 0, age: 0, opacity: 1 });
}

function acquireWakeParticle(x: number, y: number): WakeParticle {
  const particle = wakePool[wakePoolIndex];
  wakePoolIndex = (wakePoolIndex + 1) % WAKE_POOL_SIZE;
  particle.x = x;
  particle.y = y;
  particle.age = 0;
  particle.opacity = 1;
  return particle;
}

// PERF: Cached water tile lookup using a typed grid key
interface WaterTileCache {
  gridVersion: number;
  waterTileSet: Set<number>;
  gridSize: number;
}

let waterTileCache: WaterTileCache | null = null;

// PERF: Cache dock finding results
interface DockCache {
  gridVersion: number;
  docks: DockInfo[];
}

let dockCache: DockCache | null = null;

// Grid version tracking - increments when grid changes
let currentGridVersion = 0;

// PERF: Inline coordinate key function (avoids string concatenation in hot path)
function tileKey(x: number, y: number, gridSize: number): number {
  return y * gridSize + x;
}

// PERF: Fast screen-to-tile conversion (inlined math, no function call overhead)
const INV_TILE_WIDTH = 1 / TILE_WIDTH;
const INV_TILE_HEIGHT = 1 / TILE_HEIGHT;

function screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number } {
  const scaledX = screenX * INV_TILE_WIDTH;
  const scaledY = screenY * INV_TILE_HEIGHT;
  return {
    tileX: Math.floor(scaledX + scaledY),
    tileY: Math.floor(scaledY - scaledX)
  };
}

// PERF: Fast isOverWater using cached water tile set
function isOverWaterFast(
  screenX: number,
  screenY: number,
  cache: WaterTileCache
): boolean {
  const { tileX, tileY } = screenToTile(screenX, screenY);

  if (tileX < 0 || tileX >= cache.gridSize || tileY < 0 || tileY >= cache.gridSize) {
    return false;
  }

  return cache.waterTileSet.has(tileKey(tileX, tileY, cache.gridSize));
}

// PERF: Build water tile cache from grid
function buildWaterTileCache(grid: Tile[][], gridSize: number, version: number): WaterTileCache {
  const waterTileSet = new Set<number>();

  for (let y = 0; y < gridSize; y++) {
    const row = grid[y];
    for (let x = 0; x < gridSize; x++) {
      if (row[x].building.type === 'water') {
        waterTileSet.add(tileKey(x, y, gridSize));
      }
    }
  }

  return { gridVersion: version, waterTileSet, gridSize };
}

// PERF: Pre-calculated speed multipliers
const SPEED_MULTIPLIERS = [1, 1, 1.5, 2] as const;

// PERF: Pre-calculated angle constants
const TWO_PI = Math.PI * 2;
const PI = Math.PI;

// Note: normalizeAngleDiff is now imported from @/lib/utils/math

// PERF: HSL color lookup table for deck colors (avoids string comparison in render)
const DECK_COLOR_MAP: Record<string, string> = {
  '#ffffff': 'hsl(0, 0%, 95%)',
  '#1e3a5f': 'hsl(210, 52%, 35%)',
  '#8b4513': 'hsl(30, 75%, 40%)',
  '#2f4f4f': 'hsl(180, 25%, 35%)',
  '#c41e3a': 'hsl(350, 75%, 50%)',
  '#1e90ff': 'hsl(210, 80%, 50%)'
};

export interface BoatSystemRefs {
  boatsRef: React.MutableRefObject<Boat[]>;
  boatIdRef: React.MutableRefObject<number>;
  boatSpawnTimerRef: React.MutableRefObject<number>;
}

export interface BoatSystemState {
  worldStateRef: React.MutableRefObject<WorldRenderState>;
  isMobile: boolean;
  visualHour: number;
}

export function useBoatSystem(
  refs: BoatSystemRefs,
  systemState: BoatSystemState
) {
  const { boatsRef, boatIdRef, boatSpawnTimerRef } = refs;
  const { worldStateRef, isMobile, visualHour } = systemState;

  // PERF: Local ref to track grid changes for cache invalidation
  const lastGridRef = useRef<Tile[][] | null>(null);
  const gridVersionRef = useRef(0);

  // Find marinas and piers callback - with caching
  const findMarinasAndPiersCallback = useCallback(() => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;

    // PERF: Cache dock results - only recompute when grid changes
    if (lastGridRef.current !== currentGrid) {
      lastGridRef.current = currentGrid;
      gridVersionRef.current++;
      dockCache = null;
      waterTileCache = null;
    }

    if (dockCache && dockCache.gridVersion === gridVersionRef.current) {
      return dockCache.docks;
    }

    const docks = findMarinasAndPiers(currentGrid, currentGridSize);
    dockCache = { gridVersion: gridVersionRef.current, docks };
    return docks;
  }, [worldStateRef]);

  // Find adjacent water tile callback
  const findAdjacentWaterTileCallback = useCallback((dockX: number, dockY: number) => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    return findAdjacentWaterTile(currentGrid, currentGridSize, dockX, dockY);
  }, [worldStateRef]);

  // Check if screen position is over water callback - with caching
  const isOverWaterCallback = useCallback((screenX: number, screenY: number): boolean => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;

    // PERF: Use cached water tile lookup
    if (!waterTileCache || waterTileCache.gridVersion !== gridVersionRef.current) {
      waterTileCache = buildWaterTileCache(currentGrid, currentGridSize, gridVersionRef.current);
    }

    return isOverWaterFast(screenX, screenY, waterTileCache);
  }, [worldStateRef]);

  // Generate tour waypoints callback
  const generateTourWaypointsCallback = useCallback((startTileX: number, startTileY: number): TourWaypoint[] => {
    const { grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    return generateTourWaypoints(currentGrid, currentGridSize, startTileX, startTileY);
  }, [worldStateRef]);

  // Update boats - spawn, move, and manage lifecycle
  const updateBoats = useCallback((delta: number) => {
    const { grid: currentGrid, gridSize: currentGridSize, speed: currentSpeed, zoom: currentZoom } = worldStateRef.current;

    if (!currentGrid || currentGridSize <= 0 || currentSpeed === 0) {
      return;
    }

    // PERF: Track grid changes for cache invalidation
    if (lastGridRef.current !== currentGrid) {
      lastGridRef.current = currentGrid;
      gridVersionRef.current++;
      dockCache = null;
      waterTileCache = null;
    }

    // Clear boats if zoomed out too far
    if (currentZoom < BOAT_MIN_ZOOM) {
      if (boatsRef.current.length > 0) {
        boatsRef.current = [];
      }
      return;
    }

    // PERF: Ensure water tile cache is built for fast lookups
    if (!waterTileCache || waterTileCache.gridVersion !== gridVersionRef.current) {
      waterTileCache = buildWaterTileCache(currentGrid, currentGridSize, gridVersionRef.current);
    }

    // Find marinas and piers (cached)
    const docks = findMarinasAndPiersCallback();

    // No boats if no docks
    if (docks.length === 0) {
      if (boatsRef.current.length > 0) {
        boatsRef.current = [];
      }
      return;
    }

    // Calculate max boats based on number of docks
    const maxBoats = Math.min(MAX_BOATS, (docks.length * BOATS_PER_DOCK) | 0);

    // PERF: Use lookup table for speed multiplier
    const speedMultiplier = SPEED_MULTIPLIERS[currentSpeed] || 1;

    // Spawn timer
    boatSpawnTimerRef.current -= delta;
    if (boatsRef.current.length < maxBoats && boatSpawnTimerRef.current <= 0) {
      // Pick a random dock as home base
      const homeDock = docks[(Math.random() * docks.length) | 0];

      // Find adjacent water tile for positioning
      const waterTile = findAdjacentWaterTileCallback(homeDock.x, homeDock.y);
      if (waterTile) {
        // Generate tour waypoints within the connected body of water
        const tourWaypoints = generateTourWaypointsCallback(waterTile.x, waterTile.y);

        // Convert to screen coordinates
        const { screenX: originScreenX, screenY: originScreenY } = gridToScreen(waterTile.x, waterTile.y, 0, 0);
        const homeScreenX = originScreenX + TILE_WIDTH * 0.5;
        const homeScreenY = originScreenY + TILE_HEIGHT * 0.5;

        // Set first tour waypoint as initial destination (or home if no waypoints)
        let firstDestScreenX = homeScreenX;
        let firstDestScreenY = homeScreenY;
        if (tourWaypoints.length > 0) {
          firstDestScreenX = tourWaypoints[0].screenX;
          firstDestScreenY = tourWaypoints[0].screenY;
        }

        // Calculate angle to first destination
        const angle = Math.atan2(firstDestScreenY - originScreenY, firstDestScreenX - originScreenX);

        // PERF: Direct object creation (avoid spread operators)
        boatsRef.current.push({
          id: boatIdRef.current++,
          x: homeScreenX,
          y: homeScreenY,
          angle: angle,
          targetAngle: angle,
          state: 'departing',
          speed: 15 + Math.random() * 10,
          originX: homeDock.x,
          originY: homeDock.y,
          destX: homeDock.x,
          destY: homeDock.y,
          destScreenX: firstDestScreenX,
          destScreenY: firstDestScreenY,
          age: 0,
          color: BOAT_COLORS[(Math.random() * BOAT_COLORS.length) | 0],
          wake: [],
          wakeSpawnProgress: 0,
          sizeVariant: Math.random() < 0.7 ? 0 : 1,
          tourWaypoints: tourWaypoints,
          tourWaypointIndex: 0,
          homeScreenX: homeScreenX,
          homeScreenY: homeScreenY,
        });
      }

      boatSpawnTimerRef.current = 1 + Math.random() * 2;
    }

    // PERF: Update existing boats in-place, track which to keep
    const boats = boatsRef.current;
    const boatCount = boats.length;
    let writeIndex = 0;

    // PERF: Pre-calculate wake constants
    const wakeMaxAge = isMobile ? 0.6 : WAKE_MAX_AGE;
    const wakeSpawnInterval = isMobile ? 0.08 : WAKE_SPAWN_INTERVAL;

    for (let i = 0; i < boatCount; i++) {
      const boat = boats[i];
      boat.age += delta;

      // PERF: Update wake particles in-place (avoid map/filter creating new arrays)
      const wake = boat.wake;
      let wakeWriteIdx = 0;
      for (let w = 0; w < wake.length; w++) {
        const p = wake[w];
        p.age += delta;
        p.opacity = Math.max(0, 1 - p.age / wakeMaxAge);
        if (p.age < wakeMaxAge) {
          wake[wakeWriteIdx++] = p;
        }
      }
      wake.length = wakeWriteIdx;

      // Distance to destination (squared comparison to avoid sqrt when possible)
      const dx = boat.x - boat.destScreenX;
      const dy = boat.y - boat.destScreenY;
      const distToDestSq = dx * dx + dy * dy;

      // Calculate next position
      let nextX = boat.x;
      let nextY = boat.y;
      let shouldRemove = false;

      // PERF: Use numeric state codes internally? No - string comparison is fast enough
      // and the switch statement is optimized by V8

      switch (boat.state) {
        case 'departing': {
          const cosAngle = Math.cos(boat.angle);
          const sinAngle = Math.sin(boat.angle);
          const movement = boat.speed * delta * speedMultiplier;
          nextX = boat.x + cosAngle * movement;
          nextY = boat.y + sinAngle * movement;

          if (boat.age > 2) {
            if (boat.tourWaypoints.length > 0) {
              boat.state = 'touring';
              boat.tourWaypointIndex = 0;
              boat.destScreenX = boat.tourWaypoints[0].screenX;
              boat.destScreenY = boat.tourWaypoints[0].screenY;
            } else {
              boat.state = 'sailing';
              boat.destScreenX = boat.homeScreenX;
              boat.destScreenY = boat.homeScreenY;
            }
          }
          break;
        }

        case 'touring': {
          const angleToWaypoint = Math.atan2(boat.destScreenY - boat.y, boat.destScreenX - boat.x);
          boat.targetAngle = angleToWaypoint;

          // PERF: Inline angle normalization
          let angleDiff = boat.targetAngle - boat.angle;
          if (angleDiff > PI) angleDiff -= TWO_PI;
          else if (angleDiff < -PI) angleDiff += TWO_PI;
          boat.angle += angleDiff * Math.min(1, delta * 1.8);

          const cosAngle = Math.cos(boat.angle);
          const sinAngle = Math.sin(boat.angle);
          const movement = boat.speed * delta * speedMultiplier;
          nextX = boat.x + cosAngle * movement;
          nextY = boat.y + sinAngle * movement;

          // Check if reached current waypoint (use squared distance: 40^2 = 1600)
          if (distToDestSq < 1600) {
            boat.tourWaypointIndex++;

            if (boat.tourWaypointIndex < boat.tourWaypoints.length) {
              const nextWaypoint = boat.tourWaypoints[boat.tourWaypointIndex];
              boat.destScreenX = nextWaypoint.screenX;
              boat.destScreenY = nextWaypoint.screenY;
            } else {
              boat.state = 'sailing';
              boat.destScreenX = boat.homeScreenX;
              boat.destScreenY = boat.homeScreenY;
              boat.age = 0;
            }
          }

          if (boat.age > 120) {
            shouldRemove = true;
          }
          break;
        }

        case 'sailing': {
          const angleToDestination = Math.atan2(boat.destScreenY - boat.y, boat.destScreenX - boat.x);
          boat.targetAngle = angleToDestination;

          let angleDiff = boat.targetAngle - boat.angle;
          if (angleDiff > PI) angleDiff -= TWO_PI;
          else if (angleDiff < -PI) angleDiff += TWO_PI;
          boat.angle += angleDiff * Math.min(1, delta * 2);

          const cosAngle = Math.cos(boat.angle);
          const sinAngle = Math.sin(boat.angle);
          const movement = boat.speed * delta * speedMultiplier;
          nextX = boat.x + cosAngle * movement;
          nextY = boat.y + sinAngle * movement;

          // Check if approaching home dock (use squared distance: 60^2 = 3600)
          if (distToDestSq < 3600) {
            boat.state = 'arriving';
          }

          if (boat.age > 60) {
            shouldRemove = true;
          }
          break;
        }

        case 'arriving': {
          boat.speed = Math.max(5, boat.speed - delta * 8);

          const angleToDestination = Math.atan2(boat.destScreenY - boat.y, boat.destScreenX - boat.x);
          boat.targetAngle = angleToDestination;

          let angleDiff = boat.targetAngle - boat.angle;
          if (angleDiff > PI) angleDiff -= TWO_PI;
          else if (angleDiff < -PI) angleDiff += TWO_PI;
          boat.angle += angleDiff * Math.min(1, delta * 3);

          const cosAngle = Math.cos(boat.angle);
          const sinAngle = Math.sin(boat.angle);
          const movement = boat.speed * delta * speedMultiplier;
          nextX = boat.x + cosAngle * movement;
          nextY = boat.y + sinAngle * movement;

          // Check if docked at home (use squared distance: 15^2 = 225)
          if (distToDestSq < 225) {
            boat.state = 'docked';
            boat.age = 0;
            boat.wake.length = 0; // Clear wake when docked
          }
          break;
        }

        case 'docked': {
          if (boat.age > 3 + Math.random() * 3) {
            const waterTile = findAdjacentWaterTileCallback(boat.originX, boat.originY);
            if (waterTile) {
              boat.tourWaypoints = generateTourWaypointsCallback(waterTile.x, waterTile.y);
              boat.tourWaypointIndex = 0;
            }

            boat.state = 'departing';
            boat.speed = 15 + Math.random() * 10;
            boat.age = 0;

            if (boat.tourWaypoints.length > 0) {
              boat.destScreenX = boat.tourWaypoints[0].screenX;
              boat.destScreenY = boat.tourWaypoints[0].screenY;
            } else {
              boat.destScreenX = boat.homeScreenX + (Math.random() - 0.5) * 200;
              boat.destScreenY = boat.homeScreenY + (Math.random() - 0.5) * 200;
            }

            const angle = Math.atan2(boat.destScreenY - boat.y, boat.destScreenX - boat.x);
            boat.angle = angle;
            boat.targetAngle = angle;
          }
          break;
        }
      }

      // Check if next position is over water (skip for docked boats)
      if (boat.state !== 'docked' && !shouldRemove) {
        if (!isOverWaterFast(nextX, nextY, waterTileCache!)) {
          shouldRemove = true;
        } else {
          boat.x = nextX;
          boat.y = nextY;

          // Add wake particles when moving
          boat.wakeSpawnProgress += delta;
          if (boat.wakeSpawnProgress >= wakeSpawnInterval) {
            boat.wakeSpawnProgress -= wakeSpawnInterval;

            // PERF: Use object pool for wake particles
            const behindBoat = -6;
            const cosAngle = Math.cos(boat.angle);
            const sinAngle = Math.sin(boat.angle);
            const particle = acquireWakeParticle(
              boat.x + cosAngle * behindBoat,
              boat.y + sinAngle * behindBoat
            );
            boat.wake.push(particle);
          }
        }
      }

      if (!shouldRemove) {
        boats[writeIndex++] = boat;
      }
    }

    boats.length = writeIndex;
  }, [worldStateRef, boatsRef, boatIdRef, boatSpawnTimerRef, findMarinasAndPiersCallback, findAdjacentWaterTileCallback, generateTourWaypointsCallback, isMobile]);

  // Draw boats with wakes
  const drawBoats = useCallback((ctx: CanvasRenderingContext2D) => {
    const { offset: currentOffset, zoom: currentZoom, grid: currentGrid, gridSize: currentGridSize } = worldStateRef.current;
    const canvas = ctx.canvas;
    const dpr = window.devicePixelRatio || 1;

    // Don't draw boats if zoomed out
    if (currentZoom < BOAT_MIN_ZOOM) {
      return;
    }

    const boats = boatsRef.current;

    // Early exit if no boats
    if (!currentGrid || currentGridSize <= 0 || boats.length === 0) {
      return;
    }

    ctx.save();

    // PERF: Pre-calculate transform values
    const scale = dpr * currentZoom;
    const invZoom = 1 / currentZoom;
    const offsetX = currentOffset.x * invZoom;
    const offsetY = currentOffset.y * invZoom;

    ctx.scale(scale, scale);
    ctx.translate(offsetX, offsetY);

    // PERF: Pre-calculate viewport bounds once
    const viewWidth = canvas.width / scale;
    const viewHeight = canvas.height / scale;
    const viewLeft = -offsetX - 100;
    const viewTop = -offsetY - 100;
    const viewRight = viewWidth - offsetX + 100;
    const viewBottom = viewHeight - offsetY + 100;

    // Hide wakes on mobile when zoomed out
    const showWakes = !isMobile || currentZoom >= WAKE_MIN_ZOOM_MOBILE;

    // PERF: Check if it's night once
    const isNight = visualHour >= 20 || visualHour < 6;

    // PERF: Batch similar drawing operations
    for (let i = 0; i < boats.length; i++) {
      const boat = boats[i];

      // Draw wake particles first (behind boat)
      if (showWakes) {
        const wake = boat.wake;
        if (wake.length > 0) {
          for (let w = 0; w < wake.length; w++) {
            const particle = wake[w];

            // Skip if outside viewport
            if (particle.x < viewLeft || particle.x > viewRight ||
                particle.y < viewTop || particle.y > viewBottom) {
              continue;
            }

            const size = 1.2 + particle.age * 2;
            const opacity = particle.opacity * 0.5;

            ctx.fillStyle = `rgba(200, 220, 255, ${opacity})`;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, size, 0, TWO_PI);
            ctx.fill();
          }
        }
      }

      // Skip boat rendering if outside viewport
      if (boat.x < viewLeft || boat.x > viewRight ||
          boat.y < viewTop || boat.y > viewBottom) {
        continue;
      }

      ctx.save();
      ctx.translate(boat.x, boat.y);
      ctx.rotate(boat.angle);

      const boatScale = boat.sizeVariant === 0 ? 0.5 : 0.65;
      ctx.scale(boatScale, boatScale);

      // Draw small foam/splash at stern when moving
      if (boat.state !== 'docked') {
        const foamOpacity = Math.min(0.5, boat.speed * 0.0333); // 1/30
        ctx.fillStyle = `rgba(255, 255, 255, ${foamOpacity})`;
        ctx.beginPath();
        ctx.ellipse(-7, 0, 3, 2, 0, 0, TWO_PI);
        ctx.fill();
      }

      // Draw boat hull
      ctx.fillStyle = boat.color;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.quadraticCurveTo(8, -4, 0, -4);
      ctx.lineTo(-8, -3);
      ctx.lineTo(-8, 3);
      ctx.lineTo(0, 4);
      ctx.quadraticCurveTo(8, 4, 10, 0);
      ctx.closePath();
      ctx.fill();

      // Hull outline
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Deck (lighter color) - use lookup table
      ctx.fillStyle = DECK_COLOR_MAP[boat.color] || 'hsl(210, 80%, 50%)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2, 0, 0, TWO_PI);
      ctx.fill();

      // Cabin/cockpit
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-3, -1.5, 4, 3);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.3;
      ctx.strokeRect(-3, -1.5, 4, 3);

      // Mast or antenna
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(2, -8);
      ctx.stroke();

      // Flag at top
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.moveTo(2, -8);
      ctx.lineTo(5, -7);
      ctx.lineTo(2, -6);
      ctx.closePath();
      ctx.fill();

      // Navigation lights at night
      if (isNight) {
        // White masthead light at top of mast
        ctx.fillStyle = '#ffffff';
        // PERF: Skip shadowBlur on mobile - very expensive
        if (!isMobile) {
          ctx.shadowColor = '#ffffcc';
          ctx.shadowBlur = 12;
        }
        ctx.beginPath();
        ctx.arc(2, -9, isMobile ? 1.2 : 0.8, 0, TWO_PI);
        ctx.fill();

        // Red port light (left side)
        ctx.fillStyle = '#ff3333';
        if (!isMobile) {
          ctx.shadowColor = '#ff0000';
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(-6, 2, isMobile ? 1 : 0.6, 0, TWO_PI);
        ctx.fill();

        // Green starboard light (right side)
        ctx.fillStyle = '#33ff33';
        if (!isMobile) {
          ctx.shadowColor = '#00ff00';
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(-6, -2, isMobile ? 1 : 0.6, 0, TWO_PI);
        ctx.fill();

        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }

    ctx.restore();
  }, [worldStateRef, boatsRef, visualHour, isMobile]);

  return {
    updateBoats,
    drawBoats,
    findMarinasAndPiersCallback,
    findAdjacentWaterTileCallback,
    isOverWaterCallback,
    generateTourWaypointsCallback,
  };
}
