/**
 * Pedestrian drawing utilities
 * Renders pedestrians with dynamic activities and states
 * OPTIMIZED for performance with LOD (Level of Detail)
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Zero allocations in hot path (pre-allocated objects)
 * - Aggressive early culling before coordinate transforms
 * - Batched canvas state changes
 * - Integer coordinates for crisp sub-pixel rendering
 * - Inlined coordinate transforms to avoid function call overhead
 * - Activity-based batching for similar pedestrians
 */

import { Pedestrian, PedestrianActivity, TILE_WIDTH, TILE_HEIGHT } from './types';
import { DIRECTION_META } from './constants';
import { getPedestrianOpacity, getVisiblePedestrians } from './pedestrianSystem';

// LOD thresholds - draw simpler at lower zoom
const LOD_SIMPLE_ZOOM = 0.55;  // Below this, draw very simple pedestrians (just above min zoom)
const LOD_MEDIUM_ZOOM = 0.75;  // Below this, skip some details

// Hair colors for hairstyles
const HAIR_COLORS = ['#2c1810', '#4a3728', '#8b4513', '#d4a574', '#f5deb3', '#1a1a1a', '#8b0000'];

// PERF: Pre-computed constants to avoid repeated calculations
const TILE_WIDTH_HALF = TILE_WIDTH / 2;
const TILE_HEIGHT_HALF = TILE_HEIGHT / 2;
const TWO_PI = Math.PI * 2;

// PERF: Pre-allocated objects for coordinate transforms - zero allocations in hot path
const _screenCoord = { screenX: 0, screenY: 0 };

// PERF: Inlined gridToScreen to avoid function call overhead in hot loop
// Returns values in pre-allocated _screenCoord object
function gridToScreenInline(x: number, y: number): void {
  _screenCoord.screenX = (x - y) * TILE_WIDTH_HALF;
  _screenCoord.screenY = (x + y) * TILE_HEIGHT_HALF;
}

// PERF: Pre-computed sidewalk offsets lookup table (direction * 2 + sidewalkSide)
// Index: north=0, south=1, east=2, west=3; left=0, right=1
// Total index = direction_index * 2 + (sidewalkSide === 'right' ? 1 : 0)
const SIDEWALK_Y_OFFSETS = new Int8Array([
  -2, -6,  // north: left, right
   2,  6,  // south: left, right
  -6, -2,  // east: left, right
   6,  2,  // west: left, right
]);
const DIRECTION_INDEX: Record<string, number> = { north: 0, south: 1, east: 2, west: 3 };

/**
 * Get Y offset to keep pedestrians visually on the sidewalk based on direction and side
 * PERF: Uses pre-computed lookup table instead of conditionals
 */
function getSidewalkYOffset(direction: 'north' | 'south' | 'east' | 'west', sidewalkSide: 'left' | 'right'): number {
  const idx = DIRECTION_INDEX[direction] * 2 + (sidewalkSide === 'right' ? 1 : 0);
  return SIDEWALK_Y_OFFSETS[idx];
}

/**
 * Draw hair/ponytail on a pedestrian
 * @param pedId - Pedestrian ID for consistent hair color (avoids flickering)
 */
function drawHair(ctx: CanvasRenderingContext2D, headX: number, headY: number, headRadius: number, pedId: number): void {
  // Pick a hair color based on pedestrian ID (stable, no flickering)
  const hairColor = HAIR_COLORS[pedId % HAIR_COLORS.length];

  ctx.fillStyle = hairColor;

  // Draw hair on top of head
  ctx.beginPath();
  ctx.arc(headX, headY - headRadius * 0.3, headRadius * 1.1, Math.PI, 0);
  ctx.fill();

  // Draw ponytail or longer hair on side
  ctx.beginPath();
  ctx.ellipse(headX + headRadius * 0.8, headY + headRadius * 0.3, headRadius * 0.4, headRadius * 0.9, 0.3, 0, TWO_PI);
  ctx.fill();
}

/**
 * Filter mode for drawing pedestrians
 * - 'all': Draw all visible pedestrians
 * - 'recreation': Only draw pedestrians at recreation areas (for drawing on top of parks)
 * - 'non-recreation': Only draw pedestrians NOT at recreation areas (for drawing below buildings)
 */
export type PedestrianFilterMode = 'all' | 'recreation' | 'non-recreation';

// PERF: Pre-allocated arrays for batching pedestrians by activity type
// This allows drawing similar pedestrians together to minimize state changes
const _simplePeds: Pedestrian[] = [];
const _mediumWalkingPeds: Pedestrian[] = [];
const _mediumActivityPeds: Pedestrian[] = [];
const _fullDetailPeds: Pedestrian[] = [];

// PERF: Pre-allocated position data to avoid object creation per pedestrian
// Stores [pedX, pedY, opacity] for each pedestrian that passes culling
const MAX_VISIBLE_PEDS = 1024;
const _pedPositions = new Float32Array(MAX_VISIBLE_PEDS * 3);
const _pedIndices: number[] = new Array(MAX_VISIBLE_PEDS);

/**
 * Draw pedestrians with dynamic activities and states
 * Uses LOD (Level of Detail) for performance
 *
 * PERFORMANCE: Uses batching, early culling, and zero-allocation hot paths
 *
 * @param filterMode - Controls which pedestrians to draw:
 *   - 'all': All visible pedestrians (default)
 *   - 'recreation': Only pedestrians at recreation areas (draw on buildings canvas)
 *   - 'non-recreation': Only walking/other pedestrians (draw on cars canvas)
 */
