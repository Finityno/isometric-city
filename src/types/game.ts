// Game type definitions for IsoCity

export type BuildingType =
  | 'empty'
  | 'grass'
  | 'water'
  | 'road'
  | 'rail'
  | 'tree'
  // Residential
  | 'house_small'
  | 'house_medium'
  | 'mansion'
  | 'apartment_low'
  | 'apartment_high'
  // Commercial
  | 'shop_small'
  | 'shop_medium'
  | 'office_low'
  | 'office_high'
  | 'mall'
  // Industrial
  | 'factory_small'
  | 'factory_medium'
  | 'factory_large'
  | 'warehouse'
  // Services
  | 'police_station'
  | 'fire_station'
  | 'hospital'
  | 'school'
  | 'university'
  | 'park'
  | 'park_large'
  | 'tennis'
  // Utilities
  | 'power_plant'
  | 'water_tower'
  // Transportation
  | 'subway_station'
  | 'rail_station'
  // Special
  | 'stadium'
  | 'museum'
  | 'airport'
  | 'space_program'
  | 'city_hall'
  | 'amusement_park'
  // Parks (new sprite sheet)
  | 'basketball_courts'
  | 'playground_small'
  | 'playground_large'
  | 'baseball_field_small'
  | 'soccer_field_small'
  | 'football_field'
  | 'baseball_stadium'
  | 'community_center'
  | 'office_building_small'
  | 'swimming_pool'
  | 'skate_park'
  | 'mini_golf_course'
  | 'bleachers_field'
  | 'go_kart_track'
  | 'amphitheater'
  | 'greenhouse_garden'
  | 'animal_pens_farm'
  | 'cabin_house'
  | 'campground'
  | 'marina_docks_small'
  | 'pier_large'
  | 'roller_coaster_small'
  | 'community_garden'
  | 'pond_park'
  | 'park_gate'
  | 'mountain_lodge'
  | 'mountain_trailhead';

export type ZoneType = 'none' | 'residential' | 'commercial' | 'industrial';

export type Tool =
  | 'select'
  | 'bulldoze'
  | 'road'
  | 'rail'
  | 'subway'
  | 'tree'
  | 'zone_residential'
  | 'zone_commercial'
  | 'zone_industrial'
  | 'zone_dezone'
  | 'police_station'
  | 'fire_station'
  | 'hospital'
  | 'school'
  | 'university'
  | 'park'
  | 'park_large'
  | 'tennis'
  | 'power_plant'
  | 'water_tower'
  | 'subway_station'
  | 'rail_station'
  | 'stadium'
  | 'museum'
  | 'airport'
  | 'space_program'
  | 'city_hall'
  | 'amusement_park'
  // Park tools (new sprite sheet)
  | 'basketball_courts'
  | 'playground_small'
  | 'playground_large'
  | 'baseball_field_small'
  | 'soccer_field_small'
  | 'football_field'
  | 'baseball_stadium'
  | 'community_center'
  | 'office_building_small'
  | 'swimming_pool'
  | 'skate_park'
  | 'mini_golf_course'
  | 'bleachers_field'
  | 'go_kart_track'
  | 'amphitheater'
  | 'greenhouse_garden'
  | 'animal_pens_farm'
  | 'cabin_house'
  | 'campground'
  | 'marina_docks_small'
  | 'pier_large'
  | 'roller_coaster_small'
  | 'community_garden'
  | 'pond_park'
  | 'park_gate'
  | 'mountain_lodge'
  | 'mountain_trailhead';

// ToolInfo interface - the constant TOOL_INFO has been moved to src/data/toolInfo.ts
export interface ToolInfo {
  name: string;
  cost: number;
  description: string;
  size?: number;
}

export interface Building {
  type: BuildingType;
  level: number;
  population: number;
  jobs: number;
  powered: boolean;
  watered: boolean;
  onFire: boolean;
  fireProgress: number;
  age: number;
  constructionProgress: number; // 0-100, building is under construction until 100
  abandoned: boolean; // Building is abandoned due to low demand, produces nothing
  flipped?: boolean; // Horizontally mirror the sprite (used for waterfront buildings to face water)
  // PERF: For 'empty' placeholder tiles in multi-tile buildings, store origin coordinates
  // This avoids O(16) backward search in findBuildingOrigin
  originX?: number;
  originY?: number;
}

export interface Tile {
  x: number;
  y: number;
  zone: ZoneType;
  building: Building;
  landValue: number;
  pollution: number;
  crime: number;
  traffic: number;
  hasSubway: boolean;
  hasRailOverlay?: boolean; // Rail tracks overlaid on road (road base with rail tracks on top)
}

export interface Stats {
  population: number;
  jobs: number;
  money: number;
  income: number;
  expenses: number;
  happiness: number;
  health: number;
  education: number;
  safety: number;
  environment: number;
  demand: {
    residential: number;
    commercial: number;
    industrial: number;
  };
}

export interface BudgetCategory {
  name: string;
  funding: number;
  cost: number;
}

export interface Budget {
  police: BudgetCategory;
  fire: BudgetCategory;
  health: BudgetCategory;
  education: BudgetCategory;
  transportation: BudgetCategory;
  parks: BudgetCategory;
  power: BudgetCategory;
  water: BudgetCategory;
}

export interface ServiceCoverage {
  police: number[][];
  fire: number[][];
  health: number[][];
  education: number[][];
  power: boolean[][];
  water: boolean[][];
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  icon: string;
  timestamp: number;
}

export interface AdvisorMessage {
  name: string;
  icon: string;
  messages: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface HistoryPoint {
  year: number;
  month: number;
  population: number;
  money: number;
  happiness: number;
}

export interface AdjacentCity {
  id: string;
  name: string;
  direction: 'north' | 'south' | 'east' | 'west';
  connected: boolean;
  discovered: boolean; // City becomes discovered when a road reaches its edge
}

export interface WaterBody {
  id: string;
  name: string;
  type: 'lake' | 'ocean';
  tiles: { x: number; y: number }[];
  centerX: number;
  centerY: number;
}

export interface GameState {
  id: string; // Unique UUID for this game
  grid: Tile[][];
  gridSize: number;
  cityName: string;
  year: number;
  month: number;
  day: number;
  hour: number; // 0-23 for day/night cycle
  tick: number;
  speed: 0 | 1 | 2 | 3;
  selectedTool: Tool;
  taxRate: number;
  effectiveTaxRate: number; // Lagging tax rate that gradually moves toward taxRate (affects demand)
  stats: Stats;
  budget: Budget;
  services: ServiceCoverage;
  notifications: Notification[];
  advisorMessages: AdvisorMessage[];
  history: HistoryPoint[];
  activePanel: 'none' | 'budget' | 'statistics' | 'advisors' | 'settings';
  disastersEnabled: boolean;
  adjacentCities: AdjacentCity[];
  waterBodies: WaterBody[];
  gameVersion: number; // Increments when a new game starts - used to clear transient state like vehicles
}

// Saved city metadata for the multi-save system
export interface SavedCityMeta {
  id: string; // Same as GameState.id
  cityName: string;
  population: number;
  money: number;
  year: number;
  month: number;
  gridSize: number;
  savedAt: number; // timestamp
}
