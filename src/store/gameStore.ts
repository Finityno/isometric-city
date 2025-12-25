// Zustand store for game state - replaces GameContext
'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  Budget,
  BuildingType,
  GameState,
  SavedCityMeta,
  Tool,
  TOOL_INFO,
  ZoneType,
} from '@/types/game';
import {
  bulldozeTile,
  createInitialGameState,
  DEFAULT_GRID_SIZE,
  placeBuilding,
  placeSubway,
  simulateTick,
  checkForDiscoverableCities,
  generateRandomAdvancedCity,
} from '@/lib/simulation';
import {
  SPRITE_PACKS,
  DEFAULT_SPRITE_PACK_ID,
  getSpritePack,
  setActiveSpritePack,
  SpritePack,
} from '@/lib/renderConfig';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'isocity-game-state';
const SAVED_CITY_STORAGE_KEY = 'isocity-saved-city';
const SAVED_CITIES_INDEX_KEY = 'isocity-saved-cities-index';
const SAVED_CITY_PREFIX = 'isocity-city-';
const SPRITE_PACK_STORAGE_KEY = 'isocity-sprite-pack';
const DAY_NIGHT_MODE_STORAGE_KEY = 'isocity-day-night-mode';

// ============================================================================
// TYPES
// ============================================================================

export type DayNightMode = 'auto' | 'day' | 'night';

export type SavedCityInfo = {
  cityName: string;
  population: number;
  money: number;
  savedAt: number;
} | null;

// Tool -> Building mapping
const toolBuildingMap: Partial<Record<Tool, BuildingType>> = {
  road: 'road',
  rail: 'rail',
  rail_station: 'rail_station',
  tree: 'tree',
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
  subway_station: 'subway_station',
  stadium: 'stadium',
  museum: 'museum',
  airport: 'airport',
  space_program: 'space_program',
  city_hall: 'city_hall',
  amusement_park: 'amusement_park',
  basketball_courts: 'basketball_courts',
  playground_small: 'playground_small',
  playground_large: 'playground_large',
  baseball_field_small: 'baseball_field_small',
  soccer_field_small: 'soccer_field_small',
  football_field: 'football_field',
  baseball_stadium: 'baseball_stadium',
  community_center: 'community_center',
  office_building_small: 'office_building_small',
  swimming_pool: 'swimming_pool',
  skate_park: 'skate_park',
  mini_golf_course: 'mini_golf_course',
  bleachers_field: 'bleachers_field',
  go_kart_track: 'go_kart_track',
  amphitheater: 'amphitheater',
  greenhouse_garden: 'greenhouse_garden',
  animal_pens_farm: 'animal_pens_farm',
  cabin_house: 'cabin_house',
  campground: 'campground',
  marina_docks_small: 'marina_docks_small',
  pier_large: 'pier_large',
  roller_coaster_small: 'roller_coaster_small',
  community_garden: 'community_garden',
  pond_park: 'pond_park',
  park_gate: 'park_gate',
  mountain_lodge: 'mountain_lodge',
  mountain_trailhead: 'mountain_trailhead',
};

const toolZoneMap: Partial<Record<Tool, ZoneType>> = {
  zone_residential: 'residential',
  zone_commercial: 'commercial',
  zone_industrial: 'industrial',
  zone_dezone: 'none',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

// ============================================================================
// LOCALSTORAGE FUNCTIONS
// ============================================================================

function loadGameState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.grid && Array.isArray(parsed.grid) && parsed.gridSize &&
          typeof parsed.gridSize === 'number' && parsed.stats &&
          parsed.stats.money !== undefined && parsed.stats.population !== undefined) {
        // Migrations
        if (parsed.grid) {
          for (let y = 0; y < parsed.grid.length; y++) {
            for (let x = 0; x < parsed.grid[y].length; x++) {
              if (parsed.grid[y][x]?.building?.type === 'park_medium') {
                parsed.grid[y][x].building.type = 'park_large';
              }
              if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.constructionProgress === undefined) {
                parsed.grid[y][x].building.constructionProgress = 100;
              }
              if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.abandoned === undefined) {
                parsed.grid[y][x].building.abandoned = false;
              }
            }
          }
        }
        if (parsed.selectedTool === 'park_medium') {
          parsed.selectedTool = 'park_large';
        }
        if (!parsed.adjacentCities) parsed.adjacentCities = [];
        for (const city of parsed.adjacentCities) {
          if (city.discovered === undefined) city.discovered = true;
        }
        if (!parsed.waterBodies) parsed.waterBodies = [];
        if (parsed.hour === undefined) parsed.hour = 12;
        if (parsed.effectiveTaxRate === undefined) parsed.effectiveTaxRate = parsed.taxRate ?? 9;
        if (parsed.gameVersion === undefined) parsed.gameVersion = 0;
        if (!parsed.id) parsed.id = generateUUID();
        return parsed as GameState;
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (e) {
    console.error('Failed to load game state:', e);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
  return null;
}