export function drawPedestrians(
  ctx: CanvasRenderingContext2D,
  pedestrians: Pedestrian[],
  viewBounds: { viewLeft: number; viewTop: number; viewRight: number; viewBottom: number },
  zoom: number = 1.0,
  filterMode: PedestrianFilterMode = 'all'
): void {
  // Get only visible pedestrians (not inside buildings)
  let visiblePedestrians = getVisiblePedestrians(pedestrians);

  // Apply filter mode
  if (filterMode === 'recreation') {
    // Include both recreation and beach activities
    visiblePedestrians = visiblePedestrians.filter(ped =>
      ped.state === 'at_recreation' || ped.state === 'at_beach'
    );
  } else if (filterMode === 'non-recreation') {
    visiblePedestrians = visiblePedestrians.filter(ped =>
      ped.state !== 'at_recreation' && ped.state !== 'at_beach'
    );
  }

  const pedCount = visiblePedestrians.length;
  if (pedCount === 0) return;

  // PERF: Expand view bounds for culling - pre-compute once
  const cullLeft = viewBounds.viewLeft - 50;
  const cullRight = viewBounds.viewRight + 50;
  const cullTop = viewBounds.viewTop - 60;
  const cullBottom = viewBounds.viewBottom + 60;

  // Determine LOD level based on zoom
  const useSimpleLOD = zoom < LOD_SIMPLE_ZOOM;
  const useMediumLOD = zoom < LOD_MEDIUM_ZOOM;

  // PERF: First pass - calculate positions and perform early culling
  // Store positions in typed array to avoid per-pedestrian object allocation
  let visibleCount = 0;

  for (let i = 0; i < pedCount && visibleCount < MAX_VISIBLE_PEDS; i++) {
    const ped = visiblePedestrians[i];
    let pedX: number;
    let pedY: number;

    // PERF: Inlined position calculations with pre-allocated coordinate object
    const state = ped.state;

    if (state === 'at_recreation') {
      gridToScreenInline(ped.destX, ped.destY);
      pedX = _screenCoord.screenX + TILE_WIDTH_HALF + ped.activityOffsetX;
      pedY = _screenCoord.screenY + TILE_HEIGHT_HALF + ped.activityOffsetY;
    } else if (state === 'at_beach') {
      if (ped.activity === 'beach_swimming') {
        gridToScreenInline(ped.beachTileX, ped.beachTileY);
        pedX = _screenCoord.screenX + TILE_WIDTH_HALF + ped.activityOffsetX * 0.5;
        pedY = _screenCoord.screenY + TILE_HEIGHT_HALF + ped.activityOffsetY * 0.5;
      } else {
        gridToScreenInline(ped.tileX, ped.tileY);
        pedX = _screenCoord.screenX + TILE_WIDTH_HALF + ped.activityOffsetX * 0.3;
        pedY = _screenCoord.screenY + TILE_HEIGHT_HALF + ped.activityOffsetY * 0.3;
      }
    } else if (state === 'entering_building' || state === 'exiting_building') {
      gridToScreenInline(ped.destX, ped.destY);
      pedX = _screenCoord.screenX + TILE_WIDTH_HALF;
      pedY = _screenCoord.screenY + TILE_HEIGHT_HALF;
    } else {
      // Walking, socializing, idle - common path
      gridToScreenInline(ped.tileX, ped.tileY);
      const centerX = _screenCoord.screenX + TILE_WIDTH_HALF;
      const centerY = _screenCoord.screenY + TILE_HEIGHT_HALF;
      const meta = DIRECTION_META[ped.direction];
      const sidewalkOffset = ped.sidewalkSide === 'left' ? -10 : 10;
      const yOffset = getSidewalkYOffset(ped.direction, ped.sidewalkSide);

      if (state === 'socializing') {
        pedX = centerX + meta.vec.dx * ped.progress + meta.normal.nx * sidewalkOffset + ped.activityOffsetX;
        pedY = centerY + meta.vec.dy * ped.progress + meta.normal.ny * sidewalkOffset + ped.activityOffsetY + yOffset;
      } else {
        pedX = centerX + meta.vec.dx * ped.progress + meta.normal.nx * sidewalkOffset;
        pedY = centerY + meta.vec.dy * ped.progress + meta.normal.ny * sidewalkOffset + yOffset;
      }
    }

    // PERF: Early viewport culling - skip before any further processing
    if (pedX < cullLeft || pedX > cullRight || pedY < cullTop || pedY > cullBottom) {
      continue;
    }

    // Get opacity for enter/exit animations
    const opacity = getPedestrianOpacity(ped);
    if (opacity <= 0) continue;

    // PERF: Store position data in typed array (3 floats per pedestrian)
    const baseIdx = visibleCount * 3;
    _pedPositions[baseIdx] = pedX;
    _pedPositions[baseIdx + 1] = pedY;
    _pedPositions[baseIdx + 2] = opacity;
    _pedIndices[visibleCount] = i;
    visibleCount++;
  }

  if (visibleCount === 0) return;

  // Pre-set common styles to reduce state changes
  ctx.lineCap = 'round';

  // PERF: Second pass - draw pedestrians with batched operations
  // Integer coordinates for crisp sub-pixel rendering
  for (let v = 0; v < visibleCount; v++) {
    const baseIdx = v * 3;
    // PERF: Use integer coordinates for crisp rendering (avoid sub-pixel blurring)
    const pedX = (_pedPositions[baseIdx] + 0.5) | 0;
    const pedY = (_pedPositions[baseIdx + 1] + 0.5) | 0;
    const opacity = _pedPositions[baseIdx + 2];
    const ped = visiblePedestrians[_pedIndices[v]];

    ctx.save();
    ctx.translate(pedX, pedY);
    if (opacity < 1) ctx.globalAlpha = opacity;

    // OPTIMIZED: Use simple LOD for zoomed out view
    if (useSimpleLOD) {
      drawSimplePedestrian(ctx, ped);
      ctx.restore();
      continue;
    }

    // Draw based on current activity/state
    // OPTIMIZED: Use medium detail for most activities when zoomed out
    if (useMediumLOD) {
      if (ped.state === 'at_recreation') {
        drawMediumActivityPedestrian(ctx, ped);
      } else {
        drawMediumWalkingPedestrian(ctx, ped);
      }
      ctx.restore();
      continue;
    }

    // Full detail drawing
    switch (ped.activity) {
      case 'playing_basketball':
        drawBasketballPlayer(ctx, ped);
        break;
      case 'playing_tennis':
        drawTennisPlayer(ctx, ped);
        break;
      case 'playing_soccer':
        drawSoccerPlayer(ctx, ped);
        break;
      case 'playing_baseball':
        drawBaseballPlayer(ctx, ped);
        break;
      case 'swimming':
        drawSwimmer(ctx, ped);
        break;
      case 'beach_swimming':
        drawBeachSwimmer(ctx, ped);
        break;
      case 'lying_on_mat':
        drawBeachMat(ctx, ped);
        break;
      case 'skateboarding':
        drawSkateboarder(ctx, ped);
        break;
      case 'sitting_bench':
        drawSittingPerson(ctx, ped);
        break;
      case 'picnicking':
        drawPicnicker(ctx, ped);
        break;
      case 'jogging':
        drawJogger(ctx, ped);
        break;
      case 'walking_dog':
        drawDogWalker(ctx, ped);
        break;
      case 'playground':
        drawPlaygroundKid(ctx, ped);
        break;
      case 'watching_game':
        drawSpectator(ctx, ped);
        break;
      default:
        // Default walking/standing pedestrian
        if (ped.state === 'socializing') {
          drawSocializingPerson(ctx, ped);
        } else if (ped.state === 'idle') {
          drawIdlePerson(ctx, ped);
        } else {
          drawWalkingPedestrian(ctx, ped);
        }
    }

    ctx.restore();
  }
}

