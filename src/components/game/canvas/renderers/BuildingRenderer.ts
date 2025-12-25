import { Tile, BuildingType } from '@/types/game';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';
import {
  getSpriteCoords,
  BUILDING_TO_SPRITE,
  SPRITE_VERTICAL_OFFSETS,
  SPRITE_HORIZONTAL_OFFSETS,
  getActiveSpritePack,
} from '@/lib/renderConfig';
import { getBuildingSize, getRoadAdjacency, requiresWaterAdjacency } from '@/lib/simulation';
import { drawPlaceholderBuilding } from '@/components/game/placeholders';
import { getCachedImage } from '@/components/game/imageLoader';
import { drawFoundationPlot } from '@/components/game/drawing';

export interface BuildingRenderContext {
  ctx: CanvasRenderingContext2D;
  grid: Tile[][];
  gridSize: number;
  zoom: number;
}

// PERF: Building scale multiplier lookup map (O(1) instead of cascading if statements)
const BUILDING_SCALE_MULTIPLIERS: Record<string, number> = {
  airport: 1.0,
  school: 1.05,
  university: 0.95,
  space_program: 1.06,
  stadium: 0.7,
  water_tower: 0.9,
  subway_station: 0.7,
  police_station: 0.97,
  fire_station: 0.97,
  hospital: 0.9,
  house_small: 1.08,
  apartment_low: 1.15,
  apartment_high: 1.38,
  office_high: 1.2,
};

// PERF: Dense/modern mall scale adjustments
const DENSE_MALL_SCALE = 0.85;
const MODERN_MALL_SCALE = 0.85;