function saveGameState(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    if (!state?.grid || !state?.gridSize || !state?.stats) return;
    const serialized = JSON.stringify(state);
    if (serialized.length > 5 * 1024 * 1024) return;
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e) {
    if (e instanceof DOMException && (e.code === 22 || e.code === 1014)) {
      console.error('localStorage quota exceeded');
    } else {
      console.error('Failed to save game state:', e);
    }
  }
}

function clearGameState(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function loadSpritePackId(): string {
  if (typeof window === 'undefined') return DEFAULT_SPRITE_PACK_ID;
  try {
    const saved = localStorage.getItem(SPRITE_PACK_STORAGE_KEY);
    if (saved && SPRITE_PACKS.some(p => p.id === saved)) return saved;
  } catch {}
  return DEFAULT_SPRITE_PACK_ID;
}

function saveSpritePackId(packId: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SPRITE_PACK_STORAGE_KEY, packId); } catch {}
}

function loadDayNightMode(): DayNightMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const saved = localStorage.getItem(DAY_NIGHT_MODE_STORAGE_KEY);
    if (saved === 'auto' || saved === 'day' || saved === 'night') return saved;
  } catch {}
  return 'auto';
}

function saveDayNightMode(mode: DayNightMode): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(DAY_NIGHT_MODE_STORAGE_KEY, mode); } catch {}
}

function saveCityForRestore(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    const savedData = {
      state,
      info: {
        cityName: state.cityName,
        population: state.stats.population,
        money: state.stats.money,
        savedAt: Date.now(),
      },
    };
    localStorage.setItem(SAVED_CITY_STORAGE_KEY, JSON.stringify(savedData));
  } catch {}
}

function loadSavedCityInfo(): SavedCityInfo {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_CITY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.info) return parsed.info as SavedCityInfo;
    }
  } catch {}
  return null;
}

function loadSavedCityState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_CITY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.state?.grid && parsed.state?.gridSize && parsed.state?.stats) {
        return parsed.state as GameState;
      }
    }
  } catch {}
  return null;
}

function clearSavedCityStorage(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(SAVED_CITY_STORAGE_KEY); } catch {}
}

function loadSavedCitiesIndex(): SavedCityMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(SAVED_CITIES_INDEX_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed as SavedCityMeta[];
    }
  } catch {}
  return [];
}

function saveSavedCitiesIndex(cities: SavedCityMeta[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SAVED_CITIES_INDEX_KEY, JSON.stringify(cities)); } catch {}
}

function saveCityState(cityId: string, state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(state);
    if (serialized.length > 5 * 1024 * 1024) return;
    localStorage.setItem(SAVED_CITY_PREFIX + cityId, serialized);
  } catch {}
}

function loadCityState(cityId: string): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_CITY_PREFIX + cityId);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.grid && parsed?.gridSize && parsed?.stats) return parsed as GameState;
    }
  } catch {}
  return null;
}

function deleteCityState(cityId: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(SAVED_CITY_PREFIX + cityId); } catch {}
}

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface GameStoreState extends GameState {
  // Additional UI state
  hasExistingGame: boolean;
  isSaving: boolean;
  currentSpritePack: SpritePack;
  dayNightMode: DayNightMode;
  savedCities: SavedCityMeta[];

  // Computed values
  visualHour: number;

  // Internal flags
  _initialized: boolean;
  _skipNextSave: boolean;
}

interface GameStoreActions {
  // Initialization
  initialize: () => void;