/**
 * Draw a very simple pedestrian (lowest LOD) - just colored dots
 * PERF: Minimal draw calls, no stroke operations
 */
function drawSimplePedestrian(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  // Body as single filled circle
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.arc(0, -1.7, 2.1, 0, TWO_PI);
  ctx.fill();

  // Head as tiny dot
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, -4.3, 1.3, 0, TWO_PI);
  ctx.fill();
}

/**
 * Draw medium detail walking pedestrian
 * PERF: Combined path operations where possible
 */
function drawMediumWalkingPedestrian(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const walkBob = Math.sin(ped.walkOffset) * 0.5;
  const scale = 0.30;

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, (-12 + walkBob) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Body
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, (-5 + walkBob) * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Simple legs (single stroke with both legs in one path)
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 1.5 * scale;
  const legSwing = Math.sin(ped.walkOffset) * 2;
  const legY = (-1 + walkBob) * scale;
  const legEndY = 5 * scale;
  ctx.beginPath();
  ctx.moveTo(0, legY);
  ctx.lineTo(legSwing * scale, legEndY);
  ctx.moveTo(0, legY);
  ctx.lineTo(-legSwing * scale, legEndY);
  ctx.stroke();
}

/**
 * Draw medium detail activity pedestrian
 * PERF: Reduced path operations
 */
function drawMediumActivityPedestrian(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.30;
  const anim = Math.sin(ped.activityAnimTimer);

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, -12 * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Body
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(anim * scale, -5 * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Simple legs (combined path)
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, -1 * scale);
  ctx.lineTo(-1.5 * scale, 5 * scale);
  ctx.moveTo(1 * scale, -1 * scale);
  ctx.lineTo(1.5 * scale, 5 * scale);
  ctx.stroke();

  // Activity indicator (colored dot for ball, etc.)
  if (ped.hasBall) {
    ctx.fillStyle = '#ff6b35';
    ctx.beginPath();
    ctx.arc(4 * scale, 2 * scale, 1.5 * scale, 0, TWO_PI);
    ctx.fill();
  }
}

/**
 * Draw a standard walking pedestrian - OPTIMIZED
 * PERF: Combined path operations, reduced state changes
 */
function drawWalkingPedestrian(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const walkBob = Math.sin(ped.walkOffset) * 0.8;
  const walkSway = Math.sin(ped.walkOffset * 0.5) * 0.5;
  const scale = 0.30;
  const legSwing = Math.sin(ped.walkOffset) * 3;

  // Draw head and body first (filled shapes)
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(walkSway * scale, (-12 + walkBob) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Add hair for ~50% of pedestrians (based on ID)
  if ((ped.id & 1) === 0) {
    drawHair(ctx, walkSway * scale, (-12 + walkBob) * scale, 3 * scale, ped.id);
  }

  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(walkSway * scale, (-5 + walkBob) * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Draw both legs in one path
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 1.5 * scale;
  const legBaseY = (-1 + walkBob) * scale;
  const legEndY = (5 + walkBob) * scale;
  ctx.beginPath();
  ctx.moveTo(walkSway * scale, legBaseY);
  ctx.lineTo((walkSway - 1 + legSwing) * scale, legEndY);
  ctx.moveTo(walkSway * scale, legBaseY);
  ctx.lineTo((walkSway + 1 - legSwing) * scale, legEndY);
  ctx.stroke();

  // Draw both arms in one path
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.2 * scale;
  const armSwing = legSwing * 0.67;
  const armBaseY = (-6 + walkBob) * scale;
  const armEndY = (-2 + walkBob) * scale;
  ctx.beginPath();
  ctx.moveTo((walkSway - 2) * scale, armBaseY);
  ctx.lineTo((walkSway - 3 - armSwing) * scale, armEndY);
  ctx.moveTo((walkSway + 2) * scale, armBaseY);
  ctx.lineTo((walkSway + 3 + armSwing) * scale, armEndY);
  ctx.stroke();

  // Dog if walking one (simplified)
  if (ped.hasDog) {
    drawDogSimple(ctx, ped);
  }
}

/**
 * Draw a simplified dog for performance
 * PERF: Combined fill operations
 */
function drawDogSimple(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.26;
  const offsetX = 8;
  const offsetY = 3;

  // Dog as simple ellipse + head combined
  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.ellipse(offsetX * scale, (offsetY + 3) * scale, 4 * scale, 2 * scale, 0, 0, TWO_PI);
  ctx.arc((offsetX + 4) * scale, (offsetY + 1) * scale, 2 * scale, 0, TWO_PI);
  ctx.fill();

  // Leash
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 0.5 * scale;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, -2 * scale);
  ctx.lineTo(offsetX * scale, (offsetY + 2) * scale);
  ctx.stroke();
}

/**
 * Draw a basketball player
 * PERF: Combined stroke operations
 */
function drawBasketballPlayer(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.32;
  const bounce = Math.abs(Math.sin(ped.activityAnimTimer * 1.5)) * 2;
  const armMove = Math.sin(ped.activityAnimTimer * 3) * 4;

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, (-12 + bounce) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Jersey (bright color)
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, (-5 + bounce) * scale, 3 * scale, 4.5 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Shorts
  ctx.fillStyle = ped.pantsColor;
  ctx.fillRect(-2 * scale, (-1 + bounce) * scale, 4 * scale, 3 * scale);

  // Legs - athletic stance (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, (2 + bounce) * scale);
  ctx.lineTo(-2 * scale, (6 + bounce) * scale);
  ctx.moveTo(1 * scale, (2 + bounce) * scale);
  ctx.lineTo(2 * scale, (6 + bounce) * scale);
  ctx.stroke();

  // Arms - dribbling motion (combined path)
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, (-6 + bounce) * scale);
  ctx.lineTo((-3 + armMove * 0.3) * scale, (-1 + bounce) * scale);
  ctx.moveTo(2 * scale, (-6 + bounce) * scale);
  ctx.lineTo((4 + armMove * 0.3) * scale, (2 + Math.abs(armMove)) * scale);
  ctx.stroke();

  // Basketball
  ctx.fillStyle = '#ff6b35';
  ctx.beginPath();
  ctx.arc((4 + armMove * 0.3) * scale, (4 + Math.abs(armMove) + bounce) * scale, 2 * scale, 0, TWO_PI);
  ctx.fill();
  // Ball lines
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 0.3 * scale;
  ctx.beginPath();
  ctx.arc((4 + armMove * 0.3) * scale, (4 + Math.abs(armMove) + bounce) * scale, 2 * scale, 0, Math.PI);
  ctx.stroke();
}

