import type { SpritePack } from '../types';
import {
  SPRITES4_MODERN_CONFIG,
  SPRITES4_PARKS_CONFIG,
  SPRITES4_FARMS_CONFIG,
  SPRITES4_SHOPS_CONFIG,
  SPRITES4_STATIONS_CONFIG,
} from './sprites4Variants';

// ============================================================================
// SPRITE PACK: SPRITES4 (Default)
// ============================================================================
export const SPRITE_PACK_SPRITES4: SpritePack = {
  id: 'sprites4',
  name: 'Default Theme',
  src: '/assets/sprites_red_water_new.png',
  constructionSrc: '/assets/sprites_red_water_new_construction.png',
  abandonedSrc: '/assets/sprites_red_water_new_abandoned.png',
  denseSrc: '/assets/sprites_red_water_new_dense.png',
  denseVariants: {
    // Residential high density (apartment_high) - Row 1, columns 2, 3, 4 (0-indexed: 1, 2, 3)
    apartment_high: [
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ],
    // Commercial high density (mall) - Rows 3 and 4, all columns (0-indexed: rows 2, 3)
    mall: [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 3, col: 0 },
      { row: 3, col: 1 },
      { row: 3, col: 2 },
      { row: 3, col: 3 },
      { row: 3, col: 4 },
    ],
    // Industrial high density (factory_large) - Row 5, columns 1, 3, 5 (0-indexed: row 4, cols 0, 2, 4)
    factory_large: [
      { row: 4, col: 0 },
      { row: 4, col: 2 },
      { row: 4, col: 4 },
    ],
  },
  cols: 5,
  rows: 6,
  layout: 'row',
  globalScale: 0.8, // Scale down all buildings by 20%
  spriteOrder: [
    // Row 0 (indices 0-4, 5 columns)
    'residential',
    'commercial',
    'industrial',
    'fire_station',
    'hospital',
    // Row 1 (indices 5-9, 5 columns)
    'park',
    'park_large',
    'tennis',
    'police_station',
    'school',
    // Row 2 (indices 10-14, 5 columns)
    'university',
    'water_tower',
    'power_plant',
    'stadium',
    'space_program',
    // Row 3 (indices 15-19, 5 columns)
    'tree',
    'house_medium',
    'mansion',
    'house_small',
    'shop_medium',
    // Row 4 (indices 20-24, 5 columns)
    'shop_small',
    'warehouse',
    'factory_small',
    'factory_medium',
    'factory_large',
    // Row 5 (indices 25-29, 5 columns)
    'airport',
    'subway_station',
    'city_hall',
    'museum',
    'amusement_park',
  ] as const,
  verticalOffsets: {
    // Move sprites up (negative values) or down (positive values)
    // Values are multiplied by tile height
    residential: -0.4,
    commercial: -0.4,
    industrial: -0.5, // Shift factories down about half a tile from previous
    factory_small: -0.25, // Shift factory_small down 1/4 tile (relative to others)
    factory_medium: -0.3, // Shifted down 0.2 from -0.5
    factory_large: -1.15, // Shifted up 0.3 from -0.85 (cropped bottom, shifted up)
    water_tower: -0.5,
    house_medium: -0.3,
    mansion: -0.35,
    house_small: -0.3,
    shop_medium: -0.15, // Shift down a tiny bit (less up than before)
    shop_small: -0.3,
    warehouse: -0.4,
    airport: -1.5, // Original position
    water: -0.2,
    subway_station: -0.4, // Shifted up 0.2 tiles
    fire_station: -0.3, // Shifted up 0.1 tiles
    police_station: -0.2, // Shifted up 0.1 tiles
    hospital: -0.65, // Shift up (reduced from previous), shifted up 0.15 tiles
    school: -0.35, // Shifted down 0.05 tiles from -0.4
    power_plant: -0.3, // Shift up
    park: -0.125, // Adjusted position
    park_large: -0.85, // Shift up significantly (almost an entire tile)
    tennis: -0.2, // Shifted up 0.1 tiles from -0.1
    city_hall: -0.6, // Shift up about 0.2 tiles
    amusement_park: -1.5, // Shift up about 1 tile
    space_program: -0.95, // Shifted down 0.05 tiles
    university: -0.55, // Shift up a tiny bit
    stadium: -1.2, // Shift up a ton
    museum: -1.0, // Shift up 1 tile
    tree: -0.3, // Shift up 0.3 tiles
  },
  horizontalOffsets: {
    university: 0.0, // Shift right a tiny tiny bit more
    city_hall: 0.1, // Shift right about 0.2 tiles
  },
  buildingVerticalOffsets: {
    // Small houses
    house_small: -0.2, // Shifted up a bit
    house_medium: -0.05, // Was -0.3 from verticalOffsets, shifted down 0.25
    // 2x2 commercial buildings
    office_low: -0.7, // Shifted up 0.2 from -0.5
    office_high: -0.7, // Shifted down 0.3 tiles from -1.0
    // 3x3 mall needs to shift up ~1.5 tiles (non-dense)
    mall: -1.5,
    // 2x2 residential apartments need shifting up
    apartment_low: -0.6,  // shifted down 0.4 from -1.0
    apartment_high: -0.60, // Shifted down ~0.4 tiles from -1.0
  },
  constructionVerticalOffsets: {
    water_tower: -0.1, // Construction water tower shifted up 0.1 tiles
    apartment_high: -0.4, // Construction apartment_high shifted up 3 tiles from previous (2.6 - 3.0 = -0.4)
    apartment_low: -0.5, // Construction apartment_low shifted up 0.5 tiles from previous (0.3 - 0.5 = -0.2), moved up 0.3 tiles
    mall: -1.0, // Construction mall shifted up 0.8 tiles from previous (-0.2 - 0.8 = -1.0)
    office_high: -0.5, // Construction office_high shifted up 0.5 tiles from previous (0.3 - 0.5 = -0.2), moved up 0.3 tiles
    office_low: -0.4, // Construction office_low shifted down 0.1 tiles from previous (-0.5 + 0.1 = -0.4)
    hospital: -0.7, // Construction hospital shifted up 0.8 tiles
    tennis: -0.2, // Construction tennis shifted up 0.1 tiles from normal -0.1
  },
  constructionScales: {
    mall: 0.92, // Construction mall scaled down 8%
    office_high: 0.80, // Construction office_high scaled down 20%
    apartment_high: 0.65, // Construction apartment_high scaled down 35%
    apartment_low: 0.80, // Construction apartment_low scaled down 20%
  },
  abandonedVerticalOffsets: {
    // Abandoned apartments need different positioning than normal
    apartment_low: -0.45, // Normal is -1.0, abandoned shifts down 0.75: -1.0 + 0.75 = -0.25, moved up 0.2 tiles
    apartment_high: -0.35, // Shifted up 0.3 from previous 0.15, moved up 0.2 tiles
    house_medium: -0.05, // Normal is -0.05, abandoned matches normal position (moved up 0.5 tiles from 0.35, then down 0.1 tiles)
    house_small: -0.05, // Normal is -0.2, abandoned shifted up 0.15 tiles to match house_medium adjustment
    mansion: -0.25, // Normal is -0.35, abandoned shifted down 0.1 tiles (-0.35 + 0.1 = -0.25)
    office_high: -0.2, // Normal is -0.7, abandoned shifted down 0.5 tiles (-0.7 + 0.5 = -0.2)
    tree: -0.3, // Abandoned tree moved up 0.3 tiles
    factory_small: -0.05, // Normal is -0.25, shifted down 0.2 tiles
  },
  abandonedScales: {
    // Abandoned factory_large needs to be scaled down 30%
    factory_large: 0.7,
  },
  denseVerticalOffsets: {
    // Dense apartment_high shifted up 0.2 tiles from -0.60
    apartment_high: -0.80, // Shifted up 0.2 tiles from -0.60
    factory_large: -1.15, // Dense variant shifted up 0.1 tiles from -1.05
    mall: -1.0, // Dense mall stays at original position (non-dense moved to -1.5)
  },
  denseScales: {
    // Dense apartment_high scaled down 10% total (5% more from 0.95)
    apartment_high: 0.90,
  },
  buildingToSprite: {
    house_small: 'house_small',
    house_medium: 'house_medium',
    mansion: 'mansion',
    apartment_low: 'residential',
    apartment_high: 'residential',
    shop_small: 'shop_small',
    shop_medium: 'shop_medium',
    office_low: 'commercial',
    office_high: 'commercial',
    mall: 'commercial',
    factory_small: 'factory_small',
    factory_medium: 'factory_medium',
    factory_large: 'factory_large',
    warehouse: 'warehouse',
    police_station: 'police_station',
    fire_station: 'fire_station',
    hospital: 'hospital',
    school: 'school',
    university: 'university',
    park: 'park',
    park_large: 'park_large',
    tennis: 'tennis',
    power_plant: 'power_plant',
    water_tower: 'water_tower',
    stadium: 'stadium',
    museum: 'museum',
    airport: 'airport',
    space_program: 'space_program',
    tree: 'tree',
    water: 'water',
    subway_station: 'subway_station',
    // rail_station uses stationsVariants from the stations sprite sheet
    city_hall: 'city_hall',
    amusement_park: 'amusement_park',
  },
  // Merge in variant configurations
  ...SPRITES4_MODERN_CONFIG,
  ...SPRITES4_PARKS_CONFIG,
  ...SPRITES4_FARMS_CONFIG,
  ...SPRITES4_SHOPS_CONFIG,
  ...SPRITES4_STATIONS_CONFIG,
};
