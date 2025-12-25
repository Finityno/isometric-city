import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';

// PERF: Static sets for lighting calculations (moved to module level to avoid recreation)
const nonLitTypes = new Set(['grass', 'empty', 'water', 'road', 'tree', 'park', 'park_large', 'tennis']);
const specialTypes = new Set(['hospital', 'fire_station', 'police_station', 'power_plant']);
const residentialTypes = new Set(['house_small', 'house_medium', 'mansion', 'apartment_low', 'apartment_high']);
const commercialTypes = new Set(['shop_small', 'shop_medium', 'office_low', 'office_high', 'mall']);

// Lighting cache type - pre-computed light source data for consistent rendering
export type CachedLight = {
  gridX: number;
  gridY: number;
  screenX: number;
  screenY: number;
  type: 'road' | 'building';
  buildingType?: string;
  seed: number;
  isSpecial?: boolean;
  specialType?: string;
};

export interface LightingRenderContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  offset: { x: number; y: number };
  zoom: number;
  visualHour: number;
  lightingCache: CachedLight[];
  isMobile: boolean;
  isPanning: boolean;
  isPinchZooming: boolean;
}

// Calculate darkness based on visualHour (0-23)
function getDarkness(h: number): number {
  if (h >= 7 && h < 18) return 0;
  if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
  if (h >= 18 && h < 20) return (h - 18) / 2;
  return 1;
}

// Get ambient color based on time
function getAmbientColor(h: number): { r: number; g: number; b: number } {
  if (h >= 7 && h < 18) return { r: 255, g: 255, b: 255 };
  if (h >= 5 && h < 7) {
    const t = (h - 5) / 2;
    return { r: Math.round(60 + 40 * t), g: Math.round(40 + 30 * t), b: Math.round(70 + 20 * t) };
  }
  if (h >= 18 && h < 20) {
    const t = (h - 18) / 2;
    return { r: Math.round(100 - 40 * t), g: Math.round(70 - 30 * t), b: Math.round(90 - 20 * t) };
  }
  return { r: 20, g: 30, b: 60 };
}