/**
 * Draw a tennis player
 */
function drawTennisPlayer(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.31;
  const swing = Math.sin(ped.activityAnimTimer * 1) * 5;

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, -12 * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Visor
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, -14 * scale, 4 * scale, 1 * scale, 0, 0, Math.PI);
  ctx.fill();

  // Polo shirt
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, -5 * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Tennis skirt/shorts
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-2.5 * scale, -1 * scale, 5 * scale, 2.5 * scale);

  // Legs (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, 1.5 * scale);
  ctx.lineTo(-1.5 * scale, 6 * scale);
  ctx.moveTo(1 * scale, 1.5 * scale);
  ctx.lineTo(2 * scale, 6 * scale);
  ctx.stroke();

  // Arms with racket (combined path)
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  // Back arm
  ctx.moveTo(-2 * scale, -6 * scale);
  ctx.lineTo(-3 * scale, -2 * scale);
  // Racket arm
  ctx.moveTo(2 * scale, -6 * scale);
  ctx.lineTo((4 + swing * 0.5) * scale, (-8 + Math.abs(swing) * 0.3) * scale);
  ctx.stroke();

  // Tennis racket
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 0.8 * scale;
  ctx.beginPath();
  ctx.moveTo((4 + swing * 0.5) * scale, (-8 + Math.abs(swing) * 0.3) * scale);
  ctx.lineTo((7 + swing) * scale, (-12 + Math.abs(swing) * 0.5) * scale);
  ctx.stroke();
  // Racket head
  ctx.strokeStyle = '#228B22';
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.ellipse((8 + swing) * scale, (-14 + Math.abs(swing) * 0.5) * scale, 2.5 * scale, 3 * scale, swing * 0.1, 0, TWO_PI);
  ctx.stroke();
}

/**
 * Draw a soccer player
 */
function drawSoccerPlayer(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.31;
  const kick = Math.sin(ped.activityAnimTimer * 2) * 4;
  const run = Math.abs(Math.sin(ped.activityAnimTimer * 2.5));

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, (-12 + run) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Jersey
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, (-5 + run) * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Shorts
  ctx.fillStyle = ped.pantsColor;
  ctx.fillRect(-2 * scale, (-1 + run) * scale, 4 * scale, 2.5 * scale);

  // Legs - kicking motion (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, (1.5 + run) * scale);
  ctx.lineTo((-1.5 - kick * 0.2) * scale, (6 + run) * scale);
  // Kicking leg
  ctx.moveTo(1 * scale, (1.5 + run) * scale);
  ctx.lineTo((2 + kick) * scale, (4 + run - Math.abs(kick) * 0.3) * scale);
  ctx.stroke();

  // Soccer ball
  if (Math.abs(kick) > 2) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc((4 + kick * 1.5) * scale, (3 + run) * scale, 1.5 * scale, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.3 * scale;
    ctx.stroke();
  }

  // Arms running motion (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, (-6 + run) * scale);
  ctx.lineTo((-3 - kick * 0.2) * scale, (-2 + run) * scale);
  ctx.moveTo(2 * scale, (-6 + run) * scale);
  ctx.lineTo((3 + kick * 0.2) * scale, (-2 + run) * scale);
  ctx.stroke();
}

/**
 * Draw a baseball player
 */
function drawBaseballPlayer(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.31;
  const swing = Math.sin(ped.activityAnimTimer * 1) * 6;

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, -12 * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Baseball cap
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.arc(0, -13 * scale, 3.5 * scale, Math.PI, 0);
  ctx.fill();
  // Cap bill
  ctx.fillRect(-4 * scale, -13 * scale, 4 * scale, 1 * scale);

  // Uniform
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, -5 * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Pants
  ctx.fillStyle = ped.pantsColor;
  ctx.fillRect(-2 * scale, -1 * scale, 4 * scale, 4 * scale);

  // Legs (combined path)
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, 3 * scale);
  ctx.lineTo(-1.5 * scale, 7 * scale);
  ctx.moveTo(1 * scale, 3 * scale);
  ctx.lineTo(1.5 * scale, 7 * scale);
  ctx.stroke();

  // Arms and bat (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, -6 * scale);
  ctx.lineTo((-1 + swing * 0.3) * scale, (-9) * scale);
  ctx.moveTo(2 * scale, -6 * scale);
  ctx.lineTo((1 + swing * 0.5) * scale, (-9) * scale);
  ctx.stroke();

  // Bat
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo((swing * 0.4) * scale, -9 * scale);
  ctx.lineTo((swing * 1.2) * scale, -16 * scale);
  ctx.stroke();
}

/**
 * Draw a swimmer
 */
function drawSwimmer(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.22; // Smaller scale for pool swimmers
  const swim = Math.sin(ped.activityAnimTimer * 2);
  const bob = Math.sin(ped.activityAnimTimer * 1) * 1.5;

  // Water effect around swimmer
  ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2 * scale, 8 * scale, 3 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Head poking out of water
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, (-3 + bob) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Swim cap
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.arc(0, (-4 + bob) * scale, 3 * scale, Math.PI, 0);
  ctx.fill();

  // Goggles
  ctx.fillStyle = '#333333';
  ctx.fillRect(-3 * scale, (-3 + bob) * scale, 6 * scale, 1 * scale);

  // Arms doing stroke (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  // Left arm
  ctx.moveTo(-2 * scale, (0 + bob) * scale);
  ctx.lineTo((-5 + swim * 3) * scale, (-2 + swim * 2) * scale);
  // Right arm
  ctx.moveTo(2 * scale, (0 + bob) * scale);
  ctx.lineTo((5 - swim * 3) * scale, (-2 - swim * 2) * scale);
  ctx.stroke();

  // Splash effect
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  const splashSize = Math.abs(swim) * 2;
  ctx.beginPath();
  ctx.arc((-5 + swim * 3) * scale, 0, splashSize * scale, 0, TWO_PI);
  ctx.fill();
}

