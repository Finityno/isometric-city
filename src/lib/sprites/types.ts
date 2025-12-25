// Sprite Pack Type Definitions
// ============================================================================
// Each sprite pack contains all the configuration needed for a specific
// sprite sheet image, including layout, offsets, and building mappings.
// ============================================================================
export interface SpritePack {
  // Unique identifier for this sprite pack
  id: string;
  // Display name for the UI
  name: string;
  // Path to the sprite sheet image
  src: string;
  // Path to the construction sprite sheet (same layout, but buildings under construction)
  constructionSrc?: string;
  // Path to the abandoned sprite sheet (same layout, but buildings shown as abandoned/derelict)
  abandonedSrc?: string;
  // Path to the dense variants sprite sheet (alternative sprites for high-density buildings)
  denseSrc?: string;
  // Dense variant definitions: maps building type to available variants in the dense sheet
  // Each variant specifies row and column (0-indexed) in the dense sprite sheet
  denseVariants?: Record<string, { row: number; col: number }[]>;
  // Path to the modern variants sprite sheet (alternative sprites for modern-style high-density buildings)
  modernSrc?: string;
  // Modern variant definitions: maps building type to available variants in the modern sheet
  // Each variant specifies row and column (0-indexed) in the modern sprite sheet
  modernVariants?: Record<string, { row: number; col: number }[]>;
  // Path to the parks sprite sheet (separate sheet for park/recreation buildings)
  parksSrc?: string;
  // Path to the parks construction sprite sheet (same layout as parks, but under construction)
  parksConstructionSrc?: string;
  // Parks layout configuration (columns and rows for the parks sheet)
  parksCols?: number;
  parksRows?: number;
  // Parks buildings: maps building type to position in parks sprite sheet
  // Each entry specifies the row and column (0-indexed) in the parks sprite sheet
  parksBuildings?: Record<string, { row: number; col: number }>;
  // Number of columns in the sprite sheet
  cols: number;
  // Number of rows in the sprite sheet
  rows: number;
  // Layout order: 'row' = left-to-right then top-to-bottom
  layout: 'row' | 'column';
  // The order of sprites in the sprite sheet (maps to grid positions)
  spriteOrder: readonly string[];
  // Per-sprite vertical offset adjustments (positive = down, negative = up)
  // Values are multiplied by tile height for consistent scaling
  verticalOffsets: Record<string, number>;
  // Per-sprite horizontal offset adjustments (positive = right, negative = left)
  // Values are multiplied by tile width for consistent scaling
  horizontalOffsets: Record<string, number>;
  // Per-building-type vertical offset overrides (takes precedence over sprite-key offsets)
  // Use this when multiple building types share a sprite but need different positioning
  buildingVerticalOffsets?: Record<string, number>;
  // Per-sprite vertical offset adjustments for CONSTRUCTION sprites only
  // These override verticalOffsets when rendering buildings under construction
  constructionVerticalOffsets?: Record<string, number>;
  // Per-building-type scale adjustments for CONSTRUCTION sprites only
  // Values are multiplied with the normal scale (e.g., 0.95 = 95% of normal size)
  constructionScales?: Record<string, number>;
  // Per-sprite vertical offset adjustments for ABANDONED sprites only
  // These override verticalOffsets when rendering abandoned buildings
  abandonedVerticalOffsets?: Record<string, number>;
  // Per-building-type scale adjustments for ABANDONED sprites only
  // Values are multiplied with the normal scale (e.g., 0.7 = 70% of normal size)
  abandonedScales?: Record<string, number>;
  // Per-building-type vertical offset adjustments for DENSE variant sprites only
  // These override verticalOffsets when rendering dense variants
  denseVerticalOffsets?: Record<string, number>;
  // Per-building-type scale adjustments for DENSE variant sprites only
  // Values are multiplied with the normal scale (e.g., 0.95 = 95% of normal size)
  denseScales?: Record<string, number>;
  // Per-building-type vertical offset adjustments for MODERN variant sprites only
  // These override verticalOffsets when rendering modern variants
  modernVerticalOffsets?: Record<string, number>;
  // Per-building-type scale adjustments for MODERN variant sprites only
  // Values are multiplied with the normal scale (e.g., 0.95 = 95% of normal size)
  modernScales?: Record<string, number>;
  // Per-building-type vertical offset adjustments for PARKS sprite sheet buildings
  // These are used when rendering parks buildings from the parks sprite sheet
  parksVerticalOffsets?: Record<string, number>;
  // Per-building-type horizontal offset adjustments for PARKS sprite sheet buildings
  parksHorizontalOffsets?: Record<string, number>;
  // Per-building-type scale adjustments for PARKS sprite sheet buildings
  // Values are multiplied with the normal scale (e.g., 0.95 = 95% of normal size)
  parksScales?: Record<string, number>;
  // Per-building-type vertical offset adjustments for PARKS CONSTRUCTION sprites only
  // These override parksVerticalOffsets when rendering parks buildings under construction
  parksConstructionVerticalOffsets?: Record<string, number>;
  // Path to the farms sprite sheet (separate sheet for farm/agricultural buildings)
  farmsSrc?: string;
  // Farms layout configuration (columns and rows for the farms sheet)
  farmsCols?: number;
  farmsRows?: number;
  // Farms variants: maps building type to available variants in the farms sheet
  // Each variant specifies row and column (0-indexed) in the farms sprite sheet
  farmsVariants?: Record<string, { row: number; col: number }[]>;
  // Per-building-type vertical offset adjustments for FARMS sprite sheet buildings
  farmsVerticalOffsets?: Record<string, number>;
  // Per-building-type horizontal offset adjustments for FARMS sprite sheet buildings
  farmsHorizontalOffsets?: Record<string, number>;
  // Per-building-type scale adjustments for FARMS sprite sheet buildings
  farmsScales?: Record<string, number>;
  // Path to the shops sprite sheet (alternate variants for shop buildings)
  shopsSrc?: string;
  // Shops layout configuration (columns and rows for the shops sheet)
  shopsCols?: number;
  shopsRows?: number;
  // Shops variants: maps building type to available variants in the shops sheet
  // Each variant specifies row and column (0-indexed) in the shops sprite sheet
  shopsVariants?: Record<string, { row: number; col: number }[]>;
  // Per-building-type vertical offset adjustments for SHOPS sprite sheet buildings
  shopsVerticalOffsets?: Record<string, number>;
  // Per-building-type horizontal offset adjustments for SHOPS sprite sheet buildings
  shopsHorizontalOffsets?: Record<string, number>;
  // Per-building-type scale adjustments for SHOPS sprite sheet buildings
  shopsScales?: Record<string, number>;
  // Path to the stations sprite sheet (rail station variants)
  stationsSrc?: string;
  // Stations layout configuration (columns and rows for the stations sheet)
  stationsCols?: number;
  stationsRows?: number;
  // Stations variants: maps building type to available variants in the stations sheet
  // Each variant specifies row and column (0-indexed) in the stations sprite sheet
  stationsVariants?: Record<string, { row: number; col: number }[]>;
  // Per-building-type vertical offset adjustments for STATIONS sprite sheet buildings
  stationsVerticalOffsets?: Record<string, number>;
  // Per-building-type horizontal offset adjustments for STATIONS sprite sheet buildings
  stationsHorizontalOffsets?: Record<string, number>;
  // Per-building-type scale adjustments for STATIONS sprite sheet buildings
  stationsScales?: Record<string, number>;
  // Maps building types to sprite keys in spriteOrder
  buildingToSprite: Record<string, string>;
  // Optional global scale multiplier for all sprites in this pack
  globalScale?: number;
}
