'use client';

/**
 * Main render loop for the isometric canvas
 *
 * This module handles the requestAnimationFrame loop, viewport culling,
 * tile iteration, depth sorting, and layer composition for the canvas renderer.
 *
 * Extracted from CanvasIsometricGrid.tsx for better organization.
 */

import type { Tile, BuildingType, WaterBody, ServiceCoverage } from '@/types/game';
import type { RenderQueues, BuildingDrawItem } from './hooks/useRenderQueues';
import { insertionSortByDepth, clearRenderQueues } from './hooks/useRenderQueues';
import { TILE_WIDTH, TILE_HEIGHT } from '../types';

/**
 * Canvas layer references
 */
export interface CanvasLayerRefs {
  main: HTMLCanvasElement;
  buildings: HTMLCanvasElement | null;
  hover: HTMLCanvasElement | null;
  cars: HTMLCanvasElement | null;
  air: HTMLCanvasElement | null;
  lighting: HTMLCanvasElement | null;
}

/**
 * Configuration for the render loop
 */
export interface RenderLoopConfig {
  gridSize: number;
  canvasSize: { width: number; height: number };
  isMobile: boolean;

  // Helper functions
  gridToScreen: (gridX: number, gridY: number, offsetX: number, offsetY: number) => { screenX: number; screenY: number };
  getTileMetadata: (x: number, y: number) => any;
  getBuildingSize: (type: BuildingType) => { width: number; height: number };
}

/**
 * Current render state (retrieved each frame)
 */
export interface RenderLoopState {
  grid: Tile[][];
  offset: { x: number; y: number };
  zoom: number;
  overlayMode: string;
  services: ServiceCoverage;
  dragStartTile: { x: number; y: number } | null;
  dragEndTile: { x: number; y: number } | null;
  showsDragGrid: boolean;
  waterBodies: WaterBody[];
  currentSpritePack: any;

  // Grid version for cache invalidation
  gridVersion: number;
}

/**
 * Renderer functions passed from the parent component
 */
export interface RenderFunctions {
  drawIsometricTile: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tile: Tile,
    highlight: boolean,
    zoom: number,
    skipGreyBase?: boolean,
    skipGreenBase?: boolean
  ) => void;

  drawBuilding: (ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile) => void;

  drawGreyBaseTile: (ctx: CanvasRenderingContext2D, screenX: number, screenY: number, tile: Tile, zoom: number) => void;

  drawGreenBaseTile: (ctx: CanvasRenderingContext2D, screenX: number, screenY: number, tile: Tile, zoom: number) => void;

  drawBeachOnWater: (
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    adjacentLand: { north: boolean; east: boolean; south: boolean; west: boolean }
  ) => void;

  drawRailTracksOnly: (
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    gridX: number,
    gridY: number,
    grid: Tile[][],
    gridSize: number,
    zoom: number
  ) => void;

  drawRailTrack: (
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    gridX: number,
    gridY: number,
    grid: Tile[][],
    gridSize: number,
    zoom: number
  ) => void;

  drawRailroadCrossing: (
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    gridX: number,
    gridY: number,
    grid: Tile[][],
    gridSize: number,
    zoom: number,
    flashTimer: number,
    gateAngle: number,
    isActive: boolean
  ) => void;

  getOverlayFillStyle: (
    overlayMode: string,
    tile: Tile,
    coverage: {
      fire: number;
      police: number;
      health: number;
      education: number;
    }
  ) => string;
}

/**
 * Additional refs needed by the render loop
 */
export interface RenderLoopRefs {
  crossingFlashTimer: React.MutableRefObject<number>;
  crossingGateAngles: React.MutableRefObject<Map<number, number>>;
  crossingPositions: React.MutableRefObject<{ x: number; y: number }[]>;
  crossingKeySet: React.MutableRefObject<Set<number>>;
  trains: React.MutableRefObject<any[]>;
}

/**
 * Overlay configuration
 */
const OVERLAY_TO_BUILDING_TYPES: Record<string, BuildingType[]> = {
  fire: ['fire_station'],
  police: ['police_station'],
  health: ['hospital'],
  education: ['school', 'university'],
};

