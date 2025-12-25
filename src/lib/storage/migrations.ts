// Data migration logic for game state versioning

import { GameState } from '@/types/game';

/**
 * Generate a UUID for game states that don't have one
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Apply all necessary migrations to a loaded game state
 * This ensures backward compatibility with older save formats
 */
export function migrateGameState(state: GameState): GameState {
  // Migrate park_medium to park_large (old building type was removed)
  if (state.grid) {
    for (let y = 0; y < state.grid.length; y++) {
      for (let x = 0; x < state.grid[y].length; x++) {
        const tile = state.grid[y][x];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (tile?.building?.type === ('park_medium' as any)) {
          tile.building.type = 'park_large';
        }
        // Add constructionProgress field if missing
        if (tile?.building && tile.building.constructionProgress === undefined) {
          tile.building.constructionProgress = 100;
        }
        // Add abandoned field if missing
        if (tile?.building && tile.building.abandoned === undefined) {
          tile.building.abandoned = false;
        }
      }
    }
  }

  // Migrate selected tool if it was park_medium
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (state.selectedTool === ('park_medium' as any)) {
    state.selectedTool = 'park_large';
  }

  // Add adjacentCities if missing
  if (!state.adjacentCities) {
    state.adjacentCities = [];
  }

  // Add discovered field to adjacent cities
  for (const city of state.adjacentCities) {
    if (city.discovered === undefined) {
      city.discovered = true;
    }
  }

  // Add waterBodies if missing
  if (!state.waterBodies) {
    state.waterBodies = [];
  }

  // Add hour field if missing (for day/night cycle)
  if (state.hour === undefined) {
    state.hour = 12;
  }

  // Add effectiveTaxRate if missing
  if (state.effectiveTaxRate === undefined) {
    state.effectiveTaxRate = state.taxRate ?? 9;
  }

  // Add gameVersion if missing
  if (state.gameVersion === undefined) {
    state.gameVersion = 0;
  }

  // Add unique ID if missing
  if (!state.id) {
    state.id = generateUUID();
  }

  return state;
}
