import type { SpritePack } from '../types';

// ============================================================================
// SPRITES4 VARIANT SHEETS CONFIGURATION
// ============================================================================
// This module contains the configuration for all variant sprite sheets
// (modern, parks, farms, shops, stations) that extend the base sprites4 pack.
// These are applied as partial updates to the base SPRITE_PACK_SPRITES4.
// ============================================================================

export const SPRITES4_MODERN_CONFIG: Partial<SpritePack> = {
  // Modern sprite sheet configuration (same layout as dense: 5 cols, 6 rows)
  modernSrc: '/assets/sprites_red_water_new_modern.png',
  modernVariants: {
    // High density residential (apartment_high) - Row 1, columns 1-2 (0-indexed: row 0, cols 0-1)
    apartment_high: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ],
    // High density commercial (mall) - Row 3 col 1, Row 4 cols 1, 4, 5 (0-indexed: row 2 col 0, row 3 cols 0, 3, 4)
    mall: [
      { row: 2, col: 0 },
      { row: 3, col: 0 },
      { row: 3, col: 3 },
      { row: 3, col: 4 },
    ],
  },
  modernVerticalOffsets: {
    // Adjust these as needed for proper positioning
    apartment_high: -0.80,
    mall: -1.0,
  },
  modernScales: {
    // Adjust these as needed for proper sizing
    apartment_high: 0.90,
  },
};

export const SPRITES4_PARKS_CONFIG: Partial<SpritePack> = {
  // Parks sprite sheet configuration (same offsets/scaling approach as dense)
  parksSrc: '/assets/sprites_red_water_new_parks.png',
  parksConstructionSrc: '/assets/sprites_red_water_new_parks_construction.png',
  parksCols: 5,
  parksRows: 6,
  parksBuildings: {
    // Row 0: tennis_court(skip), basketball_courts, playground_small, playground_large, baseball_field_small
    basketball_courts: { row: 0, col: 1 },
    playground_small: { row: 0, col: 2 },
    playground_large: { row: 0, col: 3 },
    baseball_field_small: { row: 0, col: 4 },
    // Row 1: soccer_field_small, football_field, baseball_stadium, community_center, office_building_small
    soccer_field_small: { row: 1, col: 0 },
    football_field: { row: 1, col: 1 },
    baseball_stadium: { row: 1, col: 2 },
    community_center: { row: 1, col: 3 },
    office_building_small: { row: 1, col: 4 },
    // Row 2: swimming_pool, skate_park, mini_golf_course, bleachers_field, go_kart_track
    swimming_pool: { row: 2, col: 0 },
    skate_park: { row: 2, col: 1 },
    mini_golf_course: { row: 2, col: 2 },
    bleachers_field: { row: 2, col: 3 },
    go_kart_track: { row: 2, col: 4 },
    // Row 3: amphitheater, greenhouse_garden, animal_pens_farm, cabin_house, campground
    amphitheater: { row: 3, col: 0 },
    greenhouse_garden: { row: 3, col: 1 },
    animal_pens_farm: { row: 3, col: 2 },
    cabin_house: { row: 3, col: 3 },
    campground: { row: 3, col: 4 },
    // Row 4: marina_docks_small, pier_large, beach_tile(skip), pier_broken(skip), roller_coaster_small
    marina_docks_small: { row: 4, col: 0 },
    pier_large: { row: 4, col: 1 },
    roller_coaster_small: { row: 4, col: 4 },
    // Row 5: community_garden, pond_park, park_gate, mountain_lodge, mountain_trailhead
    community_garden: { row: 5, col: 0 },
    pond_park: { row: 5, col: 1 },
    park_gate: { row: 5, col: 2 },
    mountain_lodge: { row: 5, col: 3 },
    mountain_trailhead: { row: 5, col: 4 },
  },
  parksVerticalOffsets: {
    // Same approach as denseVerticalOffsets - adjust as needed for proper positioning
    basketball_courts: -0.25,
    playground_small: -0.25,  // shifted up 0.1
    playground_large: -0.60,  // shifted down 0.05 from -0.65
    baseball_field_small: -0.55,  // shifted down 0.3 from -0.85
    soccer_field_small: -0.20,  // shifted up slightly
    football_field: -0.55,  // shifted down 0.3
    baseball_stadium: -1.35,  // adjusted for scale, moved up 0.5 tiles, shifted down 0.15 tiles
    community_center: -0.2,
    office_building_small: -0.3,
    swimming_pool: -0.20,  // shifted up slightly
    skate_park: -0.25,  // shifted up 0.1 tiles
    mini_golf_course: -0.60,  // shifted up 0.05 tiles from -0.55
    bleachers_field: -0.2,  // shifted down 0.1 tiles from -0.3
    go_kart_track: -0.30,  // shifted down 0.1 tiles from -0.40
    amphitheater: -0.40,  // shifted down 0.05 tiles from -0.45
    greenhouse_garden: -0.75,  // shifted up 0.2 tiles from -0.55
    animal_pens_farm: -0.25,  // shifted up 0.1 tiles
    cabin_house: -0.2,
    campground: -0.15,
    marina_docks_small: -0.45,  // 2x2 building, shifted up 0.7 tiles from 0.25
    pier_large: -0.1,  // 1x1 building, shifted down 0.1 tiles from -0.2
    roller_coaster_small: -0.50,  // shifted up 0.15 tiles from -0.35
    community_garden: -0.15,
    pond_park: -0.15,  // shifted down 0.08 tiles from -0.23
    park_gate: -0.15,
    mountain_lodge: -0.55,  // shifted down 0.3 from -0.85
    mountain_trailhead: -1.0,  // 3x3, shifted down 0.5 tiles
  },
  parksHorizontalOffsets: {
    // swimming_pool: centered (no offset)
  },
  parksScales: {
    baseball_stadium: 0.81,  // 10% smaller than 0.90
    baseball_field_small: 0.855,  // scaled down 10% from 0.95
    basketball_courts: 0.9,  // scaled down 10%
    football_field: 0.855,  // scaled down 5% (from 0.9)
    swimming_pool: 0.90,  // scaled down 10% total (5% more from 0.95)
    soccer_field_small: 0.95,  // scaled down 5%
    go_kart_track: 0.92,  // scaled down 8%
    mini_golf_course: 0.95,  // scaled down 5%
    amphitheater: 0.90,  // scaled down 10%
    greenhouse_garden: 0.90,  // scaled down 10%
  },
  parksConstructionVerticalOffsets: {
    baseball_field_small: -0.55,  // shifted down 0.3 from normal -0.85
    mountain_lodge: -0.55,  // shifted down 0.3 from normal -0.85
  },
};

