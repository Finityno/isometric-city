// Fine-grained selectors for the game store
// Components should use these selectors to only re-render when their specific data changes

import { useShallow } from 'zustand/react/shallow';
import { useGameStore, DayNightMode, availableSpritePacks } from './gameStore';
import type { GameState, Tool, Budget, Stats, Tile, ServiceCoverage, Notification, AdvisorMessage, HistoryPoint, SavedCityMeta } from '@/types/game';
import type { SpritePack } from '@/lib/renderConfig';

// ============================================================================
// UI STATE SELECTORS (changes rarely - only on user interaction)
// ============================================================================

/** Selected tool - changes only when user selects a different tool */
export const useSelectedTool = () => useGameStore((s) => s.selectedTool);

/** Active panel - changes only when user opens/closes panels */
export const useActivePanel = () => useGameStore((s) => s.activePanel);

/** Game speed - changes only when user adjusts speed */
export const useSpeed = () => useGameStore((s) => s.speed);

/** Tax rate - changes only when user adjusts slider */
export const useTaxRate = () => useGameStore((s) => s.taxRate);

/** Disasters enabled setting */
export const useDisastersEnabled = () => useGameStore((s) => s.disastersEnabled);

// ============================================================================
// STATS SELECTORS (changes every simulation tick)
// ============================================================================

/** All city stats - use sparingly, causes re-render every tick */
export const useCityStats = () => useGameStore((s) => s.stats);

/** Population only */
export const usePopulation = () => useGameStore((s) => s.stats.population);

/** Jobs count only */
export const useJobs = () => useGameStore((s) => s.stats.jobs);

/** Money/funds only */
export const useMoney = () => useGameStore((s) => s.stats.money);

/** Income only */
export const useIncome = () => useGameStore((s) => s.stats.income);

/** Expenses only */
export const useExpenses = () => useGameStore((s) => s.stats.expenses);

/** Monthly balance (income - expenses) */
export const useMonthlyBalance = () => useGameStore((s) => s.stats.income - s.stats.expenses);

/** Demand values (RCI) */
export const useDemand = () => useGameStore(useShallow((s) => s.stats.demand));

/** Happiness, health, education, safety, environment */
export const useQualityOfLife = () => useGameStore(
  useShallow((s) => ({
    happiness: s.stats.happiness,
    health: s.stats.health,
    education: s.stats.education,
    safety: s.stats.safety,
    environment: s.stats.environment,
  }))
);

// ============================================================================
// TIME SELECTORS (changes every simulation tick)
// ============================================================================

/** Full simulation time - year, month, day, hour */
export const useSimulationTime = () => useGameStore(
  useShallow((s) => ({
    year: s.year,
    month: s.month,
    day: s.day,
    hour: s.hour,
  }))
);

/** Just year and month for display */
export const useYearMonth = () => useGameStore(
  useShallow((s) => ({
    year: s.year,
    month: s.month,
  }))
);

/** Visual hour (respects day/night mode override) */
export const useVisualHour = () => {
  const hour = useGameStore((s) => s.hour);
  const dayNightMode = useGameStore((s) => s.dayNightMode);
  return dayNightMode === 'auto' ? hour : dayNightMode === 'day' ? 12 : 22;
};

// ============================================================================
// CITY METADATA SELECTORS (changes rarely)
// ============================================================================

/** City name */
export const useCityName = () => useGameStore((s) => s.cityName);

/** City ID */
export const useCityId = () => useGameStore((s) => s.id);

/** Grid size */
export const useGridSize = () => useGameStore((s) => s.gridSize);

/** Game version (increments on new game) */
export const useGameVersion = () => useGameStore((s) => s.gameVersion);

/** Whether there's an existing game to continue */
export const useHasExistingGame = () => useGameStore((s) => s.hasExistingGame);

/** Whether the game is currently saving */
export const useIsSaving = () => useGameStore((s) => s.isSaving);

// ============================================================================
// GRID & SERVICES SELECTORS (changes on building placement)
// ============================================================================

/** Full grid - use sparingly */
export const useGrid = () => useGameStore((s) => s.grid);

/** Service coverage maps */
export const useServices = () => useGameStore((s) => s.services);

/** Adjacent cities */
export const useAdjacentCities = () => useGameStore((s) => s.adjacentCities);

/** Water bodies */
export const useWaterBodies = () => useGameStore((s) => s.waterBodies);

// ============================================================================
// BUDGET SELECTORS
// ============================================================================

/** Full budget state */
export const useBudget = () => useGameStore((s) => s.budget);

/** Effective tax rate (lagging) */
export const useEffectiveTaxRate = () => useGameStore((s) => s.effectiveTaxRate);

// ============================================================================
// NOTIFICATIONS & ADVISORS
// ============================================================================

/** Notifications list */
export const useNotifications = () => useGameStore((s) => s.notifications);

/** Advisor messages */
export const useAdvisorMessages = () => useGameStore((s) => s.advisorMessages);

// ============================================================================
// HISTORY
// ============================================================================

/** History points for statistics */
export const useHistory = () => useGameStore((s) => s.history);

// ============================================================================
// SPRITE PACK & DISPLAY SETTINGS
// ============================================================================

/** Current sprite pack */
export const useCurrentSpritePack = () => useGameStore((s) => s.currentSpritePack);