/**
 * Draw a skateboarder
 */
function drawSkateboarder(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.23; // Smaller scale for skate park
  const ride = Math.sin(ped.activityAnimTimer * 1.5);
  const bob = Math.abs(ride) * 1.5;

  // Skateboard
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(-5 * scale, (5 + bob) * scale, 10 * scale, 1.5 * scale);
  // Wheels (combined)
  ctx.fillStyle = '#333333';
  ctx.beginPath();
  ctx.arc(-3 * scale, (7 + bob) * scale, 1 * scale, 0, TWO_PI);
  ctx.arc(3 * scale, (7 + bob) * scale, 1 * scale, 0, TWO_PI);
  ctx.fill();

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(ride * scale, (-10 + bob) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Helmet
  ctx.fillStyle = '#333333';
  ctx.beginPath();
  ctx.arc(ride * scale, (-11 + bob) * scale, 3.5 * scale, Math.PI, 0);
  ctx.fill();

  // Body - crouched
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(ride * scale, (-4 + bob) * scale, 2.5 * scale, 3.5 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Bent legs (combined path)
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo((-1 + ride) * scale, (0 + bob) * scale);
  ctx.quadraticCurveTo((-3 + ride) * scale, (3 + bob) * scale, (-2 + ride) * scale, (5 + bob) * scale);
  ctx.moveTo((1 + ride) * scale, (0 + bob) * scale);
  ctx.quadraticCurveTo((3 + ride) * scale, (3 + bob) * scale, (2 + ride) * scale, (5 + bob) * scale);
  ctx.stroke();

  // Arms out for balance (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo((-2 + ride) * scale, (-5 + bob) * scale);
  ctx.lineTo((-6 - ride) * scale, (-3 + bob) * scale);
  ctx.moveTo((2 + ride) * scale, (-5 + bob) * scale);
  ctx.lineTo((6 + ride) * scale, (-3 + bob) * scale);
  ctx.stroke();
}

/**
 * Draw a person sitting on a bench
 */
function drawSittingPerson(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.22; // Smaller scale to fit better on bench
  const breathe = Math.sin(ped.activityAnimTimer * 0.5) * 0.3;

  // Bench
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(-6 * scale, 2 * scale, 12 * scale, 2 * scale);
  // Bench legs
  ctx.fillRect(-5 * scale, 4 * scale, 1.5 * scale, 3 * scale);
  ctx.fillRect(3.5 * scale, 4 * scale, 1.5 * scale, 3 * scale);

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, (-8 + breathe) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Hair for variety
  if ((ped.id & 1) === 0) {
    drawHair(ctx, 0, (-8 + breathe) * scale, 3 * scale, ped.id);
  }

  // Hat if has one
  if (ped.hasHat) {
    ctx.fillStyle = ped.hatColor;
    ctx.beginPath();
    ctx.ellipse(0, (-11 + breathe) * scale, 4 * scale, 1.5 * scale, 0, 0, TWO_PI);
    ctx.fill();
  }

  // Body - seated
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, (-2 + breathe) * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Legs - bent at 90 degrees
  ctx.fillStyle = ped.pantsColor;
  // Thighs (horizontal)
  ctx.fillRect(-2 * scale, 1 * scale, 4 * scale, 2 * scale);
  // Lower legs (hanging down) - combined path
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, 3 * scale);
  ctx.lineTo(-1 * scale, 7 * scale);
  ctx.moveTo(1 * scale, 3 * scale);
  ctx.lineTo(1 * scale, 7 * scale);
  ctx.stroke();

  // Arms resting (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, (-3 + breathe) * scale);
  ctx.lineTo(-4 * scale, 1 * scale);
  ctx.moveTo(2 * scale, (-3 + breathe) * scale);
  ctx.lineTo(4 * scale, 1 * scale);
  ctx.stroke();
}

/**
 * Draw someone having a picnic
 */
// Muted pastel blanket colors
const BLANKET_COLORS = [
  { main: '#d4a5a5', accent: '#f5e6e6' },  // Dusty rose
  { main: '#a5c4d4', accent: '#e6f0f5' },  // Soft blue
  { main: '#b5d4a5', accent: '#e6f5e6' },  // Sage green
  { main: '#d4cfa5', accent: '#f5f3e6' },  // Muted yellow
  { main: '#c4a5d4', accent: '#f0e6f5' },  // Lavender
  { main: '#d4b5a5', accent: '#f5ece6' },  // Warm beige
];

function drawPicnicker(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.22; // Smaller scale for park activities

  // Picnic blanket - muted pastel colors based on pedestrian ID
  const blanketColor = BLANKET_COLORS[ped.id % BLANKET_COLORS.length];
  ctx.fillStyle = blanketColor.main;
  ctx.fillRect(-8 * scale, 0, 16 * scale, 8 * scale);
  // Blanket pattern
  ctx.fillStyle = blanketColor.accent;
  ctx.fillRect(-6 * scale, 2 * scale, 4 * scale, 4 * scale);
  ctx.fillRect(2 * scale, 2 * scale, 4 * scale, 4 * scale);

  // Person sitting cross-legged
  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, -8 * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Add hair for ~50% of pedestrians
  if ((ped.id & 1) === 0) {
    drawHair(ctx, 0, -8 * scale, 3 * scale, ped.id);
  }

  // Body
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, -2 * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Crossed legs (combined path)
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, 2 * scale);
  ctx.lineTo(2 * scale, 5 * scale);
  ctx.moveTo(1 * scale, 2 * scale);
  ctx.lineTo(-2 * scale, 5 * scale);
  ctx.stroke();

  // Picnic basket
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(5 * scale, 1 * scale, 4 * scale, 3 * scale);
}

/**
 * Draw a jogger
 */
