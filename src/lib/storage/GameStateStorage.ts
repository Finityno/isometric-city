// Main game state storage (autosave)

import { GameState } from '@/types/game';
import { getJSON, setJSON, removeItem } from './localStorage';
import { migrateGameState } from './migrations';
import { serializeGameState, isValidGameState } from './serialization';

const STORAGE_KEY = 'isocity-game-state';

/**
 * Load the main game state from localStorage
 */
export function loadGameState(): GameState | null {
  const saved = getJSON<unknown>(STORAGE_KEY);

  if (!saved) return null;

  if (!isValidGameState(saved)) {
    // Invalid format, clear it
    removeItem(STORAGE_KEY);
    return null;
  }

  // Apply migrations to ensure compatibility
  return migrateGameState(saved);
}

/**
 * Save the main game state to localStorage
 */
export function saveGameState(state: GameState): void {
  if (!state?.grid || !state?.gridSize || !state?.stats) {
    console.error('Invalid game state, not saving');
    return;
  }

  const serialized = serializeGameState(state);
  if (!serialized) return;

  setJSON(STORAGE_KEY, state);
}

/**
 * Clear the main game state from localStorage
 */
export function clearGameState(): void {
  removeItem(STORAGE_KEY);
}