// Deterministic pseudo-random function (stable across renders)
function pseudoRandom(seed: number, n: number) {
  const s = Math.sin(seed + n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function drawLighting(context: LightingRenderContext) {
  const { ctx, canvas, offset, zoom, visualHour, lightingCache, isMobile, isPanning, isPinchZooming } = context;

  // PERF: Hide lighting during panning/zooming on mobile for better performance
  if (isMobile && (isPanning || isPinchZooming)) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const currentZoom = zoom;
  const currentOffset = offset;
  const dpr = window.devicePixelRatio || 1;

  const darkness = getDarkness(visualHour);

  // Clear canvas first
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // If it's full daylight, just clear and return
  if (darkness <= 0.01) return;

  const ambient = getAmbientColor(visualHour);

  // Apply darkness overlay
  const alpha = darkness * 0.6;
  ctx.fillStyle = `rgba(${ambient.r}, ${ambient.g}, ${ambient.b}, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Calculate viewport bounds for filtering cached lights
  const viewWidth = canvas.width / (dpr * currentZoom);
  const viewHeight = canvas.height / (dpr * currentZoom);
  const viewLeft = -currentOffset.x / currentZoom - TILE_WIDTH * 3;
  const viewTop = -currentOffset.y / currentZoom - TILE_HEIGHT * 6;
  const viewRight = viewWidth - currentOffset.x / currentZoom + TILE_WIDTH * 3;
  const viewBottom = viewHeight - currentOffset.y / currentZoom + TILE_HEIGHT * 3;

  const lightIntensity = Math.min(1, darkness * 1.2);

  // Filter visible lights from cache
  const visibleLights: CachedLight[] = [];
  const visibleSpecialGlows: CachedLight[] = [];

  // Only sample on mobile or when extremely zoomed out
  const shouldSample = isMobile || currentZoom < 0.35;
  const roadSampleMod = isMobile ? 2 : 3;
  const buildingSampleMod = isMobile ? 2 : 2;

  for (const light of lightingCache) {
    // Viewport culling using pre-computed screen positions
    if (
      light.screenX + TILE_WIDTH < viewLeft ||
      light.screenX > viewRight ||
      light.screenY + TILE_HEIGHT * 3 < viewTop ||
      light.screenY > viewBottom
    ) {
      continue;
    }

    // Only sample when necessary for performance
    if (shouldSample) {
      const tileIndex = light.gridX + light.gridY;
      if (light.type === 'road') {
        if (tileIndex % roadSampleMod !== 0) continue;
      } else {
        if (tileIndex % buildingSampleMod !== 0) continue;
      }
    }

    visibleLights.push(light);

    // Collect special glows (always show these when in view)
    if (light.isSpecial && !isMobile && currentZoom >= 0.4) {
      visibleSpecialGlows.push(light);
    }
  }

  // Draw light cutouts (destination-out)
  ctx.globalCompositeOperation = 'destination-out';
  ctx.save();
  ctx.scale(dpr * currentZoom, dpr * currentZoom);
  ctx.translate(currentOffset.x / currentZoom, currentOffset.y / currentZoom);

  for (const light of visibleLights) {
    const tileCenterX = light.screenX + TILE_WIDTH / 2;
    const tileCenterY = light.screenY + TILE_HEIGHT / 2;

    if (light.type === 'road') {
      const lightRadius = 28;
      const gradient = ctx.createRadialGradient(tileCenterX, tileCenterY, 0, tileCenterX, tileCenterY, lightRadius);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${0.75 * lightIntensity})`);
      gradient.addColorStop(0.4, `rgba(255, 255, 255, ${0.4 * lightIntensity})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(tileCenterX, tileCenterY, lightRadius, 0, Math.PI * 2);
      ctx.fill();
    } else if (light.type === 'building' && light.buildingType) {
      const buildingType = light.buildingType;
      const isResidential = residentialTypes.has(buildingType);
      const isCommercial = commercialTypes.has(buildingType);
      const glowStrength = isCommercial ? 0.9 : isResidential ? 0.65 : 0.75;

      // Window lights - only at high zoom
      if (!isMobile && currentZoom >= 0.7) {
        let numWindows = 1;
        if (buildingType.includes('medium') || buildingType.includes('low')) numWindows = 2;
        if (buildingType.includes('high') || buildingType === 'mall') numWindows = 3;
        if (buildingType === 'mansion' || buildingType === 'office_high') numWindows = 2;

        const windowSize = 5;
        const buildingHeight = -18;

        for (let i = 0; i < numWindows; i++) {
          const isLit = pseudoRandom(light.seed, i) < (isResidential ? 0.55 : 0.75);
          if (!isLit) continue;

          const wx = tileCenterX + (pseudoRandom(light.seed, i + 10) - 0.5) * 22;
          const wy = tileCenterY + buildingHeight + (pseudoRandom(light.seed, i + 20) - 0.5) * 16;

          const gradient = ctx.createRadialGradient(wx, wy, 0, wx, wy, windowSize * 2.5);
          gradient.addColorStop(0, `rgba(255, 255, 255, ${glowStrength * lightIntensity})`);
          gradient.addColorStop(0.5, `rgba(255, 255, 255, ${glowStrength * 0.4 * lightIntensity})`);
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(wx, wy, windowSize * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ground glow
      const groundGlowRadius = isMobile ? TILE_WIDTH * 0.5 : TILE_WIDTH * 0.6;
      const groundGlowAlpha = isMobile ? 0.4 : 0.28;
      const groundGlow = ctx.createRadialGradient(
        tileCenterX,
        tileCenterY + TILE_HEIGHT / 4,
        0,
        tileCenterX,
        tileCenterY + TILE_HEIGHT / 4,
        groundGlowRadius
      );
      groundGlow.addColorStop(0, `rgba(255, 255, 255, ${groundGlowAlpha * lightIntensity})`);
      groundGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = groundGlow;
      ctx.beginPath();
      ctx.ellipse(
        tileCenterX,
        tileCenterY + TILE_HEIGHT / 4,
        groundGlowRadius,
        TILE_HEIGHT / 2.5,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  ctx.restore();

  // Draw colored glows for special buildings and road lights
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.scale(dpr * currentZoom, dpr * currentZoom);
  ctx.translate(currentOffset.x / currentZoom, currentOffset.y / currentZoom);

  // Road colored glows (warm street light color)
  if (!isMobile && currentZoom >= 0.6) {
    for (const light of visibleLights) {
      if (light.type !== 'road') continue;
      const tileCenterX = light.screenX + TILE_WIDTH / 2;
      const tileCenterY = light.screenY + TILE_HEIGHT / 2;

      const gradient = ctx.createRadialGradient(tileCenterX, tileCenterY, 0, tileCenterX, tileCenterY, 20);
      gradient.addColorStop(0, `rgba(255, 210, 130, ${0.3 * lightIntensity})`);
      gradient.addColorStop(0.5, `rgba(255, 190, 100, ${0.15 * lightIntensity})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(tileCenterX, tileCenterY, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Special building glows (hospital, fire station, etc.)
  for (const light of visibleSpecialGlows) {
    const tileCenterX = light.screenX + TILE_WIDTH / 2;
    const tileCenterY = light.screenY + TILE_HEIGHT / 2;

    let glowColor: { r: number; g: number; b: number } | null = null;
    let glowRadius = 20;

    if (light.specialType === 'hospital') {
      glowColor = { r: 255, g: 80, b: 80 };
      glowRadius = 25;
    } else if (light.specialType === 'fire_station') {
      glowColor = { r: 255, g: 100, b: 50 };
      glowRadius = 22;
    } else if (light.specialType === 'police_station') {
      glowColor = { r: 60, g: 140, b: 255 };
      glowRadius = 22;
    } else if (light.specialType === 'power_plant') {
      glowColor = { r: 255, g: 200, b: 50 };
      glowRadius = 30;
    }

    if (glowColor) {
      const gradient = ctx.createRadialGradient(
        tileCenterX,
        tileCenterY - 15,
        0,
        tileCenterX,
        tileCenterY - 15,
        glowRadius
      );
      gradient.addColorStop(0, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${0.55 * lightIntensity})`);
      gradient.addColorStop(0.5, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${0.25 * lightIntensity})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(tileCenterX, tileCenterY - 15, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

// Export the sets for external use if needed
export { nonLitTypes, specialTypes, residentialTypes, commercialTypes };
