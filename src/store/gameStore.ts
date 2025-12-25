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
  ZoneType,
} from '@/types/game';
import { TOOL_INFO } from '@/data';
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
import {
  loadGameState,
  saveGameState,
  clearGameState,
  getSavedCities,
  saveSavedCitiesIndex,
  saveCity as saveCityState,
  loadCity as loadCityState,
  deleteCity as deleteCityState,
  saveCityForRestore,
  loadSavedCityInfo,
  loadSavedCityState,
  clearSavedCityStorage,
  loadSpritePackId,
  saveSpritePackId,
  loadDayNightMode,
  saveDayNightMode,
  extractGameStateFromStore,
  migrateGameState,
  isValidGameState,
  type DayNightMode,
} from '@/lib/storage';

// ============================================================================
// TYPES
// ============================================================================

export type { DayNightMode } from '@/lib/storage';

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
      const cities = getSavedCities();

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

        if (!isValidGameState(parsed)) {
          return false;
        }

        // Apply migrations
        const migratedState = migrateGameState(parsed);

        set((state) => ({
          ...migratedState,
          gameVersion: (state.gameVersion ?? 0) + 1,
          hasExistingGame: true,
        }));
        return true;
      } catch {
        return false;
      }
    },

    exportState: () => {
      const state = get();
      const gameState = extractGameStateFromStore(state);
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
      const gameState = extractGameStateFromStore(state);
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

      const gameState = extractGameStateFromStore(state);
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

      // Ensure ID is set (migrations handle the rest)
      if (!cityState.id) cityState.id = cityId;

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

if (typeof window !== 'undefined') {
  // Initialize store from localStorage on module load.
  // This runs once when the module is first imported in the browser,
  // guaranteeing state is ready before any React component mounts.
  useGameStore.getState().initialize();

  // Subscribe to speed changes to manage simulation interval
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
      const gameState = extractGameStateFromStore(state);
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