export const SPRITES4_FARMS_CONFIG: Partial<SpritePack> = {
  // Farms sprite sheet configuration (variants for low-density industrial)
  farmsSrc: '/assets/sprites_red_water_new_farm.png',
  farmsCols: 5,
  farmsRows: 6,
  farmsVariants: {
    // Farm sprites for 1x1 low-density industrial (factory_small only)
    // Excluding rows 2, 3, 4 which have clipping issues (assets bleed from row above)
    factory_small: [
      // Row 0 (top row - no clipping possible)
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
      // Row 1 (verified OK)
      { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 },
      // Row 5 (bottom row)
      { row: 5, col: 0 }, { row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 }, { row: 5, col: 4 },
    ],
  },
  farmsVerticalOffsets: {
    // Adjust these as needed for proper positioning
    factory_small: -0.25,
  },
  farmsHorizontalOffsets: {},
  farmsScales: {},
};

export const SPRITES4_SHOPS_CONFIG: Partial<SpritePack> = {
  // Shops sprite sheet configuration (variants for shop_small and shop_medium)
  shopsSrc: '/assets/sprites_red_water_new_shops.png',
  shopsCols: 5,
  shopsRows: 6,
  shopsVariants: {
    // Shop sprites for 1x1 low-density commercial (shop_small and shop_medium)
    // Available rows: 0, 1 (except col 0), 3 (except col 3), 4, 5 (except col 4)
    shop_small: [
      // Row 0 (entire row)
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
      // Row 1 (except col 0)
      { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 },
      // Row 3 (except col 3)
      { row: 3, col: 0 }, { row: 3, col: 1 },
    ],
    shop_medium: [
      // Row 3 (except col 3) - continued
      { row: 3, col: 2 }, { row: 3, col: 4 },
      // Row 4 (entire row)
      { row: 4, col: 0 }, { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 }, { row: 4, col: 4 },
      // Row 5 (except cols 1, 3, and 4)
      { row: 5, col: 0 }, { row: 5, col: 2 },
    ],
  },
  shopsVerticalOffsets: {
    // Shifted up 0.1 from -0.25
    shop_small: -0.35,
    shop_medium: -0.35,
  },
  shopsHorizontalOffsets: {},
  shopsScales: {
    shop_small: 0.90,  // Scale down 10% total
    shop_medium: 0.90, // Scale down 10% total
  },
};

export const SPRITES4_STATIONS_CONFIG: Partial<SpritePack> = {
  // Stations sprite sheet configuration (rail station variants)
  stationsSrc: '/assets/sprites_red_water_new_stations.png',
  stationsCols: 5,
  stationsRows: 6,
  stationsVariants: {
    // Rail station sprites (2x2 buildings)
    // Row 2 (3rd row): cols 0, 1, 2
    // Row 3 (4th row): cols 2, 3
    // Row 4 (5th row): cols 1, 2, 3
    // Row 5 (6th row): cols 0, 1
    rail_station: [
      // Third row, columns 1-3 (0-indexed: row 2, cols 0-2)
      { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 },
      // Fourth row, columns 3-4 (0-indexed: row 3, cols 2-3)
      { row: 3, col: 2 }, { row: 3, col: 3 },
      // Fifth row, columns 2-4 (0-indexed: row 4, cols 1-3)
      { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 },
      // Sixth row, columns 1-2 (0-indexed: row 5, cols 0-1)
      { row: 5, col: 0 }, { row: 5, col: 1 },
    ],
  },
  stationsVerticalOffsets: {
    rail_station: -0.6, // Shift up to align with 2x2 building footprint
  },
  stationsHorizontalOffsets: {},
  stationsScales: {
    rail_station: 0.85, // Scale down 15% for better fit
  },
};