const OVERLAY_CIRCLE_COLORS: Record<string, string> = {
  fire: 'rgba(239, 68, 68, 0.6)',
  police: 'rgba(59, 130, 246, 0.6)',
  health: 'rgba(34, 197, 94, 0.6)',
  education: 'rgba(168, 85, 247, 0.6)',
};

const OVERLAY_CIRCLE_FILL_COLORS: Record<string, string> = {
  fire: 'rgba(239, 68, 68, 0.1)',
  police: 'rgba(59, 130, 246, 0.1)',
  health: 'rgba(34, 197, 94, 0.1)',
  education: 'rgba(168, 85, 247, 0.1)',
};

const OVERLAY_HIGHLIGHT_COLORS: Record<string, string> = {
  fire: 'rgba(239, 68, 68, 0.9)',
  police: 'rgba(59, 130, 246, 0.9)',
  health: 'rgba(34, 197, 94, 0.9)',
  education: 'rgba(168, 85, 247, 0.9)',
};

// Service configuration
const SERVICE_CONFIG: Record<string, { range: number }> = {
  fire_station: { range: 15 },
  police_station: { range: 15 },
  hospital: { range: 20 },
  school: { range: 10 },
  university: { range: 25 },
};

/**
 * Helper: Check if tile is water
 */
function isWater(grid: Tile[][], gridSize: number, gridX: number, gridY: number): boolean {
  if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) return false;
  return grid[gridY][gridX].building.type === 'water';
}

/**
 * Helper: Check if tile has a marina dock or pier
 */
function hasMarinaPier(grid: Tile[][], gridSize: number, gridX: number, gridY: number): boolean {
  if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) return false;
  const buildingType = grid[gridY][gridX].building.type;
  if (buildingType === 'marina_docks_small' || buildingType === 'pier_large') return true;

  // Check if this is an 'empty' tile that belongs to a marina (2x2 building)
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

/**
 * Helper: Get crossing state for a tile
 */
function getCrossingStateForTile(trains: any[], x: number, y: number): 'open' | 'closing' | 'closed' {
  // Simplified - actual implementation would check train proximity
  return 'open';
}

/**
 * Create and manage the render loop
 */