  // Tool & UI
  setTool: (tool: Tool) => void;
  setSpeed: (speed: 0 | 1 | 2 | 3) => void;
  setTaxRate: (rate: number) => void;
  setActivePanel: (panel: GameState['activePanel']) => void;
  setBudgetFunding: (key: keyof Budget, funding: number) => void;

  // Building & Zoning
  placeAtTile: (x: number, y: number) => void;

  // Adjacent cities
  connectToCity: (cityId: string) => void;
  discoverCity: (cityId: string) => void;
  checkAndDiscoverCities: (onDiscover?: (city: { id: string; direction: 'north' | 'south' | 'east' | 'west'; name: string }) => void) => void;

  // Settings
  setDisastersEnabled: (enabled: boolean) => void;
  setSpritePack: (packId: string) => void;
  setDayNightMode: (mode: DayNightMode) => void;

  // Game lifecycle
  newGame: (name?: string, size?: number) => void;
  loadState: (stateString: string) => boolean;
  exportState: () => string;
  generateRandomCity: () => void;

  // Money & notifications
  addMoney: (amount: number) => void;
  addNotification: (title: string, description: string, icon: string) => void;

  // City save/restore (for shared links)
  saveCurrentCityForRestore: () => void;
  restoreSavedCity: () => boolean;
  getSavedCityInfo: () => SavedCityInfo;
  clearSavedCity: () => void;

  // Multi-city save system
  saveCity: () => void;
  loadSavedCity: (cityId: string) => boolean;
  deleteSavedCity: (cityId: string) => void;
  renameSavedCity: (cityId: string, newName: string) => void;

  // Internal
  _runSimulationTick: () => void;
  _setIsSaving: (isSaving: boolean) => void;
}

type GameStore = GameStoreState & GameStoreActions;

// ============================================================================
// CREATE STORE
// ============================================================================