function drawJogger(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.20; // Small scale for park joggers
  const run = ped.walkOffset;
  const bounce = Math.abs(Math.sin(run * 2)) * 2;

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, (-12 + bounce) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Add hair for ~50% of pedestrians (ponytail bouncing)
  if ((ped.id & 1) === 0) {
    drawHair(ctx, 0, (-12 + bounce) * scale, 3 * scale, ped.id);
  }

  // Headband
  ctx.fillStyle = ped.shirtColor;
  ctx.fillRect(-3 * scale, (-13 + bounce) * scale, 6 * scale, 1.5 * scale);

  // Athletic top
  ctx.beginPath();
  ctx.ellipse(0, (-5 + bounce) * scale, 2.3 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Running shorts
  ctx.fillStyle = ped.pantsColor;
  ctx.fillRect(-2 * scale, (-1 + bounce) * scale, 4 * scale, 2 * scale);

  // Legs - running stride (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.5 * scale;
  const leftLeg = Math.sin(run) * 5;
  const rightLeg = Math.sin(run + Math.PI) * 5;
  ctx.beginPath();
  ctx.moveTo(0, (1 + bounce) * scale);
  ctx.lineTo(leftLeg * scale, (6 + bounce) * scale);
  ctx.moveTo(0, (1 + bounce) * scale);
  ctx.lineTo(rightLeg * scale, (6 + bounce) * scale);
  ctx.stroke();

  // Arms - pumping motion (combined path)
  ctx.lineWidth = 1.2 * scale;
  const leftArm = Math.sin(run + Math.PI) * 3;
  const rightArm = Math.sin(run) * 3;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, (-6 + bounce) * scale);
  ctx.lineTo((-3 + leftArm) * scale, (-2 + bounce) * scale);
  ctx.moveTo(2 * scale, (-6 + bounce) * scale);
  ctx.lineTo((3 + rightArm) * scale, (-2 + bounce) * scale);
  ctx.stroke();
}

/**
 * Draw a dog walker - just uses the regular walking function which handles dogs
 */
function drawDogWalker(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  drawWalkingPedestrian(ctx, ped);
}

/**
 * Draw a kid on playground
 */
function drawPlaygroundKid(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.20; // Small - it's a kid on playground
  const swing = Math.sin(ped.activityAnimTimer * 1.5) * 8;
  const sway = Math.cos(ped.activityAnimTimer * 1.5) * 3;

  // Swing set hint (combined path)
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, -20 * scale);
  ctx.lineTo((-2 + sway) * scale, (-8 + Math.abs(swing) * 0.2) * scale);
  ctx.moveTo(2 * scale, -20 * scale);
  ctx.lineTo((2 + sway) * scale, (-8 + Math.abs(swing) * 0.2) * scale);
  ctx.stroke();

  // Kid's head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(sway * scale, (-10 + Math.abs(swing) * 0.2) * scale, 2.5 * scale, 0, TWO_PI);
  ctx.fill();

  // Body
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(sway * scale, (-4 + Math.abs(swing) * 0.1) * scale, 2 * scale, 3 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Legs - kicking while swinging (combined path)
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(sway * scale, (-1 + Math.abs(swing) * 0.1) * scale);
  ctx.lineTo((sway + swing * 0.3) * scale, (4) * scale);
  ctx.moveTo(sway * scale, (-1 + Math.abs(swing) * 0.1) * scale);
  ctx.lineTo((sway + swing * 0.2) * scale, (4) * scale);
  ctx.stroke();

  // Arms holding ropes (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo((sway - 1.5) * scale, (-5 + Math.abs(swing) * 0.15) * scale);
  ctx.lineTo((-2 + sway) * scale, (-8 + Math.abs(swing) * 0.2) * scale);
  ctx.moveTo((sway + 1.5) * scale, (-5 + Math.abs(swing) * 0.15) * scale);
  ctx.lineTo((2 + sway) * scale, (-8 + Math.abs(swing) * 0.2) * scale);
  ctx.stroke();
}

/**
 * Draw a spectator watching a game
 */
function drawSpectator(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.22; // Smaller scale for park/stadium spectators
  const cheer = Math.sin(ped.activityAnimTimer * 2);
  const cheerUp = cheer > 0.7;

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, (-12 + (cheerUp ? -1 : 0)) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Add hair for ~50% of pedestrians (instead of cap)
  if ((ped.id & 1) === 0) {
    drawHair(ctx, 0, (-12 + (cheerUp ? -1 : 0)) * scale, 3 * scale, ped.id);
  } else {
    // Team cap/hat for others
    ctx.fillStyle = ped.shirtColor;
    ctx.beginPath();
    ctx.arc(0, (-13 + (cheerUp ? -1 : 0)) * scale, 3.5 * scale, Math.PI, 0);
    ctx.fill();
  }

  // Body
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, -5 * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Pants
  ctx.fillStyle = ped.pantsColor;
  ctx.fillRect(-2 * scale, -1 * scale, 4 * scale, 3 * scale);

  // Legs (combined path)
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, 2 * scale);
  ctx.lineTo(-1.5 * scale, 7 * scale);
  ctx.moveTo(1 * scale, 2 * scale);
  ctx.lineTo(1.5 * scale, 7 * scale);
  ctx.stroke();

  // Arms - raised when cheering (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  if (cheerUp) {
    // Arms up!
    ctx.moveTo(-2 * scale, -6 * scale);
    ctx.lineTo(-4 * scale, -14 * scale);
    ctx.moveTo(2 * scale, -6 * scale);
    ctx.lineTo(4 * scale, -14 * scale);
  } else {
    // Arms at sides
    ctx.moveTo(-2 * scale, -6 * scale);
    ctx.lineTo(-3 * scale, -1 * scale);
    ctx.moveTo(2 * scale, -6 * scale);
    ctx.lineTo(3 * scale, -1 * scale);
  }
  ctx.stroke();
}

/**
 * Draw a socializing person (facing another person)
 */
