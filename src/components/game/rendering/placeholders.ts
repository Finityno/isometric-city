// ============================================================================
// PLACEHOLDER BUILDING COLORS - OPTIMIZED
// ============================================================================
// Colors for rendering buildings before sprites are loaded
// Uses off-screen canvas caching for maximum performance

export interface PlaceholderColor {
  top: string;
  left: string;
  right: string;
  height: number;
}

// Pre-defined colors as a frozen object to prevent mutation
const PLACEHOLDER_COLORS: Readonly<Record<string, PlaceholderColor>> = Object.freeze({
  // Residential - greens
  house_small: { top: '#4ade80', left: '#22c55e', right: '#86efac', height: 0.6 },
  house_medium: { top: '#4ade80', left: '#22c55e', right: '#86efac', height: 0.8 },
  mansion: { top: '#22c55e', left: '#16a34a', right: '#4ade80', height: 1.0 },
  apartment_low: { top: '#22c55e', left: '#16a34a', right: '#4ade80', height: 1.2 },
  apartment_high: { top: '#16a34a', left: '#15803d', right: '#22c55e', height: 1.8 },
  // Commercial - blues
  shop_small: { top: '#60a5fa', left: '#3b82f6', right: '#93c5fd', height: 0.5 },
  shop_medium: { top: '#60a5fa', left: '#3b82f6', right: '#93c5fd', height: 0.7 },
  office_low: { top: '#3b82f6', left: '#2563eb', right: '#60a5fa', height: 1.3 },
  office_high: { top: '#2563eb', left: '#1d4ed8', right: '#3b82f6', height: 2.0 },
  mall: { top: '#1d4ed8', left: '#1e40af', right: '#2563eb', height: 1.0 },
  // Industrial - oranges/ambers
  factory_small: { top: '#fbbf24', left: '#f59e0b', right: '#fcd34d', height: 0.6 },
  factory_medium: { top: '#f59e0b', left: '#d97706', right: '#fbbf24', height: 0.9 },
  factory_large: { top: '#d97706', left: '#b45309', right: '#f59e0b', height: 1.2 },
  warehouse: { top: '#fbbf24', left: '#f59e0b', right: '#fcd34d', height: 0.7 },
  // Services - purples/pinks
  police_station: { top: '#818cf8', left: '#6366f1', right: '#a5b4fc', height: 0.8 },
  fire_station: { top: '#f87171', left: '#ef4444', right: '#fca5a5', height: 0.8 },
  hospital: { top: '#f472b6', left: '#ec4899', right: '#f9a8d4', height: 1.2 },
  school: { top: '#c084fc', left: '#a855f7', right: '#d8b4fe', height: 0.8 },
  university: { top: '#a855f7', left: '#9333ea', right: '#c084fc', height: 1.0 },
  // Parks - teals
  park: { top: '#2dd4bf', left: '#14b8a6', right: '#5eead4', height: 0.2 },
  park_large: { top: '#14b8a6', left: '#0d9488', right: '#2dd4bf', height: 0.3 },
  tennis: { top: '#5eead4', left: '#2dd4bf', right: '#99f6e4', height: 0.2 },
  tree: { top: '#22c55e', left: '#16a34a', right: '#4ade80', height: 0.5 },
  // Utilities - grays
  power_plant: { top: '#9ca3af', left: '#6b7280', right: '#d1d5db', height: 1.0 },
  water_tower: { top: '#60a5fa', left: '#3b82f6', right: '#93c5fd', height: 1.4 },
  subway_station: { top: '#6b7280', left: '#4b5563', right: '#9ca3af', height: 0.5 },
  // Special - golds
  stadium: { top: '#fbbf24', left: '#f59e0b', right: '#fcd34d', height: 0.8 },
  museum: { top: '#e879f9', left: '#d946ef', right: '#f0abfc', height: 0.9 },
  airport: { top: '#9ca3af', left: '#6b7280', right: '#d1d5db', height: 0.4 },
  space_program: { top: '#f1f5f9', left: '#e2e8f0', right: '#f8fafc', height: 1.5 },
  city_hall: { top: '#fbbf24', left: '#f59e0b', right: '#fcd34d', height: 1.2 },
  amusement_park: { top: '#fb7185', left: '#f43f5e', right: '#fda4af', height: 0.8 },
  // Default for unknown/park buildings
  default: { top: '#9ca3af', left: '#6b7280', right: '#d1d5db', height: 0.6 },
});

// Export for external use if needed
export { PLACEHOLDER_COLORS };

// ============================================================================
// OFF-SCREEN CANVAS CACHE
// ============================================================================
// Cache placeholder graphics as ImageBitmap for fastest possible rendering
// Key format: "buildingType_tileWidth_tileHeight"

interface CachedPlaceholder {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  offsetY: number; // How much to offset Y when drawing (accounts for height above baseline)
}

const placeholderCache = new Map<string, CachedPlaceholder>();

// Reusable Path2D objects for each face type (avoids creating paths every frame)
// These are templates that get drawn with transforms
let pathsInitialized = false;
let leftFacePath: Path2D;
let rightFacePath: Path2D;
let topFacePath: Path2D;