const initialGameState = createInitialGameState(DEFAULT_GRID_SIZE, 'IsoCity');

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial game state
    ...initialGameState,

    // Additional UI state
    hasExistingGame: false,
    isSaving: false,
    currentSpritePack: getSpritePack(DEFAULT_SPRITE_PACK_ID),
    dayNightMode: 'auto' as DayNightMode,
    savedCities: [],

    // Computed
    get visualHour() {
      const state = get();
      return state.dayNightMode === 'auto' ? state.hour : state.dayNightMode === 'day' ? 12 : 22;
    },

    // Internal
    _initialized: false,
    _skipNextSave: false,

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    initialize: () => {
      const state = get();
      if (state._initialized) return;

      // Load sprite pack
      const savedPackId = loadSpritePackId();
      const pack = getSpritePack(savedPackId);
      setActiveSpritePack(pack);

      // Load day/night mode
      const savedDayNightMode = loadDayNightMode();

      // Load saved cities index
      const cities = loadSavedCitiesIndex();

      // Load game state
      const saved = loadGameState();

      if (saved) {
        set({
          ...saved,
          currentSpritePack: pack,
          dayNightMode: savedDayNightMode,
          savedCities: cities,
          hasExistingGame: true,
          _initialized: true,
          _skipNextSave: true,
        });
      } else {
        set({
          currentSpritePack: pack,
          dayNightMode: savedDayNightMode,
          savedCities: cities,
          hasExistingGame: false,
          _initialized: true,
        });
      }
    },

    // ========================================================================
    // TOOL & UI ACTIONS
    // ========================================================================

    setTool: (tool) => set({ selectedTool: tool, activePanel: 'none' }),

    setSpeed: (speed) => set({ speed }),

    setTaxRate: (rate) => set({ taxRate: clamp(rate, 0, 100) }),

    setActivePanel: (panel) => set({ activePanel: panel }),

    setBudgetFunding: (key, funding) => {
      const clamped = clamp(funding, 0, 100);
      set((state) => ({
        budget: {
          ...state.budget,
          [key]: { ...state.budget[key], funding: clamped },
        },
      }));
    },

    // ========================================================================
    // BUILDING & ZONING
    // ========================================================================

    placeAtTile: (x, y) => {
      set((state) => {
        const tool = state.selectedTool;
        if (tool === 'select') return state;

        const info = TOOL_INFO[tool];
        const cost = info?.cost ?? 0;
        const tile = state.grid[y]?.[x];

        if (!tile) return state;
        if (cost > 0 && state.stats.money < cost) return state;

        // Prevent wasted spend
        if (tool === 'bulldoze' && tile.building.type === 'grass' && tile.zone === 'none') {
          return state;
        }

        const building = toolBuildingMap[tool];
        const zone = toolZoneMap[tool];

        if (zone && tile.zone === zone) return state;
        if (building && tile.building.type === building) return state;

        // Handle subway
        if (tool === 'subway') {
          if (tile.building.type === 'water') return state;
          if (tile.hasSubway) return state;

          const nextState = placeSubway(state, x, y);
          if (nextState === state) return state;

          return {
            ...nextState,
            stats: { ...nextState.stats, money: nextState.stats.money - cost },
          };
        }

        let nextState: GameState;

        if (tool === 'bulldoze') {
          nextState = bulldozeTile(state, x, y);
        } else if (zone) {
          nextState = placeBuilding(state, x, y, null, zone);
        } else if (building) {
          nextState = placeBuilding(state, x, y, building, null);
        } else {
          return state;
        }

        if (nextState === state) return state;

        if (cost > 0) {
          nextState = {
            ...nextState,
            stats: { ...nextState.stats, money: nextState.stats.money - cost },
          };
        }

        return nextState;
      });
    },

    // ========================================================================
    // ADJACENT CITIES
    // ========================================================================

    connectToCity: (cityId) => {
      set((state) => {
        const city = state.adjacentCities.find(c => c.id === cityId);
        if (!city || city.connected) return state;

        const updatedCities = state.adjacentCities.map(c =>
          c.id === cityId ? { ...c, connected: true, discovered: true } : c
        );

        const tradeBonus = 5000;
        const tradeIncome = 200;

        return {
          ...state,
          adjacentCities: updatedCities,
          stats: {
            ...state.stats,
            money: state.stats.money + tradeBonus,
            income: state.stats.income + tradeIncome,
          },
          notifications: [
            {
              id: `city-connect-${Date.now()}`,
              title: 'City Connected!',
              description: `Trade route established with ${city.name}. +$${tradeBonus} bonus and +$${tradeIncome}/month income.`,
              icon: 'road',
              timestamp: Date.now(),
            },
            ...state.notifications.slice(0, 9),
          ],
        };
      });
    },

    discoverCity: (cityId) => {
      set((state) => {
        const city = state.adjacentCities.find(c => c.id === cityId);
        if (!city || city.discovered) return state;

        const updatedCities = state.adjacentCities.map(c =>
          c.id === cityId ? { ...c, discovered: true } : c
        );

        return {
          ...state,
          adjacentCities: updatedCities,
          notifications: [
            {
              id: `city-discover-${Date.now()}`,
              title: 'City Discovered!',
              description: `Your road has reached the ${city.direction} border! You can now connect to ${city.name}.`,
              icon: 'road',
              timestamp: Date.now(),
            },
            ...state.notifications.slice(0, 9),
          ],
        };
      });
    },

    checkAndDiscoverCities: (onDiscover) => {
      set((state) => {
        const newlyDiscovered = checkForDiscoverableCities(state.grid, state.gridSize, state.adjacentCities);

        if (newlyDiscovered.length === 0) return state;

        const cityToDiscover = newlyDiscovered[0];

        const updatedCities = state.adjacentCities.map(c =>
          c.id === cityToDiscover.id ? { ...c, discovered: true } : c
        );

        if (onDiscover) {
          setTimeout(() => {
            onDiscover({
              id: cityToDiscover.id,
              direction: cityToDiscover.direction,
              name: cityToDiscover.name,
            });
          }, 0);
        }

        return {
          ...state,
          adjacentCities: updatedCities,
        };
      });
    },

    // ========================================================================
    // SETTINGS
    // ========================================================================

    setDisastersEnabled: (enabled) => set({ disastersEnabled: enabled }),

    setSpritePack: (packId) => {
      const pack = getSpritePack(packId);
      setActiveSpritePack(pack);
      saveSpritePackId(packId);
      set({ currentSpritePack: pack });
    },

    setDayNightMode: (mode) => {
      saveDayNightMode(mode);
      set({ dayNightMode: mode });
    },

    // ========================================================================
    // GAME LIFECYCLE
    // ========================================================================

    newGame: (name, size) => {
      clearGameState();
      const fresh = createInitialGameState(size ?? DEFAULT_GRID_SIZE, name || 'IsoCity');
      set((state) => ({
        ...fresh,
        gameVersion: (state.gameVersion ?? 0) + 1,
        hasExistingGame: false,
      }));
    },

    loadState: (stateString) => {
      try {
        const parsed = JSON.parse(stateString);
        if (parsed?.grid && Array.isArray(parsed.grid) && parsed.gridSize &&
            typeof parsed.gridSize === 'number' && parsed.stats &&
            parsed.stats.money !== undefined && parsed.stats.population !== undefined) {
          // Migrations
          if (!parsed.adjacentCities) parsed.adjacentCities = [];
          for (const city of parsed.adjacentCities) {
            if (city.discovered === undefined) city.discovered = true;
          }
          if (!parsed.waterBodies) parsed.waterBodies = [];
          if (parsed.effectiveTaxRate === undefined) parsed.effectiveTaxRate = parsed.taxRate ?? 9;
          if (parsed.grid) {
            for (let y = 0; y < parsed.grid.length; y++) {
              for (let x = 0; x < parsed.grid[y].length; x++) {
                if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.constructionProgress === undefined) {
                  parsed.grid[y][x].building.constructionProgress = 100;
                }
                if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.abandoned === undefined) {
                  parsed.grid[y][x].building.abandoned = false;
                }
              }
            }
          }

          set((state) => ({
            ...(parsed as GameState),
            gameVersion: (state.gameVersion ?? 0) + 1,
            hasExistingGame: true,
          }));
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    exportState: () => {
      const state = get();
      // Extract just the GameState properties
      const gameState: GameState = {
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
      return JSON.stringify(gameState);
    },

    generateRandomCity: () => {
      clearGameState();
      const randomCity = generateRandomAdvancedCity(DEFAULT_GRID_SIZE);
      set((state) => ({
        ...randomCity,
        gameVersion: (state.gameVersion ?? 0) + 1,
        hasExistingGame: false,
      }));
    },

    // ========================================================================
    // MONEY & NOTIFICATIONS
    // ========================================================================

    addMoney: (amount) => {
      set((state) => ({
        stats: {
          ...state.stats,
          money: state.stats.money + amount,
        },
      }));
    },

    addNotification: (title, description, icon) => {
      set((state) => {
        const newNotifications = [
          {
            id: `notif-${Date.now()}-${Math.random()}`,
            title,
            description,
            icon,
            timestamp: Date.now(),
          },
          ...state.notifications,
        ];
        while (newNotifications.length > 10) {
          newNotifications.pop();
        }
        return { notifications: newNotifications };
      });
    },

    // ========================================================================
    // CITY SAVE/RESTORE (for shared links)
    // ========================================================================

    saveCurrentCityForRestore: () => {
      const state = get();
      const gameState: GameState = {
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
      saveCityForRestore(gameState);
    },

    restoreSavedCity: () => {
      const savedState = loadSavedCityState();
      if (savedState) {
        set({ ...savedState, _skipNextSave: true });
        clearSavedCityStorage();
        return true;
      }
      return false;
    },

    getSavedCityInfo: () => loadSavedCityInfo(),

    clearSavedCity: () => clearSavedCityStorage(),

    // ========================================================================
    // MULTI-CITY SAVE SYSTEM
    // ========================================================================

    saveCity: () => {
      const state = get();
      const cityMeta: SavedCityMeta = {
        id: state.id,
        cityName: state.cityName,
        population: state.stats.population,
        money: state.stats.money,
        year: state.year,
        month: state.month,
        gridSize: state.gridSize,
        savedAt: Date.now(),
      };

      const gameState: GameState = {
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

      saveCityState(state.id, gameState);

      set((prev) => {
        const existingIndex = prev.savedCities.findIndex((c) => c.id === state.id);
        let newCities: SavedCityMeta[];

        if (existingIndex >= 0) {
          newCities = [...prev.savedCities];
          newCities[existingIndex] = cityMeta;
        } else {
          newCities = [...prev.savedCities, cityMeta];
        }

        newCities.sort((a, b) => b.savedAt - a.savedAt);
        saveSavedCitiesIndex(newCities);

        return { savedCities: newCities };
      });
    },

    loadSavedCity: (cityId) => {
      const cityState = loadCityState(cityId);
      if (!cityState) return false;

      if (!cityState.id) cityState.id = cityId;

      // Migrations
      if (!cityState.adjacentCities) cityState.adjacentCities = [];
      for (const city of cityState.adjacentCities) {
        if (city.discovered === undefined) city.discovered = true;
      }
      if (!cityState.waterBodies) cityState.waterBodies = [];
      if (cityState.effectiveTaxRate === undefined) cityState.effectiveTaxRate = cityState.taxRate ?? 9;
      if (cityState.grid) {
        for (let y = 0; y < cityState.grid.length; y++) {
          for (let x = 0; x < cityState.grid[y].length; x++) {
            if (cityState.grid[y][x]?.building && cityState.grid[y][x].building.constructionProgress === undefined) {
              cityState.grid[y][x].building.constructionProgress = 100;
            }
            if (cityState.grid[y][x]?.building && cityState.grid[y][x].building.abandoned === undefined) {
              cityState.grid[y][x].building.abandoned = false;
            }
          }
        }
      }

      set((state) => ({
        ...cityState,
        gameVersion: (state.gameVersion ?? 0) + 1,
        _skipNextSave: true,
        hasExistingGame: true,
      }));

      saveGameState(cityState);
      return true;
    },

    deleteSavedCity: (cityId) => {
      deleteCityState(cityId);
      set((prev) => {
        const newCities = prev.savedCities.filter((c) => c.id !== cityId);
        saveSavedCitiesIndex(newCities);
        return { savedCities: newCities };
      });
    },

    renameSavedCity: (cityId, newName) => {
      const cityState = loadCityState(cityId);
      if (cityState) {
        cityState.cityName = newName;
        saveCityState(cityId, cityState);
      }

      set((prev) => {
        const newCities = prev.savedCities.map((c) =>
          c.id === cityId ? { ...c, cityName: newName } : c
        );
        saveSavedCitiesIndex(newCities);

        // If current game is being renamed, update its name too
        if (prev.id === cityId) {
          return { savedCities: newCities, cityName: newName };
        }
        return { savedCities: newCities };
      });
    },

    // ========================================================================
    // INTERNAL
    // ========================================================================

    _runSimulationTick: () => {
      set((state) => simulateTick(state));
    },

    _setIsSaving: (isSaving) => set({ isSaving }),
  }))
);

