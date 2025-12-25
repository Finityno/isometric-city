'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useMiniMapData } from '@/store/selectors';
import { Card } from '@/components/ui/card';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';

// Constants
const MINIMAP_SIZE = 140;

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

// Color lookup map for tile types - ordered by priority
const TILE_COLORS: Record<string, string> = {
  water: '#0ea5e9',
  road: '#6b7280',
  tree: '#166534',
  power_plant: '#f97316',
  water_tower: '#06b6d4',
};

// Zone colors (building vs empty)
const ZONE_COLORS = {
  residential: { built: '#22c55e', empty: '#14532d' },
  commercial: { built: '#38bdf8', empty: '#1d4ed8' },
  industrial: { built: '#f59e0b', empty: '#b45309' },
} as const;

interface MiniMapProps {
  onNavigate?: (gridX: number, gridY: number) => void;
  viewport?: {
    offset: { x: number; y: number };
    zoom: number;
    canvasSize: { width: number; height: number }
  } | null;
}

// Get tile color based on building type, zone, and state
function getTileColor(buildingType: string, zone: string, onFire: boolean): string {
  // Fire takes priority
  if (onFire) return '#ef4444';

  // Direct type lookup
  if (TILE_COLORS[buildingType]) return TILE_COLORS[buildingType];

  // Service buildings
  if (SERVICE_BUILDINGS.has(buildingType)) return '#c084fc';

  // Park buildings
  if (PARK_BUILDINGS.has(buildingType)) return '#84cc16';

  // Zone-based colors
  const zoneColor = ZONE_COLORS[zone as keyof typeof ZONE_COLORS];
  if (zoneColor) {
    return buildingType !== 'grass' ? zoneColor.built : zoneColor.empty;
  }

  // Default grass color
  return '#2d5a3d';
}

// Canvas-based Minimap - Memoized with throttled grid rendering
export const MiniMap = React.memo(function MiniMap({ onNavigate, viewport }: MiniMapProps) {
  const { grid, gridSize, tick } = useMiniMapData();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridImageRef = useRef<ImageData | null>(null);
  const lastGridRenderTickRef = useRef(-1);
  const lastGridRef = useRef<typeof grid | null>(null);
  const tickRef = useRef(tick);

  // Keep tick in ref to avoid effect re-runs
  tickRef.current = tick;
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // PERF: willReadFrequently=true optimizes for getImageData calls
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const scale = MINIMAP_SIZE / gridSize;
    const scaleCeil = Math.ceil(scale);

    // Track if grid reference changed (indicates building placement or other grid modification)
    const gridChanged = lastGridRef.current !== grid;
    lastGridRef.current = grid;

    // Re-render grid portion every 10 ticks OR when grid changes (building placed, etc.)
    // This ensures immediate updates when user places buildings while keeping CPU usage low
    const currentTick = tickRef.current;
    const shouldRenderGrid = lastGridRenderTickRef.current === -1 ||
                             currentTick - lastGridRenderTickRef.current >= 10 ||
                             gridChanged;

    if (shouldRenderGrid) {
      lastGridRenderTickRef.current = currentTick;

      ctx.fillStyle = '#0b1723';
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const tile = grid[y][x];
          const color = getTileColor(tile.building.type, tile.zone, tile.building.onFire);
          ctx.fillStyle = color;
          ctx.fillRect(x * scale, y * scale, scaleCeil, scaleCeil);
        }
      }

      // Save the grid portion for quick viewport-only updates
      gridImageRef.current = ctx.getImageData(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    } else if (gridImageRef.current) {
      // Restore cached grid image, then just draw viewport
      ctx.putImageData(gridImageRef.current, 0, 0);
    }

    // Draw viewport rectangle (always updated)
    if (viewport) {
      const { offset, zoom, canvasSize } = viewport;

      // Pre-compute division factors
      const halfTileWidth = TILE_WIDTH / 2;
      const halfTileHeight = TILE_HEIGHT / 2;

      const screenToGridForMinimap = (screenX: number, screenY: number) => {
        const adjustedX = (screenX - offset.x) / zoom;
        const adjustedY = (screenY - offset.y) / zoom;
        const gridX = (adjustedX / halfTileWidth + adjustedY / halfTileHeight) / 2;
        const gridY = (adjustedY / halfTileHeight - adjustedX / halfTileWidth) / 2;
        return { gridX, gridY };
      };

      const topLeft = screenToGridForMinimap(0, 0);
      const topRight = screenToGridForMinimap(canvasSize.width, 0);
      const bottomLeft = screenToGridForMinimap(0, canvasSize.height);
      const bottomRight = screenToGridForMinimap(canvasSize.width, canvasSize.height);

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
  }, [grid, gridSize, viewport]);

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
