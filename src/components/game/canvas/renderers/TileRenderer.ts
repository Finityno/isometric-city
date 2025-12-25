import { Tile } from '@/types/game';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';
import { WATER_ASSET_PATH } from '@/components/game/constants';
import { getCachedImage } from '@/components/game/helpers';

interface TileMetadata {
  isPartOfParkBuilding?: boolean;
  needsGreyBase?: boolean;
}

/**
 * Draw isometric tile base
 */
export function drawIsometricTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: Tile,
  highlight: boolean,
  currentZoom: number,
  getTileMetadata: (x: number, y: number) => TileMetadata | null | undefined,
  skipGreyBase: boolean = false,
  skipGreenBase: boolean = false
): void {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;

  // Determine tile colors (top face and shading)
  let topColor = '#4a7c3f'; // grass
  let strokeColor = '#2d4a26';

  // PERF: Use pre-computed tile metadata for grey base check (O(1) lookup)
  const tileRenderMetadata = getTileMetadata(tile.x, tile.y);
  const isPark =
    tileRenderMetadata?.isPartOfParkBuilding ||
    [
      'park',
      'park_large',
      'tennis',
      'basketball_courts',
      'playground_small',
      'playground_large',
      'baseball_field_small',
      'soccer_field_small',
      'football_field',
      'skate_park',
      'mini_golf_course',
      'bleachers_field',
      'go_kart_track',
      'amphitheater',
      'greenhouse_garden',
      'animal_pens_farm',
      'cabin_house',
      'campground',
      'marina_docks_small',
      'pier_large',
      'roller_coaster_small',
      'community_garden',
      'pond_park',
      'park_gate',
      'mountain_lodge',
      'mountain_trailhead',
    ].includes(tile.building.type);
  const hasGreyBase = tileRenderMetadata?.needsGreyBase ?? false;

  if (tile.building.type === 'water') {
    topColor = '#2563eb';
    strokeColor = '#1e3a8a';
  } else if (tile.building.type === 'road') {
    topColor = '#4a4a4a';
    strokeColor = '#333';
  } else if (isPark) {
    topColor = '#4a7c3f';
    strokeColor = '#2d4a26';
  } else if (hasGreyBase && !skipGreyBase) {
    // Grey/concrete base tiles for ALL buildings (except parks)
    // Skip if skipGreyBase is true (will be drawn later after water)
    topColor = '#6b7280';
    strokeColor = '#374151';
  } else if (tile.zone === 'residential') {
    if (tile.building.type !== 'grass' && tile.building.type !== 'empty') {
      topColor = '#3d7c3f';
    } else {
      topColor = '#2d5a2d';
    }
    strokeColor = '#22c55e';
  } else if (tile.zone === 'commercial') {
    if (tile.building.type !== 'grass' && tile.building.type !== 'empty') {
      topColor = '#3a5c7c';
    } else {
      topColor = '#2a4a6a';
    }
    strokeColor = '#3b82f6';
  } else if (tile.zone === 'industrial') {
    if (tile.building.type !== 'grass' && tile.building.type !== 'empty') {
      topColor = '#7c5c3a';
    } else {
      topColor = '#6a4a2a';
    }
    strokeColor = '#f59e0b';
  }

  // Skip drawing green base for tiles adjacent to water (will be drawn later over water)
  // This includes grass, empty, and tree tiles - all have green bases
  const shouldSkipDrawing =
    skipGreenBase &&
    (tile.building.type === 'grass' ||
      tile.building.type === 'empty' ||
      tile.building.type === 'tree');

  // Draw the isometric diamond (top face)
  if (!shouldSkipDrawing) {
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    ctx.fill();

    // Draw grid lines only when zoomed in (hide when zoom < 0.6)
    if (currentZoom >= 0.6) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Draw zone border with dashed line (hide when zoomed out, only on grass/empty tiles - not on roads or buildings)
    if (
      tile.zone !== 'none' &&
      currentZoom >= 0.95 &&
      (tile.building.type === 'grass' || tile.building.type === 'empty')
    ) {
      ctx.strokeStyle =
        tile.zone === 'residential' ? '#22c55e' : tile.zone === 'commercial' ? '#3b82f6' : '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Highlight on hover/select (always draw, even if base was skipped)
  if (highlight) {
    // Draw a semi-transparent fill for better visibility
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    ctx.fill();

    // Draw white border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/**
 * Helper function to draw water tile at a given screen position
 * Used for marina/pier buildings that sit on water
 */
export function drawWaterTileAt(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  gridX: number,
  gridY: number
): void {
  const waterImage = getCachedImage(WATER_ASSET_PATH);
  if (!waterImage) return;

  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const tileCenterX = screenX + w / 2;
  const tileCenterY = screenY + h / 2;

  // Random subcrop of water texture based on tile position for variety
  const imgW = waterImage.naturalWidth || waterImage.width;
  const imgH = waterImage.naturalHeight || waterImage.height;

  // Deterministic "random" offset based on tile position
  const seedX = ((gridX * 7919 + gridY * 6271) % 1000) / 1000;
  const seedY = ((gridX * 4177 + gridY * 9311) % 1000) / 1000;

  // Take a subcrop for variety
  const cropScale = 0.35;
  const cropW = imgW * cropScale;
  const cropH = imgH * cropScale;
  const maxOffsetX = imgW - cropW;
  const maxOffsetY = imgH - cropH;
  const srcX = seedX * maxOffsetX;
  const srcY = seedY * maxOffsetY;

  ctx.save();
  // Clip to isometric diamond shape
  ctx.beginPath();
  ctx.moveTo(screenX + w / 2, screenY); // top
  ctx.lineTo(screenX + w, screenY + h / 2); // right
  ctx.lineTo(screenX + w / 2, screenY + h); // bottom
  ctx.lineTo(screenX, screenY + h / 2); // left
  ctx.closePath();
  ctx.clip();

  const aspectRatio = cropH / cropW;
  const jitterX = (seedX - 0.5) * w * 0.3;
  const jitterY = (seedY - 0.5) * h * 0.3;

  // Draw water with slight transparency
  const destWidth = w * 1.15;
  const destHeight = destWidth * aspectRatio;

  ctx.globalAlpha = 0.95;
  ctx.drawImage(
    waterImage,
    srcX,
    srcY,
    cropW,
    cropH,
    Math.round(tileCenterX - destWidth / 2 + jitterX * 0.3),
    Math.round(tileCenterY - destHeight / 2 + jitterY * 0.3),
    Math.round(destWidth),
    Math.round(destHeight)
  );

  ctx.restore();
}
