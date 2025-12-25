import { Tile } from '@/types/game';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';
import { gridToScreen } from '@/components/game/utils';
import { getBuildingSize } from '@/lib/simulation';

export interface HoverRenderContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  grid: Tile[][];
  gridSize: number;
  offset: { x: number; y: number };
  zoom: number;
  hoveredTile: { x: number; y: number } | null;
  selectedTile: { x: number; y: number } | null;
  isPanning: boolean;
  isWheelScrolling: boolean;
}

// Helper to draw highlight diamond
function drawHighlight(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  color: string = 'rgba(255, 255, 255, 0.25)',
  strokeColor: string = '#ffffff'
) {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;

  // Draw semi-transparent fill
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(screenX + w / 2, screenY);
  ctx.lineTo(screenX + w, screenY + h / 2);
  ctx.lineTo(screenX + w / 2, screenY + h);
  ctx.lineTo(screenX, screenY + h / 2);
  ctx.closePath();
  ctx.fill();

  // Draw border
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawHoverCanvas(context: HoverRenderContext) {
  const { ctx, canvas, grid, gridSize, offset, zoom, hoveredTile, selectedTile, isPanning, isWheelScrolling } =
    context;

  const dpr = window.devicePixelRatio || 1;
  const currentOffset = offset;
  const currentZoom = zoom;

  // Don't show hover highlight while panning or scrolling - check refs for immediate state
  const currentHover = isPanning || isWheelScrolling ? null : hoveredTile;

  // Clear the hover canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply transform (same as main canvas)
  ctx.scale(dpr, dpr);
  ctx.translate(currentOffset.x, currentOffset.y);
  ctx.scale(currentZoom, currentZoom);

  // Draw hovered tile highlight (from ref, not state) - only when not panning
  if (
    currentHover &&
    currentHover.x >= 0 &&
    currentHover.x < gridSize &&
    currentHover.y >= 0 &&
    currentHover.y < gridSize
  ) {
    const { screenX, screenY } = gridToScreen(currentHover.x, currentHover.y, 0, 0);
    drawHighlight(ctx, screenX, screenY);
  }

  // Draw selected tile highlight (including multi-tile buildings)
  if (
    selectedTile &&
    selectedTile.x >= 0 &&
    selectedTile.x < gridSize &&
    selectedTile.y >= 0 &&
    selectedTile.y < gridSize
  ) {
    const selectedOrigin = grid[selectedTile.y]?.[selectedTile.x];
    if (selectedOrigin) {
      const selectedSize = getBuildingSize(selectedOrigin.building.type);
      // Draw highlight for each tile in the building footprint
      for (let dx = 0; dx < selectedSize.width; dx++) {
        for (let dy = 0; dy < selectedSize.height; dy++) {
          const tx = selectedTile.x + dx;
          const ty = selectedTile.y + dy;
          if (tx >= 0 && tx < gridSize && ty >= 0 && ty < gridSize) {
            const { screenX, screenY } = gridToScreen(tx, ty, 0, 0);
            drawHighlight(ctx, screenX, screenY, 'rgba(100, 200, 255, 0.3)', '#60a5fa');
          }
        }
      }
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
