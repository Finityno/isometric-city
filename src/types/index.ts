// Central type exports for IsoCity

// Building types
export type { BuildingType, Building, BuildingStats } from './buildings';

// Simulation types
export type {
  Stats,
  Budget,
  BudgetCategory,
  ServiceCoverage,
  Notification,
  AdvisorMessage,
  HistoryPoint,
  AdjacentCity,
  WaterBody,
} from './simulation';

// Core game types
export type {
  ZoneType,
  Tool,
  ToolInfo,
  Tile,
  GameState,
  SavedCityMeta,
} from './game';

// Re-export constants from data directory for convenience
export { TOOL_INFO, RESIDENTIAL_BUILDINGS, COMMERCIAL_BUILDINGS, INDUSTRIAL_BUILDINGS, BUILDING_STATS } from '@/data';
