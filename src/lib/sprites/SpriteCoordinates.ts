import type { SpritePack } from './types';

// ============================================================================
// SPRITE COORDINATE CALCULATION
// ============================================================================
// Functions for calculating sprite sheet coordinates and offsets
// ============================================================================

/**
 * Get the sprite sheet coordinates for a building type
 * @param buildingType The building type to get coordinates for
 * @param spriteSheetWidth Width of the sprite sheet image
 * @param spriteSheetHeight Height of the sprite sheet image
 * @param pack The sprite pack to use (optional, defaults to active pack)
 * @returns Sprite coordinates or null if not found
 */
export function getSpriteCoords(
  buildingType: string,
  spriteSheetWidth: number,
  spriteSheetHeight: number,
  pack: SpritePack
): { sx: number; sy: number; sw: number; sh: number } | null {
  // First, map building type to sprite key
  const spriteKey = pack.buildingToSprite[buildingType];
  if (!spriteKey) return null;

  // Find index in sprite order
  const index = pack.spriteOrder.indexOf(spriteKey);
  if (index === -1) return null;

  // Calculate tile dimensions
  const tileWidth = Math.floor(spriteSheetWidth / pack.cols);
  const tileHeight = Math.floor(spriteSheetHeight / pack.rows);

  let col: number;
  let row: number;

  if (pack.layout === 'column') {
    col = Math.floor(index / pack.rows);
    row = index % pack.rows;
  } else {
    col = index % pack.cols;
    row = Math.floor(index / pack.cols);
  }

  // Special handling for sprites4-based packs: rows 1-4 include content from rows above, shift source Y down
  // This applies to sprites4 and all its themed variants (harry, china, etc.)
  const isSprites4Based = pack.id.startsWith('sprites4');
  let sy = row * tileHeight;
  if (isSprites4Based && row > 0 && row <= 4) {
    if (row <= 2) {
      // Rows 1-2: small cumulative shift
      const overlapAmount = tileHeight * 0.1;
      sy += overlapAmount * row;
    } else if (row === 3) {
      // Row 3: minimal shift to avoid picking up content from rows above
      sy += tileHeight * 0.1;
    } else if (row === 4) {
      // Row 4: small shift to avoid picking up house_medium from row 3
      sy += tileHeight * 0.05;
    }
  }
  // Row 5: no shift to avoid cross-contamination

  // Special handling for sprites4-based packs: adjust source height for certain sprites
  let sh = tileHeight;
  if (isSprites4Based) {
    if (spriteKey === 'residential' || spriteKey === 'commercial') {
      sh = tileHeight * 1.1; // Add 10% more height at bottom
    }
    if (spriteKey === 'space_program') {
      sh = tileHeight * 0.92; // Crop 8% off the bottom
    }
  }

  return {
    sx: col * tileWidth,
    sy: sy,
    sw: tileWidth,
    sh: sh,
  };
}

/**
 * Helper to get offsets for a specific pack
 * @param buildingType The building type to get offsets for
 * @param pack The sprite pack to use
 * @returns Vertical and horizontal offsets
 */
export function getSpriteOffsets(
  buildingType: string,
  pack: SpritePack
): { vertical: number; horizontal: number } {
  const spriteKey = pack.buildingToSprite[buildingType];

  return {
    vertical: spriteKey ? (pack.verticalOffsets[spriteKey] ?? 0) : 0,
    horizontal: spriteKey ? (pack.horizontalOffsets[spriteKey] ?? 0) : 0,
  };
}