function initPaths(): void {
  if (pathsInitialized) return;

  // Unit-sized paths (will be scaled during rendering)
  // Left face: from (0, 0.5) to (0.5, 1) to (0.5, 0) to (0, -0.5) - relative to tile
  leftFacePath = new Path2D();
  rightFacePath = new Path2D();
  topFacePath = new Path2D();

  pathsInitialized = true;
}

/**
 * Generate cache key for placeholder lookup
 */
function getCacheKey(buildingType: string, tileWidth: number, tileHeight: number): string {
  return `${buildingType}_${tileWidth}_${tileHeight}`;
}

/**
 * Create an off-screen cached placeholder for a building type at specific tile dimensions
 */
function createCachedPlaceholder(
  buildingType: string,
  tileWidth: number,
  tileHeight: number
): CachedPlaceholder {
  const colors = PLACEHOLDER_COLORS[buildingType] ?? PLACEHOLDER_COLORS.default;
  const boxHeight = tileHeight * colors.height;

  // Pre-calculate all coordinates once
  const w = tileWidth;
  const h = tileHeight;
  const halfW = w * 0.5;
  const halfH = h * 0.5;

  // Canvas needs to fit the full isometric box including height
  // Add padding for the box height above the base
  const canvasWidth = w + 2;  // +2 for anti-aliasing margin
  const canvasHeight = h + boxHeight + 2;
  const offsetY = boxHeight; // Y offset from top of canvas to baseline

  // Create off-screen canvas (use OffscreenCanvas if available for better performance)
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(canvasWidth, canvasHeight)
    : document.createElement('canvas');

  if (!(canvas instanceof OffscreenCanvas)) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!ctx) {
    throw new Error('Failed to get 2D context for placeholder cache');
  }

  // Drawing origin: center-x at halfW+1, baseline-y at offsetY+1
  const ox = halfW + 1; // center x with 1px margin
  const baseY = offsetY + 1; // baseline y with 1px margin
  const topY = 1; // top of box with 1px margin

  // Draw left face (darker) - single path, no closePath needed with fill
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(ox - halfW, baseY + halfH);
  ctx.lineTo(ox, baseY + h);
  ctx.lineTo(ox, topY + h);
  ctx.lineTo(ox - halfW, topY + halfH);
  ctx.fill();

  // Draw right face (lighter)
  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(ox + halfW, baseY + halfH);
  ctx.lineTo(ox, baseY + h);
  ctx.lineTo(ox, topY + h);
  ctx.lineTo(ox + halfW, topY + halfH);
  ctx.fill();

  // Draw top face
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(ox, topY);
  ctx.lineTo(ox + halfW, topY + halfH);
  ctx.lineTo(ox, topY + h);
  ctx.lineTo(ox - halfW, topY + halfH);
  ctx.fill();

  // Add subtle edge lines on top face only (most visible)
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(ox, topY);
  ctx.lineTo(ox + halfW, topY + halfH);
  ctx.lineTo(ox, topY + h);
  ctx.lineTo(ox - halfW, topY + halfH);
  ctx.closePath();
  ctx.stroke();

  return { canvas, offsetY };
}

/**
 * Get or create cached placeholder
 */
function getOrCreatePlaceholder(
  buildingType: string,
  tileWidth: number,
  tileHeight: number
): CachedPlaceholder {
  const key = getCacheKey(buildingType, tileWidth, tileHeight);

  let cached = placeholderCache.get(key);
  if (!cached) {
    cached = createCachedPlaceholder(buildingType, tileWidth, tileHeight);
    placeholderCache.set(key, cached);
  }

  return cached;
}

/**
 * Draw a placeholder isometric building box when sprites aren't loaded yet.
 * Uses cached off-screen canvases for maximum performance.
 *
 * @param ctx - Main canvas rendering context
 * @param x - Screen X position (left edge of tile)
 * @param y - Screen Y position (top edge of tile diamond)
 * @param buildingType - Building type key for color lookup
 * @param tileWidth - Width of isometric tile
 * @param tileHeight - Height of isometric tile
 */
export function drawPlaceholderBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  buildingType: string,
  tileWidth: number,
  tileHeight: number
): void {
  const cached = getOrCreatePlaceholder(buildingType, tileWidth, tileHeight);

  // Draw cached canvas at position, offsetting to account for box height
  // The cached canvas has the building centered, so we offset by -1 for the margin
  ctx.drawImage(
    cached.canvas as CanvasImageSource,
    x - 1,
    y - cached.offsetY - 1
  );
}

/**
 * Clear the placeholder cache. Call when tile dimensions change significantly
 * or to free memory.
 */
export function clearPlaceholderCache(): void {
  placeholderCache.clear();
}

/**
 * Pre-warm the cache with common building types at specified dimensions.
 * Call during initialization for smoother initial rendering.
 */
export function prewarmPlaceholderCache(tileWidth: number, tileHeight: number): void {
  const commonTypes = [
    'house_small', 'house_medium', 'apartment_low', 'apartment_high',
    'shop_small', 'shop_medium', 'office_low', 'office_high',
    'factory_small', 'factory_medium', 'warehouse',
    'park', 'tree', 'default'
  ];

  for (const type of commonTypes) {
    getOrCreatePlaceholder(type, tileWidth, tileHeight);
  }
}
