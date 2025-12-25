'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useMiniMapData } from '@/store/selectors';
import { Card } from '@/components/ui/card';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';

// Constants
const MINIMAP_SIZE = 140;

// Pre-compute inverse values to avoid division in hot paths
const INV_HALF_TILE_WIDTH = 2 / TILE_WIDTH;
const INV_HALF_TILE_HEIGHT = 2 / TILE_HEIGHT;

// Service buildings for minimap color mapping
const SERVICE_BUILDINGS = new Set([
  'police_station', 'fire_station', 'hospital', 'school', 'university'
]);

// Park buildings for minimap color mapping
const PARK_BUILDINGS = new Set([
  'park', 'park_large', 'tennis', 'basketball_courts', 'playground_small',
  'playground_large', 'baseball_field_small', 'soccer_field_small', 'football_field',
  'baseball_stadium', 'community_center', 'swimming_pool', 'skate_park',
  'mini_golf_course', 'bleachers_field', 'go_kart_track', 'amphitheater',
  'greenhouse_garden', 'animal_pens_farm', 'cabin_house', 'campground',
  'marina_docks_small', 'pier_large', 'roller_coaster_small', 'community_garden',
  'pond_park', 'park_gate', 'mountain_lodge', 'mountain_trailhead', 'office_building_small'
]);

// Pre-computed RGBA color values (0xAABBGGRR format for little-endian)
// This avoids hex parsing in the hot loop
const COLOR_FIRE = 0xFF4444EF;        // #ef4444
const COLOR_WATER = 0xFFE9A50E;       // #0ea5e9
const COLOR_ROAD = 0xFF80726B;        // #6b7280
const COLOR_TREE = 0xFF346516;        // #166534
const COLOR_POWER = 0xFF16730F9;      // #f97316
const COLOR_WATER_TOWER = 0xFFD4B606; // #06b6d4
const COLOR_SERVICE = 0xFFFC84C0;     // #c084fc
const COLOR_PARK = 0xFF16CC84;        // #84cc16
const COLOR_RES_BUILT = 0xFF55C522;   // #22c55e
const COLOR_RES_EMPTY = 0xFF2D5314;   // #14532d
const COLOR_COM_BUILT = 0xFFF8BD38;   // #38bdf8
const COLOR_COM_EMPTY = 0xFFD84E1D;   // #1d4ed8
const COLOR_IND_BUILT = 0xFF0B9EF5;   // #f59e0b
const COLOR_IND_EMPTY = 0xFF0953B4;   // #b45309
const COLOR_GRASS = 0xFF3D5A2D;       // #2d5a3d
const COLOR_BG = 0xFF23170B;          // #0b1723

// Color lookup map for direct building types (RGBA values)
const TILE_COLORS_RGBA: Record<string, number> = {
  water: COLOR_WATER,
  road: COLOR_ROAD,
  tree: COLOR_TREE,
  power_plant: COLOR_POWER,
  water_tower: COLOR_WATER_TOWER,
};

// Zone colors lookup (RGBA values)
const ZONE_COLORS_RGBA = {
  residential: { built: COLOR_RES_BUILT, empty: COLOR_RES_EMPTY },
  commercial: { built: COLOR_COM_BUILT, empty: COLOR_COM_EMPTY },
  industrial: { built: COLOR_IND_BUILT, empty: COLOR_IND_EMPTY },
} as const;

interface MiniMapProps {
  onNavigate?: (gridX: number, gridY: number) => void;
  viewport?: {
    offset: { x: number; y: number };
    zoom: number;
    canvasSize: { width: number; height: number }
  } | null;
}

// Get tile color as RGBA value for direct Uint32Array assignment
// Returns pre-computed 32-bit color to avoid string parsing in hot loop
function getTileColorRGBA(buildingType: string, zone: string, onFire: boolean): number {
  // Fire takes priority
  if (onFire) return COLOR_FIRE;

  // Direct type lookup
  const directColor = TILE_COLORS_RGBA[buildingType];
  if (directColor !== undefined) return directColor;

  // Service buildings
  if (SERVICE_BUILDINGS.has(buildingType)) return COLOR_SERVICE;

  // Park buildings
  if (PARK_BUILDINGS.has(buildingType)) return COLOR_PARK;

  // Zone-based colors
  const zoneColor = ZONE_COLORS_RGBA[zone as keyof typeof ZONE_COLORS_RGBA];
  if (zoneColor) {
    return buildingType !== 'grass' ? zoneColor.built : zoneColor.empty;
  }

  // Default grass color
  return COLOR_GRASS;
}

