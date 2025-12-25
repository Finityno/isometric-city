// Multi-city save system

import { GameState, SavedCityMeta } from '@/types/game';
import { getJSON, setJSON, removeItem } from './localStorage';
import { migrateGameState } from './migrations';
import { serializeGameState, isValidGameState } from './serialization';

const SAVED_CITIES_INDEX_KEY = 'isocity-saved-cities-index';
const SAVED_CITY_PREFIX = 'isocity-city-';

/**
 * Get the list of all saved cities metadata
 */
export function getSavedCities(): SavedCityMeta[] {
  const saved = getJSON<unknown>(SAVED_CITIES_INDEX_KEY);

  if (!saved || !Array.isArray(saved)) {
    return [];
  }

  return saved as SavedCityMeta[];
}

/**
 * Update the saved cities index
 */
export function saveSavedCitiesIndex(cities: SavedCityMeta[]): void {
  setJSON(SAVED_CITIES_INDEX_KEY, cities);
}

/**
 * Save a city state to localStorage
 */
export function saveCity(cityId: string, state: GameState): void {
  const serialized = serializeGameState(state);
  if (!serialized) return;

  setJSON(SAVED_CITY_PREFIX + cityId, state);
}

/**
 * Load a specific city state from localStorage
 */
export function loadCity(cityId: string): GameState | null {
  const saved = getJSON<unknown>(SAVED_CITY_PREFIX + cityId);

  if (!saved) return null;

  if (!isValidGameState(saved)) {
    console.error(`Invalid city state for ID: ${cityId}`);
    return null;
  }

  // Apply migrations
  return migrateGameState(saved);
}

/**
 * Delete a specific city state from localStorage
 */
export function deleteCity(cityId: string): void {
  removeItem(SAVED_CITY_PREFIX + cityId);
}

/**
 * Save city for restoration (used for shared links)
 */
export function saveCityForRestore(state: GameState): void {
  const SAVED_CITY_STORAGE_KEY = 'isocity-saved-city';

  const savedData = {
    state,
    info: {
      cityName: state.cityName,
      population: state.stats.population,
      money: state.stats.money,
      savedAt: Date.now(),
    },
  };

  setJSON(SAVED_CITY_STORAGE_KEY, savedData);
}

/**
 * Load saved city info (for restoration preview)
 */
export function loadSavedCityInfo(): {
  cityName: string;
  population: number;
  money: number;
  savedAt: number;
} | null {
  const SAVED_CITY_STORAGE_KEY = 'isocity-saved-city';

  const saved = getJSON<{
    info?: {
      cityName: string;
      population: number;
      money: number;
      savedAt: number;
    };
  }>(SAVED_CITY_STORAGE_KEY);

  if (!saved?.info) return null;

  return saved.info;
}

/**
 * Load saved city state (for restoration)
 */
export function loadSavedCityState(): GameState | null {
  const SAVED_CITY_STORAGE_KEY = 'isocity-saved-city';

  const saved = getJSON<{ state?: unknown }>(SAVED_CITY_STORAGE_KEY);

  if (!saved?.state) return null;

  if (!isValidGameState(saved.state)) {
    console.error('Invalid saved city state format');
    return null;
  }

  return saved.state;
}

/**
 * Clear saved city storage (for restoration)
 */
export function clearSavedCityStorage(): void {
  const SAVED_CITY_STORAGE_KEY = 'isocity-saved-city';
  removeItem(SAVED_CITY_STORAGE_KEY);
}