export function drawBuilding(context: BuildingRenderContext, tile: Tile, x: number, y: number) {
  const { ctx, grid, gridSize, zoom } = context;
  const buildingType = tile.building.type;

  if (buildingType === 'water' || buildingType === 'road') {
    // These are handled by specialized renderers
    return;
  }

  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;

  // Get the active sprite pack configuration
  const activePack = getActiveSpritePack();

  // Check if building is under construction (constructionProgress < 100)
  const isUnderConstruction =
    tile.building.constructionProgress !== undefined && tile.building.constructionProgress < 100;

  // Construction has two phases:
  // Phase 1 (0-40%): Foundation/dirt plot phase - just show a dirt mound
  // Phase 2 (40-100%): Construction scaffolding phase - show construction sprite
  const constructionProgress = tile.building.constructionProgress ?? 100;
  const isFoundationPhase = isUnderConstruction && constructionProgress < 40;
  const isConstructionPhase = isUnderConstruction && constructionProgress >= 40;

  // If in foundation phase, draw the foundation plot and skip sprite rendering
  if (isFoundationPhase) {
    // Get building size to handle multi-tile foundations
    const buildingSize = getBuildingSize(buildingType);

    // For multi-tile buildings, we only draw the foundation from the origin tile
    // (the other tiles are 'empty' and won't have this building type)
    if (buildingSize.width > 1 || buildingSize.height > 1) {
      // Draw foundation plots for each tile in the footprint
      for (let dy = 0; dy < buildingSize.height; dy++) {
        for (let dx = 0; dx < buildingSize.width; dx++) {
          const plotX = x + (dx - dy) * (w / 2);
          const plotY = y + (dx + dy) * (h / 2);
          drawFoundationPlot(ctx, plotX, plotY, w, h, zoom);
        }
      }
    } else {
      // Single-tile building - just draw one foundation
      drawFoundationPlot(ctx, x, y, w, h, zoom);
    }
    // Skip the sprite rendering for this tile (foundation plot is already drawn)
    return;
  }

  // Check if building is abandoned
  const isAbandoned = tile.building.abandoned === true;

  // Use appropriate sprite sheet based on building state
  // Priority: parks construction > construction > abandoned > parks > dense/modern variants > farm variants > normal
  let spriteSource = activePack.src;
  let useDenseVariant: { row: number; col: number } | null = null;
  let useModernVariant: { row: number; col: number } | null = null;
  let useFarmVariant: { row: number; col: number } | null = null;
  let useShopVariant: { row: number; col: number } | null = null;
  let useStationVariant: { row: number; col: number } | null = null;
  let useParksBuilding: { row: number; col: number } | null = null;

  // Check if this is a parks building first
  const isParksBuilding = activePack.parksBuildings && activePack.parksBuildings[buildingType];

  if (isConstructionPhase && isParksBuilding && activePack.parksConstructionSrc) {
    // Parks building under construction (phase 2) - use parks construction sheet
    useParksBuilding = activePack.parksBuildings![buildingType];
    spriteSource = activePack.parksConstructionSrc;
  } else if (isConstructionPhase && activePack.constructionSrc) {
    // Regular building under construction (phase 2) - use construction sheet
    spriteSource = activePack.constructionSrc;
  } else if (isAbandoned && activePack.abandonedSrc) {
    spriteSource = activePack.abandonedSrc;
  } else if (isParksBuilding && activePack.parksSrc) {
    // Check if this building type is from the parks sprite sheet
    useParksBuilding = activePack.parksBuildings![buildingType];
    spriteSource = activePack.parksSrc;
  } else if (
    activePack.denseSrc &&
    activePack.denseVariants &&
    activePack.denseVariants[buildingType]
  ) {
    // Check if this building type has dense variants available
    const denseVariants = activePack.denseVariants[buildingType];
    const modernVariants =
      activePack.modernSrc && activePack.modernVariants && activePack.modernVariants[buildingType]
        ? activePack.modernVariants[buildingType]
        : [];
    // Use deterministic random based on tile position to select variant
    // This ensures the same building always shows the same variant
    const seed = (tile.x * 31 + tile.y * 17) % 100;
    // ~50% chance to use a dense/modern variant (when seed < 50)
    if (seed < 50 && (denseVariants.length > 0 || modernVariants.length > 0)) {
      // Combine both variant pools and select from them
      const allVariants = [
        ...denseVariants.map((v) => ({ ...v, source: 'dense' as const })),
        ...modernVariants.map((v) => ({ ...v, source: 'modern' as const })),
      ];
      const variantIndex = (tile.x * 7 + tile.y * 13) % allVariants.length;
      const selectedVariant = allVariants[variantIndex];
      if (selectedVariant.source === 'modern') {
        useModernVariant = { row: selectedVariant.row, col: selectedVariant.col };
        spriteSource = activePack.modernSrc!;
      } else {
        useDenseVariant = { row: selectedVariant.row, col: selectedVariant.col };
        spriteSource = activePack.denseSrc;
      }
    }
  } else if (
    activePack.modernSrc &&
    activePack.modernVariants &&
    activePack.modernVariants[buildingType]
  ) {
    // Check if this building type has modern variants available (without dense variants)
    const variants = activePack.modernVariants[buildingType];
    const seed = (tile.x * 31 + tile.y * 17) % 100;
    if (seed < 50 && variants.length > 0) {
      const variantIndex = (tile.x * 7 + tile.y * 13) % variants.length;
      useModernVariant = variants[variantIndex];
      spriteSource = activePack.modernSrc;
    }
  } else if (
    activePack.farmsSrc &&
    activePack.farmsVariants &&
    activePack.farmsVariants[buildingType]
  ) {
    // Check if this building type has farm variants available (low-density industrial)
    const variants = activePack.farmsVariants[buildingType];
    // Use deterministic random based on tile position to select variant
    // This ensures the same building always shows the same variant
    const seed = (tile.x * 31 + tile.y * 17) % 100;
    // ~50% chance to use a farm variant (when seed < 50)
    if (seed < 50 && variants.length > 0) {
      // Select which farm variant to use based on position
      const variantIndex = (tile.x * 7 + tile.y * 13) % variants.length;
      useFarmVariant = variants[variantIndex];
      spriteSource = activePack.farmsSrc;
    }
  } else if (
    activePack.shopsSrc &&
    activePack.shopsVariants &&
    activePack.shopsVariants[buildingType]
  ) {
    // Check if this building type has shop variants available (low-density commercial)
    const variants = activePack.shopsVariants[buildingType];
    // Use deterministic random based on tile position to select variant
    // This ensures the same building always shows the same variant
    const seed = (tile.x * 31 + tile.y * 17) % 100;
    // ~50% chance to use a shop variant (when seed < 50)
    if (seed < 50 && variants.length > 0) {
      // Select which shop variant to use based on position
      const variantIndex = (tile.x * 7 + tile.y * 13) % variants.length;
      useShopVariant = variants[variantIndex];
      spriteSource = activePack.shopsSrc;
    }
  } else if (
    activePack.stationsSrc &&
    activePack.stationsVariants &&
    activePack.stationsVariants[buildingType]
  ) {
    // Check if this building type has station variants available (rail stations)
    const variants = activePack.stationsVariants[buildingType];
    // Use deterministic random based on tile position to select variant
    // This ensures the same building always shows the same variant
    const seed = (tile.x * 31 + tile.y * 17) % 100;
    // Always use a station variant if available (100% chance)
    if (variants.length > 0) {
      // Select which station variant to use based on position
      const variantIndex = (tile.x * 7 + tile.y * 13) % variants.length;
      useStationVariant = variants[variantIndex];
      spriteSource = activePack.stationsSrc;
    }
  }

  const filteredSpriteSheet = getCachedImage(spriteSource, true) || getCachedImage(spriteSource);

  if (filteredSpriteSheet) {
    // Use naturalWidth/naturalHeight for accurate source dimensions
    const sheetWidth = filteredSpriteSheet.naturalWidth || filteredSpriteSheet.width;
    const sheetHeight = filteredSpriteSheet.naturalHeight || filteredSpriteSheet.height;

    // Get sprite coordinates - either from parks, dense variant, modern variant, farm variant, shop variant, station variant, or normal mapping
    let coords: { sx: number; sy: number; sw: number; sh: number } | null;
    let isDenseVariant = false;
    let isModernVariant = false;
    let isFarmVariant = false;
    let isShopVariant = false;
    let isStationVariant = false;
    let isParksVariantUsed = false;

    if (useParksBuilding) {
      isParksVariantUsed = true;
      // Calculate coordinates from parks sprite sheet using its own grid dimensions
      const parksCols = activePack.parksCols || 5;
      const parksRows = activePack.parksRows || 6;
      const tileWidth = Math.floor(sheetWidth / parksCols);
      const tileHeight = Math.floor(sheetHeight / parksRows);
      let sourceY = useParksBuilding.row * tileHeight;
      let sourceH = tileHeight;

      // Special handling for buildings that have content bleeding from row above - shift source down to avoid capturing
      // content from the sprite above it in the sprite sheet
      if (buildingType === 'marina_docks_small') {
        sourceY += tileHeight * 0.15; // Shift down 15% to avoid row above clipping (reduced from 25%)
        sourceH = tileHeight * 0.85; // Reduce height by 15% to avoid row below clipping
      } else if (buildingType === 'pier_large') {
        sourceY += tileHeight * 0.2; // Shift down 20% to avoid row above clipping
        sourceH = tileHeight * 0.8; // Reduce height by 20% to avoid row below clipping
      } else if (buildingType === 'amphitheater') {
        sourceY += tileHeight * 0.1; // Shift down 10% to avoid row above clipping
      } else if (buildingType === 'mini_golf_course') {
        sourceY += tileHeight * 0.2; // Shift down 20% to crop lower from the top
        sourceH = tileHeight * 0.8; // Reduce height by 20% to maintain proper aspect
      } else if (buildingType === 'cabin_house') {
        sourceY += tileHeight * 0.1; // Shift down 10% to avoid row above clipping
      } else if (buildingType === 'go_kart_track') {
        sourceY += tileHeight * 0.1; // Shift down 10% to avoid row above clipping
      } else if (buildingType === 'greenhouse_garden') {
        sourceY += tileHeight * 0.1; // Shift down 10% to crop asset above it
        sourceH = tileHeight * 0.9; // Reduce height by 10% to maintain proper aspect
      }

      // Special handling for buildings that need more height to avoid bottom clipping
      if (buildingType === 'bleachers_field') {
        sourceH = tileHeight * 1.1; // Increase height by 10% to avoid bottom clipping
      }

      coords = {
        sx: useParksBuilding.col * tileWidth,
        sy: sourceY,
        sw: tileWidth,
        sh: sourceH,
      };
    } else if (useDenseVariant) {
      isDenseVariant = true;
      // Calculate coordinates directly from dense variant row/col
      const tileWidth = Math.floor(sheetWidth / activePack.cols);
      const tileHeight = Math.floor(sheetHeight / activePack.rows);
      let sourceY = useDenseVariant.row * tileHeight;
      let sourceH = tileHeight;
      // For mall dense variants (rows 2-3), shift source Y down to avoid capturing
      // content from the row above that bleeds into the cell boundary
      if (buildingType === 'mall') {
        sourceY += tileHeight * 0.12; // Shift down ~12% to avoid row above
      }
      // For factory_large dense variants (row 4), shift source Y down to avoid capturing
      // content from the row above that bleeds into the cell boundary
      if (buildingType === 'factory_large') {
        sourceY += tileHeight * 0.05; // Shift down ~5% to avoid row above
        sourceH = tileHeight * 0.95; // Reduce height slightly to avoid row below clipping
      }
      // For apartment_high dense variants, add a bit more height to avoid cutoff at bottom
      if (buildingType === 'apartment_high') {
        sourceH = tileHeight * 1.05; // Add 5% more height at bottom
      }
      coords = {
        sx: useDenseVariant.col * tileWidth,
        sy: sourceY,
        sw: tileWidth,
        sh: sourceH,
      };
    } else if (useModernVariant) {
      isModernVariant = true;
      // Calculate coordinates directly from modern variant row/col (same layout as dense: cols/rows)
      const tileWidth = Math.floor(sheetWidth / activePack.cols);
      const tileHeight = Math.floor(sheetHeight / activePack.rows);
      let sourceY = useModernVariant.row * tileHeight;
      let sourceH = tileHeight;
      // For mall modern variants (rows 2-3), shift source Y down to avoid capturing
      // content from the row above that bleeds into the cell boundary
      if (buildingType === 'mall') {
        sourceY += tileHeight * 0.25; // Shift down ~25% to avoid row above (more than dense due to taller assets)
      }
      // For apartment_high modern variants, add a bit more height to avoid cutoff at bottom
      if (buildingType === 'apartment_high') {
        sourceH = tileHeight * 1.05; // Add 5% more height at bottom
      }
      coords = {
        sx: useModernVariant.col * tileWidth,
        sy: sourceY,
        sw: tileWidth,
        sh: sourceH,
      };
    } else if (useFarmVariant) {
      isFarmVariant = true;
      // Calculate coordinates directly from farm variant row/col
      const farmsCols = activePack.farmsCols || 5;
      const farmsRows = activePack.farmsRows || 6;
      const tileWidth = Math.floor(sheetWidth / farmsCols);
      const tileHeight = Math.floor(sheetHeight / farmsRows);
      const sourceY = useFarmVariant.row * tileHeight;
      const sourceH = tileHeight;
      coords = {
        sx: useFarmVariant.col * tileWidth,
        sy: sourceY,
        sw: tileWidth,
        sh: sourceH,
      };
    } else if (useShopVariant) {
      isShopVariant = true;
      // Calculate coordinates directly from shop variant row/col
      const shopsCols = activePack.shopsCols || 5;
      const shopsRows = activePack.shopsRows || 6;
      const tileWidth = Math.floor(sheetWidth / shopsCols);
      const tileHeight = Math.floor(sheetHeight / shopsRows);
      const sourceY = useShopVariant.row * tileHeight;
      const sourceH = tileHeight;
      coords = {
        sx: useShopVariant.col * tileWidth,
        sy: sourceY,
        sw: tileWidth,
        sh: sourceH,
      };
    } else if (useStationVariant) {
      isStationVariant = true;
      // Calculate coordinates directly from station variant row/col
      const stationsCols = activePack.stationsCols || 5;
      const stationsRows = activePack.stationsRows || 6;
      const tileWidth = Math.floor(sheetWidth / stationsCols);
      const tileHeight = Math.floor(sheetHeight / stationsRows);
      let sourceY = useStationVariant.row * tileHeight;
      let sourceH = tileHeight;

      // Special handling for rows that have content bleeding from row above
      // Third row (row 2, 0-indexed) - shift down to avoid capturing content from row above
      if (useStationVariant.row === 2) {
        sourceY += tileHeight * 0.1; // Shift down 10% to avoid row above clipping
      }
      // Fourth row (row 3, 0-indexed) - shift down to avoid capturing content from row above
      // Also reduce height slightly to crop out bottom clipping from row below
      if (useStationVariant.row === 3) {
        sourceY += tileHeight * 0.1; // Shift down 10% to avoid row above clipping
        sourceH -= tileHeight * 0.05; // Reduce height by 5% to crop bottom clipping
      }
      // Fifth row (row 4, 0-indexed) - shift down to avoid capturing content from row above
      // Also reduce height to crop out bottom clipping from row below
      if (useStationVariant.row === 4) {
        sourceY += tileHeight * 0.1; // Shift down 10% to avoid row above clipping
        sourceH -= tileHeight * 0.1; // Reduce height by 10% to crop bottom clipping
      }

      coords = {
        sx: useStationVariant.col * tileWidth,
        sy: sourceY,
        sw: tileWidth,
        sh: sourceH,
      };
    } else {
      // getSpriteCoords handles building type to sprite key mapping
      coords = getSpriteCoords(buildingType, sheetWidth, sheetHeight, activePack);

      // Special cropping for factory_large base sprite - crop bottom to remove asset below
      if (buildingType === 'factory_large' && coords) {
        const tileHeight = Math.floor(sheetHeight / activePack.rows);
        coords.sh = coords.sh - tileHeight * 0.08; // Crop 8% from bottom
      }
    }

    if (coords) {
      // Get building size to handle multi-tile buildings
      const buildingSize = getBuildingSize(buildingType);
      const isMultiTile = buildingSize.width > 1 || buildingSize.height > 1;

      // Calculate draw position for multi-tile buildings
      // Multi-tile buildings need to be positioned at the front-most corner
      let drawPosX = x;
      let drawPosY = y;

      if (isMultiTile) {
        // Calculate offset to position sprite at the front-most visible corner
        // In isometric view, the front-most corner is at (originX + width - 1, originY + height - 1)
        const frontmostOffsetX = buildingSize.width - 1;
        const frontmostOffsetY = buildingSize.height - 1;
        const screenOffsetX = (frontmostOffsetX - frontmostOffsetY) * (w / 2);
        const screenOffsetY = (frontmostOffsetX + frontmostOffsetY) * (h / 2);
        drawPosX = x + screenOffsetX;
        drawPosY = y + screenOffsetY;
      }

      // Calculate destination size preserving aspect ratio of source sprite
      // Scale factor: 1.2 base (reduced from 1.5 for ~20% smaller)
      // Multi-tile buildings scale with their footprint
      let scaleMultiplier = isMultiTile ? Math.max(buildingSize.width, buildingSize.height) : 1;

      // Apply building-specific scale multipliers from lookup map
      if (buildingType in BUILDING_SCALE_MULTIPLIERS) {
        scaleMultiplier *= BUILDING_SCALE_MULTIPLIERS[buildingType];
      }

      // Special scale adjustment for dense mall variants (scaled down 15%)
      if (buildingType === 'mall' && isDenseVariant) {
        scaleMultiplier *= DENSE_MALL_SCALE;
      }
      // Special scale adjustment for modern mall variants (scaled down 15%)
      if (buildingType === 'mall' && isModernVariant) {
        scaleMultiplier *= MODERN_MALL_SCALE;
      }
      // Apply dense-specific scale if building uses dense variant and has custom scale in config
      if (isDenseVariant && activePack.denseScales && buildingType in activePack.denseScales) {
        scaleMultiplier *= activePack.denseScales[buildingType];
      }
      // Apply modern-specific scale if building uses modern variant and has custom scale in config
      if (
        isModernVariant &&
        activePack.modernScales &&
        buildingType in activePack.modernScales
      ) {
        scaleMultiplier *= activePack.modernScales[buildingType];
      }
      // Apply farm-specific scale if building uses farm variant and has custom scale in config
      if (isFarmVariant && activePack.farmsScales && buildingType in activePack.farmsScales) {
        scaleMultiplier *= activePack.farmsScales[buildingType];
      }
      // Apply shop-specific scale if building uses shop variant and has custom scale in config
      if (isShopVariant && activePack.shopsScales && buildingType in activePack.shopsScales) {
        scaleMultiplier *= activePack.shopsScales[buildingType];
      }
      // Apply station-specific scale if building uses station variant and has custom scale in config
      if (
        isStationVariant &&
        activePack.stationsScales &&
        buildingType in activePack.stationsScales
      ) {
        scaleMultiplier *= activePack.stationsScales[buildingType];
      }
      // Apply parks-specific scale if building is from parks sheet and has custom scale in config
      if (
        isParksVariantUsed &&
        activePack.parksScales &&
        buildingType in activePack.parksScales
      ) {
        scaleMultiplier *= activePack.parksScales[buildingType];
      }
      // Apply construction-specific scale if building is in construction phase (phase 2) and has custom scale
      if (
        isConstructionPhase &&
        activePack.constructionScales &&
        buildingType in activePack.constructionScales
      ) {
        scaleMultiplier *= activePack.constructionScales[buildingType];
      }
      // Apply abandoned-specific scale if building is abandoned and has custom scale
      if (
        isAbandoned &&
        activePack.abandonedScales &&
        buildingType in activePack.abandonedScales
      ) {
        scaleMultiplier *= activePack.abandonedScales[buildingType];
      }
      // Apply global scale from sprite pack if available
      const globalScale = activePack.globalScale ?? 1;
      const destWidth = w * 1.2 * scaleMultiplier * globalScale;
      const aspectRatio = coords.sh / coords.sw; // height/width ratio of source
      const destHeight = destWidth * aspectRatio;

      // Position: center horizontally on tile/footprint, anchor bottom of sprite at tile bottom
      let drawX = drawPosX + w / 2 - destWidth / 2;

      // Apply per-sprite horizontal offset adjustments
      const spriteKey = BUILDING_TO_SPRITE[buildingType];
      let horizontalOffset =
        spriteKey && SPRITE_HORIZONTAL_OFFSETS[spriteKey]
          ? SPRITE_HORIZONTAL_OFFSETS[spriteKey] * w
          : 0;
      // Apply parks-specific horizontal offset if available
      if (
        isParksVariantUsed &&
        activePack.parksHorizontalOffsets &&
        buildingType in activePack.parksHorizontalOffsets
      ) {
        horizontalOffset = activePack.parksHorizontalOffsets[buildingType] * w;
      }
      // Apply farm-specific horizontal offset if available
      if (
        isFarmVariant &&
        activePack.farmsHorizontalOffsets &&
        buildingType in activePack.farmsHorizontalOffsets
      ) {
        horizontalOffset = activePack.farmsHorizontalOffsets[buildingType] * w;
      }
      // Apply shop-specific horizontal offset if available
      if (
        isShopVariant &&
        activePack.shopsHorizontalOffsets &&
        buildingType in activePack.shopsHorizontalOffsets
      ) {
        horizontalOffset = activePack.shopsHorizontalOffsets[buildingType] * w;
      }
      // Apply station-specific horizontal offset if available
      if (
        isStationVariant &&
        activePack.stationsHorizontalOffsets &&
        buildingType in activePack.stationsHorizontalOffsets
      ) {
        horizontalOffset = activePack.stationsHorizontalOffsets[buildingType] * w;
      }
      drawX += horizontalOffset;

      // Simple positioning: sprite bottom aligns with tile/footprint bottom
      // Add vertical push to compensate for transparent space at bottom of sprites
      let drawY: number;
      let verticalPush: number;
      if (isMultiTile) {
        // Multi-tile sprites need larger push to sit on their footprint
        const footprintDepth = buildingSize.width + buildingSize.height - 2;
        verticalPush = footprintDepth * h * 0.25;
      } else {
        // Single-tile sprites also need push (sprites have transparent bottom padding)
        verticalPush = destHeight * 0.15;
      }
      // Use state-specific offset if available, then fall back to building-type or sprite-key offsets
      // Priority: parks-construction > construction > abandoned > parks > dense > building-type > sprite-key
      let extraOffset = 0;
      if (
        isConstructionPhase &&
        isParksVariantUsed &&
        activePack.parksConstructionVerticalOffsets &&
        buildingType in activePack.parksConstructionVerticalOffsets
      ) {
        // Parks building in construction phase (phase 2) - use parks construction offset
        extraOffset = activePack.parksConstructionVerticalOffsets[buildingType] * h;
      } else if (
        isConstructionPhase &&
        activePack.constructionVerticalOffsets &&
        buildingType in activePack.constructionVerticalOffsets
      ) {
        // Regular building in construction phase (phase 2) - use construction offset
        extraOffset = activePack.constructionVerticalOffsets[buildingType] * h;
      } else if (
        isAbandoned &&
        activePack.abandonedVerticalOffsets &&
        buildingType in activePack.abandonedVerticalOffsets
      ) {
        // Abandoned buildings may need different positioning than normal
        extraOffset = activePack.abandonedVerticalOffsets[buildingType] * h;
      } else if (
        isParksVariantUsed &&
        activePack.parksVerticalOffsets &&
        buildingType in activePack.parksVerticalOffsets
      ) {
        // Parks buildings may need specific positioning
        extraOffset = activePack.parksVerticalOffsets[buildingType] * h;
      } else if (
        isDenseVariant &&
        activePack.denseVerticalOffsets &&
        buildingType in activePack.denseVerticalOffsets
      ) {
        // Dense variants may need different positioning than normal
        extraOffset = activePack.denseVerticalOffsets[buildingType] * h;
      } else if (
        isModernVariant &&
        activePack.modernVerticalOffsets &&
        buildingType in activePack.modernVerticalOffsets
      ) {
        // Modern variants may need different positioning than normal
        extraOffset = activePack.modernVerticalOffsets[buildingType] * h;
      } else if (
        isFarmVariant &&
        activePack.farmsVerticalOffsets &&
        buildingType in activePack.farmsVerticalOffsets
      ) {
        // Farm variants may need different positioning than normal
        extraOffset = activePack.farmsVerticalOffsets[buildingType] * h;
      } else if (
        isShopVariant &&
        activePack.shopsVerticalOffsets &&
        buildingType in activePack.shopsVerticalOffsets
      ) {
        // Shop variants may need different positioning than normal
        extraOffset = activePack.shopsVerticalOffsets[buildingType] * h;
      } else if (
        isStationVariant &&
        activePack.stationsVerticalOffsets &&
        buildingType in activePack.stationsVerticalOffsets
      ) {
        // Station variants may need different positioning than normal
        extraOffset = activePack.stationsVerticalOffsets[buildingType] * h;
      } else if (
        activePack.buildingVerticalOffsets &&
        buildingType in activePack.buildingVerticalOffsets
      ) {
        // Building-type-specific offset (for buildings sharing sprites but needing different positioning)
        extraOffset = activePack.buildingVerticalOffsets[buildingType] * h;
      } else if (spriteKey && SPRITE_VERTICAL_OFFSETS[spriteKey]) {
        extraOffset = SPRITE_VERTICAL_OFFSETS[spriteKey] * h;
      }
      // Special vertical offset adjustment for hospital (shift up 0.1 tiles)
      if (buildingType === 'hospital') {
        extraOffset -= 0.1 * h; // Shift up by 0.1 tiles
      }
      verticalPush += extraOffset;

      drawY = drawPosY + h - destHeight + verticalPush;

      // Check if building should be horizontally flipped
      // Some buildings are mirrored by default and the flip flag inverts that
      // Note: marina and pier are NOT in this list - they face the default direction
      const defaultMirroredBuildings: string[] = [];
      const isDefaultMirrored = defaultMirroredBuildings.includes(buildingType);

      // Check if this is a waterfront asset - these use water-facing logic set at build time
      const isWaterfrontAsset = requiresWaterAdjacency(buildingType);

      // Determine flip based on road adjacency for non-waterfront buildings
      // Buildings should face roads when possible, otherwise fall back to random
      const shouldRoadMirror = (() => {
        if (isWaterfrontAsset) return false; // Waterfront buildings use water-facing logic

        const roadCheck = getRoadAdjacency(
          grid,
          tile.x,
          tile.y,
          buildingSize.width,
          buildingSize.height,
          gridSize
        );
        if (roadCheck.hasRoad) {
          // Face the road
          return roadCheck.shouldFlip;
        }

        // No road adjacent - fall back to deterministic random mirroring for visual variety
        const mirrorSeed = (tile.x * 47 + tile.y * 83) % 100;
        return mirrorSeed < 50;
      })();

      // Final flip decision: combine default mirror state, explicit flip flag, and road/random mirror
      const baseFlipped = isDefaultMirrored
        ? !tile.building.flipped
        : tile.building.flipped === true;
      const isFlipped = baseFlipped !== shouldRoadMirror; // XOR: if both true or both false, no flip; if one true, flip

      if (isFlipped) {
        // Apply horizontal flip around the center of the sprite
        ctx.save();
        const centerX = Math.round(drawX + destWidth / 2);
        ctx.translate(centerX, 0);
        ctx.scale(-1, 1);
        ctx.translate(-centerX, 0);

        // Draw the flipped sprite
        ctx.drawImage(
          filteredSpriteSheet,
          coords.sx,
          coords.sy,
          coords.sw,
          coords.sh,
          Math.round(drawX),
          Math.round(drawY),
          Math.round(destWidth),
          Math.round(destHeight)
        );

        ctx.restore();
      } else {
        // Draw the sprite with correct aspect ratio (normal buildings)
        ctx.drawImage(
          filteredSpriteSheet,
          coords.sx,
          coords.sy,
          coords.sw,
          coords.sh, // Source: exact tile from sprite sheet
          Math.round(drawX),
          Math.round(drawY), // Destination position
          Math.round(destWidth),
          Math.round(destHeight) // Destination size (preserving aspect ratio)
        );
      }
    }
  } else {
    // Sprite sheet not loaded yet - draw placeholder building
    drawPlaceholderBuilding(ctx, x, y, buildingType, w, h);
  }

  // Draw fire effect
  if (tile.building.onFire) {
    const fireX = x + w / 2;
    const fireY = y - 10;

    ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(fireX, fireY, 18, 25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
    ctx.beginPath();
    ctx.ellipse(fireX, fireY + 5, 10, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
    ctx.beginPath();
    ctx.ellipse(fireX, fireY + 8, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