function drawSocializingPerson(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.30;
  const gesture = Math.sin(ped.activityAnimTimer * 1) * 2;

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, -12 * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Add hair for ~50% of pedestrians
  if ((ped.id & 1) === 0) {
    drawHair(ctx, 0, -12 * scale, 3 * scale, ped.id);
  }

  // Body
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, -5 * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Legs (standing) - combined path
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, -1 * scale);
  ctx.lineTo(-1.5 * scale, 5 * scale);
  ctx.moveTo(1 * scale, -1 * scale);
  ctx.lineTo(1.5 * scale, 5 * scale);
  ctx.stroke();

  // Arms - gesturing while talking (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, -6 * scale);
  ctx.lineTo((-4 + gesture) * scale, (-4 + Math.abs(gesture) * 0.5) * scale);
  ctx.moveTo(2 * scale, -6 * scale);
  ctx.lineTo((4 - gesture) * scale, (-4 + Math.abs(gesture) * 0.5) * scale);
  ctx.stroke();

  // Speech indicator (small dots) - combined path
  if (Math.sin(ped.activityAnimTimer * 2.5) > 0) {
    ctx.fillStyle = '#666666';
    ctx.beginPath();
    ctx.arc(5 * scale, -14 * scale, 0.8 * scale, 0, TWO_PI);
    ctx.arc(7 * scale, -15 * scale, 0.6 * scale, 0, TWO_PI);
    ctx.arc(8.5 * scale, -15.5 * scale, 0.4 * scale, 0, TWO_PI);
    ctx.fill();
  }
}

/**
 * Draw an idle person
 */
function drawIdlePerson(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.30;
  const breathe = Math.sin(ped.activityAnimTimer * 0.5) * 0.3;

  // Head
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(0, (-12 + breathe) * scale, 3 * scale, 0, TWO_PI);
  ctx.fill();

  // Add hair for ~50% of pedestrians
  if ((ped.id & 1) === 0 && !ped.hasHat) {
    drawHair(ctx, 0, (-12 + breathe) * scale, 3 * scale, ped.id);
  }

  // Hat if has one
  if (ped.hasHat) {
    ctx.fillStyle = ped.hatColor;
    ctx.beginPath();
    ctx.ellipse(0, (-15 + breathe) * scale, 4 * scale, 1.5 * scale, 0, 0, TWO_PI);
    ctx.fill();
  }

  // Body
  ctx.fillStyle = ped.shirtColor;
  ctx.beginPath();
  ctx.ellipse(0, (-5 + breathe) * scale, 2.5 * scale, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Legs (standing) - combined path
  ctx.strokeStyle = ped.pantsColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(-1 * scale, (-1 + breathe) * scale);
  ctx.lineTo(-1 * scale, (5 + breathe) * scale);
  ctx.moveTo(1 * scale, (-1 + breathe) * scale);
  ctx.lineTo(1 * scale, (5 + breathe) * scale);
  ctx.stroke();

  // Arms at rest (combined path)
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, (-6 + breathe) * scale);
  ctx.lineTo(-2.5 * scale, (-1 + breathe) * scale);
  ctx.moveTo(2 * scale, (-6 + breathe) * scale);
  ctx.lineTo(2.5 * scale, (-1 + breathe) * scale);
  ctx.stroke();

  // Bag if carrying
  if (ped.hasBag) {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(3 * scale, (-4 + breathe) * scale, 2 * scale, 3 * scale);
  }
}

// ============================================================================
// Beach Activity Drawing Functions
// ============================================================================

/**
 * Draw a beach swimmer (person swimming in open water near shore)
 * Different from pool swimmer - more realistic ocean swimming
 */
function drawBeachSwimmer(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.24;
  const swim = Math.sin(ped.activityAnimTimer * 1.8);
  const bob = Math.sin(ped.activityAnimTimer * 1.2) * 1.5;
  const wave = Math.sin(ped.activityAnimTimer * 0.8) * 0.5;

  // Water ripples around swimmer
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 2 * scale, 10 * scale + Math.abs(swim) * 2, 4 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Darker water effect
  ctx.fillStyle = 'rgba(30, 100, 180, 0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 1 * scale, 9 * scale, 3.5 * scale, 0, 0, TWO_PI);
  ctx.fill();

  // Head bobbing in water
  ctx.fillStyle = ped.skinColor;
  ctx.beginPath();
  ctx.arc(wave * scale, (-2 + bob) * scale, 3.2 * scale, 0, TWO_PI);
  ctx.fill();

  // Wet hair
  const hairColor = HAIR_COLORS[ped.id % HAIR_COLORS.length];
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.arc(wave * scale, (-3.5 + bob) * scale, 3 * scale, Math.PI, 0);
  ctx.fill();

  // Swimming arms - freestyle stroke motion
  ctx.strokeStyle = ped.skinColor;
  ctx.lineWidth = 2 * scale;

  // Left arm
  const leftArmPhase = ped.activityAnimTimer * 1.8;
  const leftArmUp = Math.sin(leftArmPhase) > 0;
  if (leftArmUp) {
    // Arm coming out of water
    ctx.beginPath();
    ctx.moveTo((-3 + wave) * scale, (0 + bob) * scale);
    ctx.quadraticCurveTo(
      (-6 + Math.sin(leftArmPhase) * 4) * scale,
      (-3 + Math.cos(leftArmPhase) * 2 + bob) * scale,
      (-8 + Math.sin(leftArmPhase) * 2) * scale,
      (1 + bob) * scale
    );
    ctx.stroke();
  }

  // Right arm (offset phase)
  const rightArmPhase = ped.activityAnimTimer * 1.8 + Math.PI;
  const rightArmUp = Math.sin(rightArmPhase) > 0;
  if (rightArmUp) {
    ctx.beginPath();
    ctx.moveTo((3 + wave) * scale, (0 + bob) * scale);
    ctx.quadraticCurveTo(
      (6 + Math.sin(rightArmPhase) * 4) * scale,
      (-3 + Math.cos(rightArmPhase) * 2 + bob) * scale,
      (8 + Math.sin(rightArmPhase) * 2) * scale,
      (1 + bob) * scale
    );
    ctx.stroke();
  }

  // Splash effects when arm enters water
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  if (Math.sin(leftArmPhase) < -0.8) {
    ctx.beginPath();
    ctx.arc((-7 + wave) * scale, (1 + bob) * scale, 2 * scale, 0, TWO_PI);
    ctx.fill();
  }
  if (Math.sin(rightArmPhase) < -0.8) {
    ctx.beginPath();
    ctx.arc((7 + wave) * scale, (1 + bob) * scale, 2 * scale, 0, TWO_PI);
    ctx.fill();
  }

  // Kick splash behind
  const kickSplash = Math.abs(Math.sin(ped.activityAnimTimer * 3.5)) * 0.4;
  if (kickSplash > 0.2) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 6 * scale, 4 * scale, 2 * scale, 0, 0, TWO_PI);
    ctx.fill();
  }
}