// ============================================================================
// SIDE EFFECTS (Simulation Loop & Auto-Save)
// ============================================================================

let simulationInterval: ReturnType<typeof setInterval> | null = null;
let saveInterval: ReturnType<typeof setInterval> | null = null;
let lastSaveTime = 0;

// Subscribe to speed changes to manage simulation interval
if (typeof window !== 'undefined') {
  useGameStore.subscribe(
    (state) => state.speed,
    (speed) => {
      // Clear existing interval
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }

      if (speed > 0) {
        const isMobileDevice = window.innerWidth < 768 ||
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        const interval = isMobileDevice
          ? (speed === 1 ? 750 : speed === 2 ? 400 : 150)
          : (speed === 1 ? 500 : speed === 2 ? 220 : 50);

        simulationInterval = setInterval(() => {
          useGameStore.getState()._runSimulationTick();
        }, interval);
      }
    },
    { fireImmediately: true }
  );

  // Auto-save every 3 seconds
  saveInterval = setInterval(() => {
    const state = useGameStore.getState();

    if (!state._initialized) return;
    if (state._skipNextSave) {
      useGameStore.setState({ _skipNextSave: false });
      lastSaveTime = Date.now();
      return;
    }

    const timeSinceLastSave = Date.now() - lastSaveTime;
    if (timeSinceLastSave < 2000) return;

    useGameStore.getState()._setIsSaving(true);
    try {
      const gameState: GameState = {
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
      saveGameState(gameState);
      lastSaveTime = Date.now();
      useGameStore.setState({ hasExistingGame: true });
    } finally {
      useGameStore.getState()._setIsSaving(false);
    }
  }, 3000);
}

// ============================================================================
// AVAILABLE SPRITE PACKS (for UI)
// ============================================================================

export const availableSpritePacks = SPRITE_PACKS;