// Canvas-based Minimap - Memoized with throttled grid rendering
export const MiniMap = React.memo(function MiniMap({ onNavigate, viewport }: MiniMapProps) {
  const { grid, gridSize, tick } = useMiniMapData();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Use offscreen canvas for grid rendering - much faster than ImageData for blitting
  const offscreenCanvasRef = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);
  const offscreenCtxRef = useRef<OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null>(null);

  // Pre-allocated ImageData buffer for direct pixel manipulation
  const imageDataRef = useRef<ImageData | null>(null);
  const pixelBufferRef = useRef<Uint32Array | null>(null);

  // Tracking refs for throttling and change detection
  const lastGridRenderTickRef = useRef(-1);
  const lastGridRef = useRef<typeof grid | null>(null);
  const lastViewportRef = useRef<typeof viewport | null>(null);
  const lastGridSizeRef = useRef(-1);

  // Pre-computed scale values (updated when gridSize changes)
  const scaleRef = useRef(MINIMAP_SIZE / gridSize);

  // Initialize offscreen canvas and buffers
  useEffect(() => {
    // Create offscreen canvas for grid (avoids main canvas flicker)
    if (typeof OffscreenCanvas !== 'undefined') {
      offscreenCanvasRef.current = new OffscreenCanvas(MINIMAP_SIZE, MINIMAP_SIZE);
      offscreenCtxRef.current = offscreenCanvasRef.current.getContext('2d', { alpha: false });
    } else {
      // Fallback for Safari < 16.4
      const fallback = document.createElement('canvas');
      fallback.width = MINIMAP_SIZE;
      fallback.height = MINIMAP_SIZE;
      offscreenCanvasRef.current = fallback;
      offscreenCtxRef.current = fallback.getContext('2d', { alpha: false });
    }

    // Pre-allocate ImageData and Uint32Array view for direct pixel writes
    if (offscreenCtxRef.current) {
      imageDataRef.current = offscreenCtxRef.current.createImageData(MINIMAP_SIZE, MINIMAP_SIZE);
      pixelBufferRef.current = new Uint32Array(imageDataRef.current.data.buffer);
    }

    return () => {
      offscreenCanvasRef.current = null;
      offscreenCtxRef.current = null;
      imageDataRef.current = null;
      pixelBufferRef.current = null;
    };
  }, []);

  // Main rendering effect - optimized for minimal work per frame
  useEffect(() => {
    const canvas = canvasRef.current;
    const offscreenCanvas = offscreenCanvasRef.current;
    const offscreenCtx = offscreenCtxRef.current;
    const imageData = imageDataRef.current;
    const pixels = pixelBufferRef.current;

    if (!canvas || !offscreenCanvas || !offscreenCtx || !imageData || !pixels) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Update scale if gridSize changed
    if (gridSize !== lastGridSizeRef.current) {
      scaleRef.current = MINIMAP_SIZE / gridSize;
      lastGridSizeRef.current = gridSize;
    }
    const scale = scaleRef.current;

    // Track if grid reference changed (indicates building placement or other grid modification)
    const gridChanged = lastGridRef.current !== grid;
    lastGridRef.current = grid;

    // Re-render grid every 10 ticks OR when grid changes
    const shouldRenderGrid = lastGridRenderTickRef.current === -1 ||
                             tick - lastGridRenderTickRef.current >= 10 ||
                             gridChanged;

    if (shouldRenderGrid) {
      lastGridRenderTickRef.current = tick;

      // OPTIMIZATION: Direct pixel manipulation using Uint32Array
      // This is 5-10x faster than fillRect() for many small rectangles
      const pixelScale = Math.max(1, Math.floor(scale));

      // Fill background first
      pixels.fill(COLOR_BG);

      // Render grid tiles directly to pixel buffer
      for (let y = 0; y < gridSize; y++) {
        const row = grid[y];
        const basePixelY = Math.floor(y * scale);

        for (let x = 0; x < gridSize; x++) {
          const tile = row[x];
          const color = getTileColorRGBA(tile.building.type, tile.zone, tile.building.onFire);
          const basePixelX = Math.floor(x * scale);

          // Fill a pixelScale x pixelScale block for this tile
          for (let py = 0; py < pixelScale && basePixelY + py < MINIMAP_SIZE; py++) {
            const rowOffset = (basePixelY + py) * MINIMAP_SIZE;
            for (let px = 0; px < pixelScale && basePixelX + px < MINIMAP_SIZE; px++) {
              pixels[rowOffset + basePixelX + px] = color;
            }
          }
        }
      }

      // Write pixel data to offscreen canvas
      offscreenCtx.putImageData(imageData, 0, 0);
    }

    // Copy offscreen canvas to main canvas (very fast blit operation)
    ctx.drawImage(offscreenCanvas as CanvasImageSource, 0, 0);

    // Draw viewport rectangle (always updated for smooth panning)
    if (viewport) {
      const { offset, zoom, canvasSize } = viewport;

      // Pre-compute inverse zoom to avoid repeated division
      const invZoom = 1 / zoom;

      // Optimized screen-to-grid conversion using pre-computed inverse values
      // Original: gridX = (adjustedX / halfTileWidth + adjustedY / halfTileHeight) / 2
      // Simplified: gridX = adjustedX * INV_HALF_TILE_WIDTH + adjustedY * INV_HALF_TILE_HEIGHT (where INV includes /2)
      const screenToGrid = (screenX: number, screenY: number) => {
        const adjustedX = (screenX - offset.x) * invZoom;
        const adjustedY = (screenY - offset.y) * invZoom;
        return {
          gridX: (adjustedX * INV_HALF_TILE_WIDTH + adjustedY * INV_HALF_TILE_HEIGHT) * 0.5,
          gridY: (adjustedY * INV_HALF_TILE_HEIGHT - adjustedX * INV_HALF_TILE_WIDTH) * 0.5
        };
      };

      // Calculate all four corners
      const topLeft = screenToGrid(0, 0);
      const topRight = screenToGrid(canvasSize.width, 0);
      const bottomLeft = screenToGrid(0, canvasSize.height);
      const bottomRight = screenToGrid(canvasSize.width, canvasSize.height);

      // Draw viewport indicator
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(topLeft.gridX * scale, topLeft.gridY * scale);
      ctx.lineTo(topRight.gridX * scale, topRight.gridY * scale);
      ctx.lineTo(bottomRight.gridX * scale, bottomRight.gridY * scale);
      ctx.lineTo(bottomLeft.gridX * scale, bottomLeft.gridY * scale);
      ctx.closePath();
      ctx.stroke();
    }

    // Store viewport for potential future comparison
    lastViewportRef.current = viewport;
  }, [grid, gridSize, tick, viewport]);

  const [isDragging, setIsDragging] = useState(false);
  
  const navigateToPosition = useCallback((e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
    if (!onNavigate) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scale = MINIMAP_SIZE / gridSize;
    
    const gridX = Math.floor(clickX / scale);
    const gridY = Math.floor(clickY / scale);
    
    // Clamp to valid grid coordinates
    const clampedX = Math.max(0, Math.min(gridSize - 1, gridX));
    const clampedY = Math.max(0, Math.min(gridSize - 1, gridY));
    
    onNavigate(clampedX, clampedY);
  }, [onNavigate, gridSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    navigateToPosition(e);
  }, [navigateToPosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      navigateToPosition(e);
    }
  }, [isDragging, navigateToPosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle mouse up outside the canvas
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);
  
  return (
    <Card className="absolute bottom-6 right-8 p-3 shadow-lg bg-card/90 border-border/70">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-2">
        Minimap
      </div>
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        className="block rounded-md border border-border/60 cursor-pointer select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      <div className="mt-2 grid grid-cols-4 gap-1 text-[8px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-sm" />
          <span className="text-muted-foreground">R</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-blue-500 rounded-sm" />
          <span className="text-muted-foreground">C</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-amber-500 rounded-sm" />
          <span className="text-muted-foreground">I</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-pink-500 rounded-sm" />
          <span className="text-muted-foreground">S</span>
        </div>
      </div>
    </Card>
  );
});