/**
 * Draw a person lying on a beach mat/towel
 */
function drawBeachMat(ctx: CanvasRenderingContext2D, ped: Pedestrian): void {
  const scale = 0.22;
  const breathe = Math.sin(ped.activityAnimTimer * 0.3) * 0.3;

  // Determine mat orientation based on beach edge
  // The mat should be parallel to the water's edge
  let matAngle = 0;
  switch (ped.beachEdge) {
    case 'north':
      matAngle = Math.PI / 4; // 45 degrees
      break;
    case 'east':
      matAngle = -Math.PI / 4;
      break;
    case 'south':
      matAngle = Math.PI / 4;
      break;
    case 'west':
      matAngle = -Math.PI / 4;
      break;
  }

  ctx.save();
  ctx.rotate(matAngle);

  // Beach mat/towel - colorful striped design
  const matWidth = 20 * scale;
  const matHeight = 10 * scale;

  // Mat shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.ellipse(1 * scale, 2 * scale, matWidth * 0.55, matHeight * 0.55, 0, 0, TWO_PI);
  ctx.fill();

  // Main mat color
  ctx.fillStyle = ped.matColor;
  ctx.fillRect(-matWidth / 2, -matHeight / 2, matWidth, matHeight);

  // Stripes on mat
  const stripeColor = adjustColorBrightness(ped.matColor, -30);
  ctx.fillStyle = stripeColor;
  ctx.fillRect(-matWidth / 2, -matHeight / 2 + matHeight * 0.2, matWidth, matHeight * 0.15);
  ctx.fillRect(-matWidth / 2, -matHeight / 2 + matHeight * 0.55, matWidth, matHeight * 0.15);
  ctx.fillRect(-matWidth / 2, -matHeight / 2 + matHeight * 0.85, matWidth, matHeight * 0.15);

  // Mat border/fringe
  ctx.strokeStyle = adjustColorBrightness(ped.matColor, -50);
  ctx.lineWidth = 0.5 * scale;
  ctx.strokeRect(-matWidth / 2, -matHeight / 2, matWidth, matHeight);

  // Person lying face down or on back (random based on ID)
  const faceDown = (ped.id & 1) === 0;

  if (faceDown) {
    // Lying face down - sunbathing
    // Body (torso) - horizontal
    ctx.fillStyle = ped.shirtColor;
    ctx.beginPath();
    ctx.ellipse(0, breathe * scale, 3 * scale, 5 * scale, Math.PI / 2, 0, TWO_PI);
    ctx.fill();

    // Head
    ctx.fillStyle = ped.skinColor;
    ctx.beginPath();
    ctx.arc(-6 * scale, breathe * scale, 2.5 * scale, 0, TWO_PI);
    ctx.fill();

    // Hair on back of head
    const hairColor = HAIR_COLORS[ped.id % HAIR_COLORS.length];
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(-6 * scale, breathe * scale, 2.5 * scale, Math.PI * 0.3, Math.PI * 1.7);
    ctx.fill();

    // Arms stretched out or by sides (combined path)
    ctx.strokeStyle = ped.skinColor;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(-2 * scale, (breathe - 2) * scale);
    ctx.lineTo(-8 * scale, (breathe - 3) * scale);
    ctx.moveTo(-2 * scale, (breathe + 2) * scale);
    ctx.lineTo(-8 * scale, (breathe + 3) * scale);
    ctx.stroke();

    // Legs
    ctx.fillStyle = ped.pantsColor;
    ctx.beginPath();
    ctx.ellipse(5 * scale, breathe * scale, 2 * scale, 3 * scale, Math.PI / 2, 0, TWO_PI);
    ctx.fill();

    // Feet (combined)
    ctx.fillStyle = ped.skinColor;
    ctx.beginPath();
    ctx.arc(8 * scale, (breathe - 1) * scale, 1 * scale, 0, TWO_PI);
    ctx.arc(8 * scale, (breathe + 1) * scale, 1 * scale, 0, TWO_PI);
    ctx.fill();
  } else {
    // Lying on back - relaxing
    // Body (torso) - horizontal
    ctx.fillStyle = ped.shirtColor;
    ctx.beginPath();
    ctx.ellipse(0, breathe * scale, 3 * scale, 5 * scale, Math.PI / 2, 0, TWO_PI);
    ctx.fill();

    // Head
    ctx.fillStyle = ped.skinColor;
    ctx.beginPath();
    ctx.arc(-6 * scale, breathe * scale, 2.5 * scale, 0, TWO_PI);
    ctx.fill();

    // Face details (simple) - eyes closed
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5 * scale;
    ctx.beginPath();
    ctx.moveTo(-7 * scale, (breathe - 0.5) * scale);
    ctx.lineTo(-6.5 * scale, (breathe - 0.5) * scale);
    ctx.moveTo(-5.5 * scale, (breathe - 0.5) * scale);
    ctx.lineTo(-5 * scale, (breathe - 0.5) * scale);
    ctx.stroke();

    // Arms by sides (combined path)
    ctx.strokeStyle = ped.skinColor;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(-2 * scale, (breathe - 2.5) * scale);
    ctx.lineTo(3 * scale, (breathe - 4) * scale);
    ctx.moveTo(-2 * scale, (breathe + 2.5) * scale);
    ctx.lineTo(3 * scale, (breathe + 4) * scale);
    ctx.stroke();

    // Legs
    ctx.fillStyle = ped.pantsColor;
    ctx.beginPath();
    ctx.ellipse(5 * scale, breathe * scale, 2 * scale, 3 * scale, Math.PI / 2, 0, TWO_PI);
    ctx.fill();

    // Feet (combined)
    ctx.fillStyle = ped.skinColor;
    ctx.beginPath();
    ctx.arc(8 * scale, (breathe - 1.5) * scale, 1 * scale, 0, TWO_PI);
    ctx.arc(8 * scale, (breathe + 1.5) * scale, 1 * scale, 0, TWO_PI);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Adjust color brightness
 * PERF: Inlined bit operations
 */
function adjustColorBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