/** Day/night mode setting */
export const useDayNightMode = () => useGameStore((s) => s.dayNightMode);

/** Available sprite packs - constant, doesn't cause re-renders */
export const useAvailableSpritePacks = () => availableSpritePacks;

// ============================================================================
// SAVED CITIES
// ============================================================================

/** List of saved cities */
export const useSavedCities = () => useGameStore((s) => s.savedCities);

// ============================================================================
// ACTIONS (stable references - never cause re-renders)
// ============================================================================

/**
 * All game actions bundled together.
 * These are stable references and won't cause re-renders.
 */
export const useGameActions = () => useGameStore(
  useShallow((s) => ({
    // Tool & UI
    setTool: s.setTool,
    setSpeed: s.setSpeed,
    setTaxRate: s.setTaxRate,
    setActivePanel: s.setActivePanel,
    setBudgetFunding: s.setBudgetFunding,

    // Building
    placeAtTile: s.placeAtTile,

    // Cities
    connectToCity: s.connectToCity,
    discoverCity: s.discoverCity,
    checkAndDiscoverCities: s.checkAndDiscoverCities,

    // Settings
    setDisastersEnabled: s.setDisastersEnabled,
    setSpritePack: s.setSpritePack,
    setDayNightMode: s.setDayNightMode,

    // Game lifecycle
    newGame: s.newGame,
    loadState: s.loadState,
    exportState: s.exportState,
    generateRandomCity: s.generateRandomCity,

    // Money & notifications
    addMoney: s.addMoney,
    addNotification: s.addNotification,

    // City save/restore
    saveCurrentCityForRestore: s.saveCurrentCityForRestore,
    restoreSavedCity: s.restoreSavedCity,
    getSavedCityInfo: s.getSavedCityInfo,
    clearSavedCity: s.clearSavedCity,

    // Multi-city saves
    saveCity: s.saveCity,
    loadSavedCity: s.loadSavedCity,
    deleteSavedCity: s.deleteSavedCity,
    renameSavedCity: s.renameSavedCity,

    // Initialization
    initialize: s.initialize,
  }))
);

// Individual action selectors for components that only need specific actions
export const useSetTool = () => useGameStore((s) => s.setTool);
export const useSetSpeed = () => useGameStore((s) => s.setSpeed);
export const useSetTaxRate = () => useGameStore((s) => s.setTaxRate);
export const useSetActivePanel = () => useGameStore((s) => s.setActivePanel);
export const usePlaceAtTile = () => useGameStore((s) => s.placeAtTile);
export const useSetBudgetFunding = () => useGameStore((s) => s.setBudgetFunding);
export const useNewGame = () => useGameStore((s) => s.newGame);
export const useLoadState = () => useGameStore((s) => s.loadState);
export const useExportState = () => useGameStore((s) => s.exportState);
export const useGenerateRandomCity = () => useGameStore((s) => s.generateRandomCity);
export const useSaveCity = () => useGameStore((s) => s.saveCity);
export const useLoadSavedCity = () => useGameStore((s) => s.loadSavedCity);
export const useDeleteSavedCity = () => useGameStore((s) => s.deleteSavedCity);
export const useRenameSavedCity = () => useGameStore((s) => s.renameSavedCity);
export const useSetSpritePack = () => useGameStore((s) => s.setSpritePack);
export const useSetDayNightMode = () => useGameStore((s) => s.setDayNightMode);
export const useSetDisastersEnabled = () => useGameStore((s) => s.setDisastersEnabled);
export const useAddMoney = () => useGameStore((s) => s.addMoney);
export const useAddNotification = () => useGameStore((s) => s.addNotification);
export const useCheckAndDiscoverCities = () => useGameStore((s) => s.checkAndDiscoverCities);
export const useInitialize = () => useGameStore((s) => s.initialize);

// ============================================================================
// COMPOSITE SELECTORS (for specific components)
// ============================================================================

/** TopBar data - combines stats, time, speed, tax for the top bar component */
export const useTopBarData = () => {
  return useGameStore(
    useShallow((s) => ({
      cityName: s.cityName,
      year: s.year,
      month: s.month,
      day: s.day,
      speed: s.speed,
      taxRate: s.taxRate,
      isSaving: s.isSaving,
      population: s.stats.population,
      jobs: s.stats.jobs,
      money: s.stats.money,
      income: s.stats.income,
      expenses: s.stats.expenses,
      demand: s.stats.demand,
    }))
  );
};

/** Sidebar data - tool selection and money for affordability checks */
export const useSidebarData = () => {
  return useGameStore(
    useShallow((s) => ({
      selectedTool: s.selectedTool,
      money: s.stats.money,
      activePanel: s.activePanel,
    }))
  );
};

/** MiniMap data - grid and key rendering info */
export const useMiniMapData = () => {
  return useGameStore(
    useShallow((s) => ({
      grid: s.grid,
      gridSize: s.gridSize,
      services: s.services,
      tick: s.tick,
    }))
  );
};

/** Canvas data for CanvasIsometricGrid */
export const useCanvasData = () => {
  return useGameStore(
    useShallow((s) => ({
      grid: s.grid,
      gridSize: s.gridSize,
      selectedTool: s.selectedTool,
      services: s.services,
      gameVersion: s.gameVersion,
    }))
  );
};
