// Game state serialization helpers

import { GameState } from '@/types/game';

/**
 * Size limit for localStorage items (5MB)
 */
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Extract only GameState properties from a store state
 * This is used to filter out UI-only state before saving
 */
export function extractGameStateFromStore(state: {
  id: string;
  grid: GameState['grid'];
  gridSize: number;
  cityName: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  tick: number;
  speed: 0 | 1 | 2 | 3;
  selectedTool: GameState['selectedTool'];
  taxRate: number;
  effectiveTaxRate: number;
  stats: GameState['stats'];
  budget: GameState['budget'];
  services: GameState['services'];
  notifications: GameState['notifications'];
  advisorMessages: GameState['advisorMessages'];
  history: GameState['history'];
  activePanel: GameState['activePanel'];
  disastersEnabled: boolean;
  adjacentCities: GameState['adjacentCities'];
  waterBodies: GameState['waterBodies'];
  gameVersion: number;
}): GameState {
  return {
    id: state.id,
    grid: state.grid,
    gridSize: state.gridSize,
    cityName: state.cityName,
    year: state.year,
    month: state.month,
    day: state.day,
    hour: state.hour,
    tick: state.tick,
    speed: state.speed,
    selectedTool: state.selectedTool,
    taxRate: state.taxRate,
    effectiveTaxRate: state.effectiveTaxRate,
    stats: state.stats,
    budget: state.budget,
    services: state.services,
    notifications: state.notifications,
    advisorMessages: state.advisorMessages,
    history: state.history,
    activePanel: state.activePanel,
    disastersEnabled: state.disastersEnabled,
    adjacentCities: state.adjacentCities,
    waterBodies: state.waterBodies,
    gameVersion: state.gameVersion,
  };
}

/**
 * Validate that a game state has all required fields
 */
export function isValidGameState(state: unknown): state is GameState {
  if (!state || typeof state !== 'object') return false;

  const s = state as Partial<GameState>;

  return (
    s.grid !== undefined &&
    Array.isArray(s.grid) &&
    s.gridSize !== undefined &&
    typeof s.gridSize === 'number' &&
    s.stats !== undefined &&
    s.stats.money !== undefined &&
    s.stats.population !== undefined
  );
}

/**
 * Serialize game state to JSON string
 */
export function serializeGameState(state: GameState): string | null {
  try {
    const serialized = JSON.stringify(state);

    // Check size limit
    if (serialized.length > MAX_SIZE_BYTES) {
      console.error('Game state exceeds maximum size limit');
      return null;
    }

    return serialized;
  } catch (e) {
    console.error('Failed to serialize game state:', e);
    return null;
  }
}

/**
 * Deserialize game state from JSON string
 */
export function deserializeGameState(json: string): GameState | null {
  try {
    const parsed = JSON.parse(json);

    if (!isValidGameState(parsed)) {
      console.error('Invalid game state format');
      return null;
    }

    return parsed;
  } catch (e) {
    console.error('Failed to deserialize game state:', e);
    return null;
  }
}