export function createRenderLoop(
  canvases: CanvasLayerRefs,
  config: RenderLoopConfig,
  renderQueues: RenderQueues,
  getState: () => RenderLoopState,
  renderers: RenderFunctions,
  refs: RenderLoopRefs
) {
  let animationFrameId: number | null = null;

  /**
   * Main render function - called each frame via RAF
   */
  function render() {
    const state = getState();
    const { grid, offset, zoom, overlayMode, services, dragStartTile, dragEndTile, showsDragGrid, waterBodies } = state;

    const canvas = canvases.main;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Disable image smoothing for crisp pixel art
    ctx.imageSmoothingEnabled = false;

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0f1419');
    gradient.addColorStop(0.5, '#141c24');
    gradient.addColorStop(1, '#1a2a1f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Scale for device pixel ratio first, then apply zoom
    ctx.scale(dpr * zoom, dpr * zoom);
    ctx.translate(offset.x / zoom, offset.y / zoom);

    // Calculate visible tile range for culling (account for DPR in canvas size)
    const viewWidth = canvas.width / (dpr * zoom);
    const viewHeight = canvas.height / (dpr * zoom);
    const viewLeft = -offset.x / zoom - TILE_WIDTH;
    const viewTop = -offset.y / zoom - TILE_HEIGHT * 2;
    const viewRight = viewWidth - offset.x / zoom + TILE_WIDTH;
    const viewBottom = viewHeight - offset.y / zoom + TILE_HEIGHT * 2;

    // PERF: Pre-compute visible diagonal range to skip entire rows of tiles
    const visibleMinSum = Math.max(0, Math.floor((viewTop - TILE_HEIGHT * 6) * 2 / TILE_HEIGHT));
    const visibleMaxSum = Math.min(config.gridSize * 2 - 2, Math.ceil((viewBottom + TILE_HEIGHT) * 2 / TILE_HEIGHT));

    // Clear render queues
    clearRenderQueues(renderQueues);

    // Iterate tiles in diagonal order for proper depth sorting
    for (let sum = visibleMinSum; sum <= visibleMaxSum; sum++) {
      const minX = Math.max(0, sum - config.gridSize + 1);
      const maxX = Math.min(config.gridSize - 1, sum);

      for (let x = minX; x <= maxX; x++) {
        const y = sum - x;
        if (y < 0 || y >= config.gridSize) continue;

        const tile = grid[y][x];
        const { screenX, screenY } = config.gridToScreen(x, y, 0, 0);

        // Viewport culling
        if (screenX + TILE_WIDTH < viewLeft || screenX > viewRight ||
            screenY + TILE_HEIGHT < viewTop || screenY > viewBottom) {
          continue;
        }

        // Check if tile is in drag selection rect
        let isInDragRect = false;
        if (showsDragGrid && dragStartTile && dragEndTile) {
          const minDragX = Math.min(dragStartTile.x, dragEndTile.x);
          const maxDragX = Math.max(dragStartTile.x, dragEndTile.x);
          const minDragY = Math.min(dragStartTile.y, dragEndTile.y);
          const maxDragY = Math.max(dragStartTile.y, dragEndTile.y);
          isInDragRect = x >= minDragX && x <= maxDragX && y >= minDragY && y <= maxDragY;
        }

        // Get tile metadata
        const tileMetadata = config.getTileMetadata(tile.x, tile.y);
        const needsGreyBase = tileMetadata?.needsGreyBase ?? false;
        const needsGreenBaseOverWater = tileMetadata?.needsGreenBaseOverWater ?? false;
        const needsGreenBaseForPark = tileMetadata?.needsGreenBaseForPark ?? false;

        // Draw base tile (skip grey/green bases for now - they'll be drawn in their own layers)
        const isSubwayStationHighlight = overlayMode === 'subway' && tile.building.type === 'subway_station';
        renderers.drawIsometricTile(ctx, screenX, screenY, tile, !!(isInDragRect || isSubwayStationHighlight), zoom, true, needsGreenBaseOverWater || needsGreenBaseForPark);

        if (needsGreyBase) {
          renderQueues.baseTileQueue.push({ screenX, screenY, tile, depth: x + y });
        }

        if (needsGreenBaseOverWater || needsGreenBaseForPark) {
          renderQueues.greenBaseTileQueue.push({ screenX, screenY, tile, depth: x + y });
        }

        // Separate tiles into render queues
        if (tile.building.type === 'water') {
          const size = config.getBuildingSize(tile.building.type);
          const depth = x + y + size.width + size.height - 2;
          renderQueues.waterQueue.push({ screenX, screenY, tile, depth });
        }
        else if (tile.building.type === 'road') {
          const depth = x + y;
          renderQueues.roadQueue.push({ screenX, screenY, tile, depth });
        }
        else if (tile.building.type === 'rail') {
          const depth = x + y;
          renderQueues.railQueue.push({ screenX, screenY, tile, depth });
        }
        else if ((tile.building.type === 'grass' || tile.building.type === 'empty') &&
                 (tileMetadata?.isAdjacentToWater ?? false)) {
          renderQueues.beachQueue.push({ screenX, screenY, tile, depth: x + y });
        }
        else {
          const isBuilding = tile.building.type !== 'grass' && tile.building.type !== 'empty';
          if (isBuilding) {
            const size = config.getBuildingSize(tile.building.type);
            const depth = x + y + size.width + size.height - 2;
            renderQueues.buildingQueue.push({ screenX, screenY, tile, depth });
          }
        }

        // Overlay queue
        const showOverlay =
          overlayMode !== 'none' &&
          (overlayMode === 'subway'
            ? tile.building.type !== 'water'
            : (tile.building.type !== 'grass' &&
               tile.building.type !== 'water' &&
               tile.building.type !== 'road'));
        if (showOverlay) {
          renderQueues.overlayQueue.push({ screenX, screenY, tile });
        }
      }
    }

    // Draw water sprites (with clipping)
    ctx.save();
    const topLeft = config.gridToScreen(0, 0, 0, 0);
    const topRight = config.gridToScreen(config.gridSize - 1, 0, 0, 0);
    const bottomRight = config.gridToScreen(config.gridSize - 1, config.gridSize - 1, 0, 0);
    const bottomLeft = config.gridToScreen(0, config.gridSize - 1, 0, 0);

    ctx.beginPath();
    ctx.moveTo(topLeft.screenX + TILE_WIDTH / 2, topLeft.screenY);
    ctx.lineTo(topRight.screenX + TILE_WIDTH, topRight.screenY + TILE_HEIGHT / 2);
    ctx.lineTo(bottomRight.screenX + TILE_WIDTH / 2, bottomRight.screenY + TILE_HEIGHT);
    ctx.lineTo(bottomLeft.screenX, bottomLeft.screenY + TILE_HEIGHT / 2);
    ctx.closePath();
    ctx.clip();

    insertionSortByDepth(renderQueues.waterQueue);
    for (let i = 0; i < renderQueues.waterQueue.length; i++) {
      const { tile, screenX, screenY } = renderQueues.waterQueue[i];
      renderers.drawBuilding(ctx, screenX, screenY, tile);
    }

    ctx.restore();

    // Draw beaches on water tiles
    for (let i = 0; i < renderQueues.waterQueue.length; i++) {
      const { tile, screenX, screenY } = renderQueues.waterQueue[i];
      const adjacentLand = {
        north: (tile.x - 1 >= 0 && tile.x - 1 < config.gridSize && tile.y >= 0 && tile.y < config.gridSize) &&
               !isWater(grid, config.gridSize, tile.x - 1, tile.y) &&
               !hasMarinaPier(grid, config.gridSize, tile.x - 1, tile.y),
        east: (tile.x >= 0 && tile.x < config.gridSize && tile.y - 1 >= 0 && tile.y - 1 < config.gridSize) &&
              !isWater(grid, config.gridSize, tile.x, tile.y - 1) &&
              !hasMarinaPier(grid, config.gridSize, tile.x, tile.y - 1),
        south: (tile.x + 1 >= 0 && tile.x + 1 < config.gridSize && tile.y >= 0 && tile.y < config.gridSize) &&
               !isWater(grid, config.gridSize, tile.x + 1, tile.y) &&
               !hasMarinaPier(grid, config.gridSize, tile.x + 1, tile.y),
        west: (tile.x >= 0 && tile.x < config.gridSize && tile.y + 1 >= 0 && tile.y + 1 < config.gridSize) &&
              !isWater(grid, config.gridSize, tile.x, tile.y + 1) &&
              !hasMarinaPier(grid, config.gridSize, tile.x, tile.y + 1),
      };
      renderers.drawBeachOnWater(ctx, screenX, screenY, adjacentLand);
    }

    // Draw roads
    const halfTileWidth = TILE_WIDTH / 2;
    const halfTileHeight = TILE_HEIGHT / 2;

    insertionSortByDepth(renderQueues.roadQueue);
    for (let i = 0; i < renderQueues.roadQueue.length; i++) {
      const { tile, screenX, screenY } = renderQueues.roadQueue[i];
      // Draw road base tile
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath();
      ctx.moveTo(screenX + halfTileWidth, screenY);
      ctx.lineTo(screenX + TILE_WIDTH, screenY + halfTileHeight);
      ctx.lineTo(screenX + halfTileWidth, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX, screenY + halfTileHeight);
      ctx.closePath();
      ctx.fill();

      // Draw road markings and sidewalks
      renderers.drawBuilding(ctx, screenX, screenY, tile);

      // Draw rail overlay if present
      if (tile.hasRailOverlay) {
        renderers.drawRailTracksOnly(ctx, screenX, screenY, tile.x, tile.y, grid, config.gridSize, zoom);
      }
    }

    // Draw rail tracks
    insertionSortByDepth(renderQueues.railQueue);
    for (let i = 0; i < renderQueues.railQueue.length; i++) {
      const { tile, screenX, screenY } = renderQueues.railQueue[i];
      // Draw rail base tile
      ctx.fillStyle = '#5B6345';
      ctx.beginPath();
      ctx.moveTo(screenX + halfTileWidth, screenY);
      ctx.lineTo(screenX + TILE_WIDTH, screenY + halfTileHeight);
      ctx.lineTo(screenX + halfTileWidth, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX, screenY + halfTileHeight);
      ctx.closePath();
      ctx.fill();

      // Draw edge shading
      ctx.strokeStyle = '#4B5335';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screenX + halfTileWidth, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX, screenY + halfTileHeight);
      ctx.lineTo(screenX + halfTileWidth, screenY);
      ctx.stroke();

      // Draw rail tracks
      renderers.drawRailTrack(ctx, screenX, screenY, tile.x, tile.y, grid, config.gridSize, zoom);
    }

    // Draw green base tiles
    insertionSortByDepth(renderQueues.greenBaseTileQueue);
    for (let i = 0; i < renderQueues.greenBaseTileQueue.length; i++) {
      const { tile, screenX, screenY } = renderQueues.greenBaseTileQueue[i];
      renderers.drawGreenBaseTile(ctx, screenX, screenY, tile, zoom);
    }

    // Draw grey base tiles
    insertionSortByDepth(renderQueues.baseTileQueue);
    for (let i = 0; i < renderQueues.baseTileQueue.length; i++) {
      const { tile, screenX, screenY } = renderQueues.baseTileQueue[i];
      renderers.drawGreyBaseTile(ctx, screenX, screenY, tile, zoom);
    }

    // Draw railroad crossing signals
    const crossingKeySet = refs.crossingKeySet.current;
    crossingKeySet.clear();
    const cachedCrossings = refs.crossingPositions.current;
    for (let i = 0; i < cachedCrossings.length; i++) {
      const { x, y } = cachedCrossings[i];
      crossingKeySet.add(y * config.gridSize + x);
    }

    const currentTrains = refs.trains.current;
    const currentFlashTimer = refs.crossingFlashTimer.current;
    const gateAnglesMap = refs.crossingGateAngles.current;

    for (let i = 0; i < renderQueues.roadQueue.length; i++) {
      const { tile, screenX, screenY } = renderQueues.roadQueue[i];
      if (tile.hasRailOverlay) {
        const crossingKey = tile.y * config.gridSize + tile.x;
        if (crossingKeySet.has(crossingKey)) {
          const gateAngle = gateAnglesMap.get(crossingKey) ?? 0;
          const crossingState = getCrossingStateForTile(currentTrains, tile.x, tile.y);
          const isActive = crossingState !== 'open';

          renderers.drawRailroadCrossing(
            ctx,
            screenX,
            screenY,
            tile.x,
            tile.y,
            grid,
            config.gridSize,
            zoom,
            currentFlashTimer,
            gateAngle,
            isActive
          );
        }
      }
    }

    // Draw buildings on buildings canvas
    const buildingsCanvas = canvases.buildings;
    if (buildingsCanvas) {
      buildingsCanvas.width = config.canvasSize.width;
      buildingsCanvas.height = config.canvasSize.height;

      const buildingsCtx = buildingsCanvas.getContext('2d');
      if (buildingsCtx) {
        buildingsCtx.setTransform(1, 0, 0, 1, 0, 0);
        buildingsCtx.clearRect(0, 0, buildingsCanvas.width, buildingsCanvas.height);

        buildingsCtx.scale(dpr, dpr);
        buildingsCtx.translate(offset.x, offset.y);
        buildingsCtx.scale(zoom, zoom);

        buildingsCtx.imageSmoothingEnabled = false;

        insertionSortByDepth(renderQueues.buildingQueue);
        for (let i = 0; i < renderQueues.buildingQueue.length; i++) {
          const { tile, screenX, screenY } = renderQueues.buildingQueue[i];
          renderers.drawBuilding(buildingsCtx, screenX, screenY, tile);
        }

        // Draw overlays on buildings canvas
        for (let i = 0; i < renderQueues.overlayQueue.length; i++) {
          const { tile, screenX, screenY } = renderQueues.overlayQueue[i];
          const coverage = {
            fire: services.fire[tile.y][tile.x],
            police: services.police[tile.y][tile.x],
            health: services.health[tile.y][tile.x],
            education: services.education[tile.y][tile.x],
          };

          const fillStyle = renderers.getOverlayFillStyle(overlayMode, tile, coverage);
          if (fillStyle !== 'rgba(0, 0, 0, 0)') {
            buildingsCtx.fillStyle = fillStyle;
            buildingsCtx.beginPath();
            buildingsCtx.moveTo(screenX + halfTileWidth, screenY);
            buildingsCtx.lineTo(screenX + TILE_WIDTH, screenY + halfTileHeight);
            buildingsCtx.lineTo(screenX + halfTileWidth, screenY + TILE_HEIGHT);
            buildingsCtx.lineTo(screenX, screenY + halfTileHeight);
            buildingsCtx.closePath();
            buildingsCtx.fill();
          }
        }

        // Draw service radius circles
        if (overlayMode !== 'none' && overlayMode !== 'subway') {
          const serviceBuildingTypes = OVERLAY_TO_BUILDING_TYPES[overlayMode];
          const circleColor = OVERLAY_CIRCLE_COLORS[overlayMode];
          const circleFillColor = OVERLAY_CIRCLE_FILL_COLORS[overlayMode];
          const highlightColor = OVERLAY_HIGHLIGHT_COLORS[overlayMode];

          for (let y = 0; y < config.gridSize; y++) {
            for (let x = 0; x < config.gridSize; x++) {
              const tile = grid[y][x];
              if (!serviceBuildingTypes.includes(tile.building.type)) continue;

              if (tile.building.constructionProgress !== undefined && tile.building.constructionProgress < 100) continue;
              if (tile.building.abandoned) continue;

              const svcConfig = SERVICE_CONFIG[tile.building.type as keyof typeof SERVICE_CONFIG];
              if (!svcConfig || !('range' in svcConfig)) continue;

              const range = svcConfig.range;
              const { screenX: bldgScreenX, screenY: bldgScreenY } = config.gridToScreen(x, y, 0, 0);
              const centerX = bldgScreenX + halfTileWidth;
              const centerY = bldgScreenY + halfTileHeight;

              const radiusX = range * halfTileWidth;
              const radiusY = range * halfTileHeight;

              buildingsCtx.strokeStyle = circleColor;
              buildingsCtx.lineWidth = 2 / zoom;
              buildingsCtx.beginPath();
              buildingsCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
              buildingsCtx.stroke();

              buildingsCtx.fillStyle = circleFillColor;
              buildingsCtx.fill();

              buildingsCtx.strokeStyle = highlightColor;
              buildingsCtx.lineWidth = 3 / zoom;
              buildingsCtx.beginPath();
              buildingsCtx.moveTo(bldgScreenX + halfTileWidth, bldgScreenY);
              buildingsCtx.lineTo(bldgScreenX + TILE_WIDTH, bldgScreenY + halfTileHeight);
              buildingsCtx.lineTo(bldgScreenX + halfTileWidth, bldgScreenY + TILE_HEIGHT);
              buildingsCtx.lineTo(bldgScreenX, bldgScreenY + halfTileHeight);
              buildingsCtx.closePath();
              buildingsCtx.stroke();

              buildingsCtx.fillStyle = highlightColor;
              buildingsCtx.beginPath();
              buildingsCtx.arc(centerX, centerY, 4 / zoom, 0, Math.PI * 2);
              buildingsCtx.fill();
            }
          }
        }

        buildingsCtx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }

    // Draw water body names
    if (waterBodies && waterBodies.length > 0) {
      ctx.save();
      ctx.font = `${Math.max(10, 12 / zoom)}px sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const viewWidth = config.canvasSize.width / (dpr * zoom);
      const viewHeight = config.canvasSize.height / (dpr * zoom);
      const viewLeft = -offset.x / zoom - TILE_WIDTH;
      const viewTop = -offset.y / zoom - TILE_HEIGHT * 2;
      const viewRight = viewWidth - offset.x / zoom + TILE_WIDTH;
      const viewBottom = viewHeight - offset.y / zoom + TILE_HEIGHT * 2;

      for (const waterBody of waterBodies) {
        if (waterBody.tiles.length === 0) continue;

        const { screenX, screenY } = config.gridToScreen(waterBody.centerX, waterBody.centerY, 0, 0);

        if (screenX >= viewLeft - 100 && screenX <= viewRight + 100 &&
            screenY >= viewTop - 50 && screenY <= viewBottom + 50) {
          ctx.strokeText(waterBody.name, screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
          ctx.fillText(waterBody.name, screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
        }
      }

      ctx.restore();
    }

    ctx.restore();

    // Schedule next frame
    animationFrameId = requestAnimationFrame(render);
  }

  /**
   * Start the render loop
   */
  function start() {
    if (animationFrameId === null) {
      render();
    }
  }

  /**
   * Stop the render loop
   */
  function stop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  return {
    start,
    stop,
  };
}
