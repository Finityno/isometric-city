// Simulation engine for IsoCity

import {
  GameState,
  Tile,
  Building,
  BuildingType,
  ZoneType,
  Stats,
  Budget,
  ServiceCoverage,
  AdvisorMessage,
  HistoryPoint,
  Notification,
  AdjacentCity,
  WaterBody,
} from '@/types/game';
import {
  BUILDING_STATS,
  RESIDENTIAL_BUILDINGS,
  COMMERCIAL_BUILDINGS,
  INDUSTRIAL_BUILDINGS,
} from '@/data';
import { generateCityName, generateWaterName } from './names';
import { isMobile } from 'react-device-detect';
import {
  createInitialBudget,
  updateBudgetFromMetrics,
  calculateExpenses,
  calculateIncome,
  calculateTaxMultiplier,
  calculateTaxAdditiveModifier,
  updateEffectiveTaxRate,
  calculateDemand,
  type GridMetrics,
} from './simulation/economy';
import {
  createServiceCoverage,
  calculateServiceCoverage,
  invalidateServiceBuildingCache,
  SERVICE_CONFIG,
  SERVICE_BUILDING_TYPES,
} from './simulation/services';
import {
  perlinNoise,
  generateLakes,
  generateOceans,
  generateAdjacentCities,
  createTile,
  createBuilding,
  NO_CONSTRUCTION_TYPES,
} from './simulation/terrain';
import {
  requiresWaterAdjacency,
  getWaterAdjacency,
  getRoadAdjacency,
  isStarterBuilding as isStarterBuildingImpl,
  getBuildingSize,
  canPlaceMultiTileBuilding,
  canSpawnMultiTileBuilding,
  findBuildingOrigin,
  applyBuildingFootprint,
  placeBuilding as placeBuildingImpl,
  bulldozeTile as bulldozeTileImpl,
  placeSubway as placeSubwayImpl,
  evolveBuilding as evolveBuildingImpl,
  findFootprintIncludingTile,
} from './simulation/buildings';

// Re-export for external usage (e.g., overlay rendering)
export { SERVICE_CONFIG, invalidateServiceBuildingCache };

// Re-export building functions for backwards compatibility
export {
  requiresWaterAdjacency,
  getWaterAdjacency,
  getRoadAdjacency,
  getBuildingSize,
  findBuildingOrigin,
  findFootprintIncludingTile,
} from './simulation/buildings';

// Wrapper functions that delegate to extracted modules
// These maintain the exact same signatures for backwards compatibility
export const isStarterBuilding = isStarterBuildingImpl;
export const placeBuilding = placeBuildingImpl;
export const bulldozeTile = bulldozeTileImpl;
export const placeSubway = placeSubwayImpl;
const evolveBuilding = evolveBuildingImpl;

// Default grid size for new games
export const DEFAULT_GRID_SIZE = isMobile ? 50 : 70;

// Check if a factory_small at this position would render as a farm
// This matches the deterministic logic in Game.tsx for farm variant selection
function isFarmBuilding(x: number, y: number, buildingType: string): boolean {
  if (buildingType !== 'factory_small') return false;
  // Same seed calculation as in Game.tsx rendering
  const seed = (x * 31 + y * 17) % 100;
  // ~50% chance to be a farm variant (when seed < 50)
  return seed < 50;
}

// Check if there's a road tile at any edge of the map in a given direction
export function hasRoadAtEdge(grid: Tile[][], gridSize: number, direction: 'north' | 'south' | 'east' | 'west'): boolean {
  switch (direction) {
    case 'north':
      // Check top edge (y = 0)
      for (let x = 0; x < gridSize; x++) {
        if (grid[0][x].building.type === 'road') return true;
      }
      return false;
    case 'south':
      // Check bottom edge (y = gridSize - 1)
      for (let x = 0; x < gridSize; x++) {
        if (grid[gridSize - 1][x].building.type === 'road') return true;
      }
      return false;
    case 'east':
      // Check right edge (x = gridSize - 1)
      for (let y = 0; y < gridSize; y++) {
        if (grid[y][gridSize - 1].building.type === 'road') return true;
      }
      return false;
    case 'west':
      // Check left edge (x = 0)
      for (let y = 0; y < gridSize; y++) {
        if (grid[y][0].building.type === 'road') return true;
      }
      return false;
  }
}

// Check all edges and return cities that can be connected (have roads reaching them)
// Returns: { newlyDiscovered: cities just discovered, connectableExisting: already discovered but not connected }
export function checkForDiscoverableCities(
  grid: Tile[][],
  gridSize: number,
  adjacentCities: AdjacentCity[]
): AdjacentCity[] {
  const citiesToShow: AdjacentCity[] = [];
  
  for (const city of adjacentCities) {
    if (!city.connected && hasRoadAtEdge(grid, gridSize, city.direction)) {
      // Include both undiscovered cities (they'll be discovered) and discovered-but-unconnected cities
      if (!city.discovered) {
        // This is a new discovery
        citiesToShow.push(city);
      }
      // Note: We only return undiscovered cities here. For already-discovered cities,
      // the UI can show them in a different way (e.g., a persistent indicator)
    }
  }
  
  return citiesToShow;
}

// Check for cities that are discovered, have roads at their edge, but are not yet connected
// This can be used to remind players they can connect to a city
export function getConnectableCities(
  grid: Tile[][],
  gridSize: number,
  adjacentCities: AdjacentCity[]
): AdjacentCity[] {
  const connectable: AdjacentCity[] = [];
  
  for (const city of adjacentCities) {
    if (city.discovered && !city.connected && hasRoadAtEdge(grid, gridSize, city.direction)) {
      connectable.push(city);
    }
  }
  
  return connectable;
}

// Generate terrain - grass with scattered trees, lakes, and oceans
function generateTerrain(size: number): { grid: Tile[][]; waterBodies: WaterBody[] } {
  const grid: Tile[][] = [];
  const seed = Math.random() * 1000;

  // First pass: create base terrain with grass
  for (let y = 0; y < size; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < size; x++) {
      row.push(createTile(x, y, 'grass'));
    }
    grid.push(row);
  }
  
  // Second pass: add lakes (small contiguous water regions)
  const lakeBodies = generateLakes(grid, size, seed);
  
  // Third pass: add oceans on edges (sometimes)
  const oceanBodies = generateOceans(grid, size, seed);
  
  // Combine all water bodies
  const waterBodies = [...lakeBodies, ...oceanBodies];
  
  // Fourth pass: add scattered trees (avoiding water)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x].building.type === 'water') continue; // Don't place trees on water
      
      const treeNoise = perlinNoise(x * 2, y * 2, seed + 500, 2);
      const isTree = treeNoise > 0.72 && Math.random() > 0.65;
      
      // Also add some trees near water for visual appeal
      const nearWater = isNearWater(grid, x, y, size);
      const isTreeNearWater = nearWater && Math.random() > 0.7;

      if (isTree || isTreeNearWater) {
        grid[y][x].building = createBuilding('tree');
      }
    }
  }

  return { grid, waterBodies };
}

// Check if a tile is near water
function isNearWater(grid: Tile[][], x: number, y: number, size: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        if (grid[ny][nx].building.type === 'water') {
          return true;
        }
      }
    }
  }
  return false;
}

// createInitialBudget moved to src/lib/simulation/economy/BudgetSystem.ts

function createInitialStats(): Stats {
  return {
    population: 0,
    jobs: 0,
    money: 100000,
    income: 0,
    expenses: 0,
    happiness: 50,
    health: 50,
    education: 50,
    safety: 50,
    environment: 75,
    demand: {
      residential: 50,
      commercial: 30,
      industrial: 40,
    },
  };
}

// Generate a UUID v4
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function createInitialGameState(size: number = DEFAULT_GRID_SIZE, cityName: string = 'New City'): GameState {
  const { grid, waterBodies } = generateTerrain(size);
  const adjacentCities = generateAdjacentCities();

  return {
    id: generateUUID(),
    grid,
    gridSize: size,
    cityName,
    year: 2024,
    month: 1,
    day: 1,
    hour: 12, // Start at noon
    tick: 0,
    speed: 1,
    selectedTool: 'select',
    taxRate: 9,
    effectiveTaxRate: 9, // Start matching taxRate
    stats: createInitialStats(),
    budget: createInitialBudget(),
    services: createServiceCoverage(size),
    notifications: [],
    advisorMessages: [],
    history: [],
    activePanel: 'none',
    disastersEnabled: true,
    adjacentCities,
    waterBodies,
    gameVersion: 0,
  };
}

// PERF: Pre-allocated arrays for hasRoadAccess BFS to avoid GC pressure
// Queue stores [x, y, dist] tuples as flat array (3 values per entry)
const roadAccessQueue = new Int16Array(3 * 256); // Max 256 tiles to check (8*8*4 directions)
const roadAccessVisited = new Uint8Array(128 * 128); // Max 128x128 grid, reused between calls

// Check if a tile has road access by looking for a path through the same zone
// within a limited distance. This allows large contiguous zones to develop even
// when only the perimeter touches a road.
function hasRoadAccess(
  grid: Tile[][],
  x: number,
  y: number,
  size: number,
  maxDistance: number = 8
): boolean {
  const startZone = grid[y][x].zone;
  if (startZone === 'none') {
    return false;
  }

  // PERF: Use typed array for visited flags instead of Set<string>
  // Clear only the area we'll actually use (maxDistance radius)
  const minClearX = Math.max(0, x - maxDistance);
  const maxClearX = Math.min(size - 1, x + maxDistance);
  const minClearY = Math.max(0, y - maxDistance);
  const maxClearY = Math.min(size - 1, y + maxDistance);
  for (let cy = minClearY; cy <= maxClearY; cy++) {
    for (let cx = minClearX; cx <= maxClearX; cx++) {
      roadAccessVisited[cy * size + cx] = 0;
    }
  }

  // BFS using flat queue array [x0, y0, dist0, x1, y1, dist1, ...]
  let queueHead = 0;
  let queueTail = 3;
  roadAccessQueue[0] = x;
  roadAccessQueue[1] = y;
  roadAccessQueue[2] = 0;
  roadAccessVisited[y * size + x] = 1;

  while (queueHead < queueTail) {
    const cx = roadAccessQueue[queueHead];
    const cy = roadAccessQueue[queueHead + 1];
    const dist = roadAccessQueue[queueHead + 2];
    queueHead += 3;
    
    if (dist >= maxDistance) {
      continue;
    }

    // Check all 4 directions: [-1,0], [1,0], [0,-1], [0,1]
    const neighbors = [
      [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]
    ];
    
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;

      const idx = ny * size + nx;
      if (roadAccessVisited[idx]) continue;
      roadAccessVisited[idx] = 1;

      const neighbor = grid[ny][nx];

      if (neighbor.building.type === 'road') {
        return true;
      }

      const isPassableZone = neighbor.zone === startZone && neighbor.building.type !== 'water';
      if (isPassableZone && queueTail < roadAccessQueue.length - 3) {
        roadAccessQueue[queueTail] = nx;
        roadAccessQueue[queueTail + 1] = ny;
        roadAccessQueue[queueTail + 2] = dist + 1;
        queueTail += 3;
      }
    }
  }

  return false;
}

// Calculate city stats
// effectiveTaxRate is the lagged tax rate used for demand calculations
// PERF: Unified grid metrics collection - single pass for all data
// Replaces 3 separate grid scans (calculateStats, updateBudgetCosts, generateAdvisorMessages)
// GridMetrics interface moved to src/lib/simulation/economy/BudgetSystem.ts

function collectGridMetrics(grid: Tile[][], size: number): GridMetrics {
  const metrics: GridMetrics = {
    population: 0,
    jobs: 0,
    totalPollution: 0,
    totalLandValue: 0,
    treeCount: 0,
    waterCount: 0,
    parkCount: 0,
    residentialZones: 0,
    commercialZones: 0,
    industrialZones: 0,
    developedResidential: 0,
    developedCommercial: 0,
    developedIndustrial: 0,
    subwayTiles: 0,
    subwayStations: 0,
    railTiles: 0,
    railStations: 0,
    roadCount: 0,
    hasAirport: false,
    hasCityHall: false,
    hasSpaceProgram: false,
    stadiumCount: 0,
    museumCount: 0,
    hasAmusementPark: false,
    policeCount: 0,
    fireCount: 0,
    hospitalCount: 0,
    schoolCount: 0,
    universityCount: 0,
    powerCount: 0,
    waterTowerCount: 0,
    unpoweredBuildings: 0,
    unwateredBuildings: 0,
    abandonedBuildings: 0,
    abandonedResidential: 0,
    abandonedCommercial: 0,
    abandonedIndustrial: 0,
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = grid[y][x];
      const building = tile.building;
      const buildingType = building.type;
      const isComplete = building.constructionProgress === undefined || building.constructionProgress >= 100;

      // Apply subway commercial boost to jobs
      let jobsFromTile = building.jobs;
      if (tile.hasSubway && tile.zone === 'commercial') {
        jobsFromTile = Math.floor(jobsFromTile * 1.15);
      }

      metrics.population += building.population;
      metrics.jobs += jobsFromTile;
      metrics.totalPollution += tile.pollution;
      metrics.totalLandValue += tile.landValue;

      // Subway tiles
      if (tile.hasSubway) metrics.subwayTiles++;

      // Zone counts
      if (tile.zone === 'residential') {
        metrics.residentialZones++;
        if (buildingType !== 'grass' && buildingType !== 'empty') metrics.developedResidential++;
      } else if (tile.zone === 'commercial') {
        metrics.commercialZones++;
        if (buildingType !== 'grass' && buildingType !== 'empty') metrics.developedCommercial++;
      } else if (tile.zone === 'industrial') {
        metrics.industrialZones++;
        if (buildingType !== 'grass' && buildingType !== 'empty') metrics.developedIndustrial++;
      }

      // Advisor metrics - unpowered/unwatered zoned buildings
      if (tile.zone !== 'none' && buildingType !== 'grass') {
        if (!building.powered) metrics.unpoweredBuildings++;
        if (!building.watered) metrics.unwateredBuildings++;
      }

      // Abandoned buildings
      if (building.abandoned) {
        metrics.abandonedBuildings++;
        if (tile.zone === 'residential') metrics.abandonedResidential++;
        else if (tile.zone === 'commercial') metrics.abandonedCommercial++;
        else if (tile.zone === 'industrial') metrics.abandonedIndustrial++;
      }

      // Use switch for O(1) building type handling via jump table
      switch (buildingType) {
        case 'tree': metrics.treeCount++; break;
        case 'water': metrics.waterCount++; break;
        case 'park': metrics.parkCount++; break;
        case 'park_large': metrics.parkCount++; break;
        case 'tennis': metrics.parkCount++; break;
        case 'subway_station': metrics.subwayStations++; break;
        case 'rail': metrics.railTiles++; break;
        case 'rail_station': metrics.railStations++; break;
        case 'road': metrics.roadCount++; break;
        case 'police_station': metrics.policeCount++; break;
        case 'fire_station': metrics.fireCount++; break;
        case 'hospital': metrics.hospitalCount++; break;
        case 'school': metrics.schoolCount++; break;
        case 'university': metrics.universityCount++; break;
        case 'power_plant': metrics.powerCount++; break;
        case 'water_tower': metrics.waterTowerCount++; break;
        case 'airport': if (isComplete) metrics.hasAirport = true; break;
        case 'city_hall': if (isComplete) metrics.hasCityHall = true; break;
        case 'space_program': if (isComplete) metrics.hasSpaceProgram = true; break;
        case 'stadium': if (isComplete) metrics.stadiumCount++; break;
        case 'museum': if (isComplete) metrics.museumCount++; break;
        case 'amusement_park': if (isComplete) metrics.hasAmusementPark = true; break;
      }

      // Rail overlay check (for non-rail buildings that have rail on them)
      if (tile.hasRailOverlay && buildingType !== 'rail') metrics.railTiles++;
    }
  }

  return metrics;
}

function calculateStatsFromMetrics(metrics: GridMetrics, size: number, budget: Budget, taxRate: number, effectiveTaxRate: number, services: ServiceCoverage): Stats {
  const {
    population, jobs, totalPollution, treeCount, waterCount, parkCount,
    subwayTiles, subwayStations, railTiles, railStations,
    hasAirport, hasCityHall, hasSpaceProgram, stadiumCount, museumCount, hasAmusementPark
  } = metrics;

  // Calculate tax effects (from TaxSystem)
  const taxMultiplier = calculateTaxMultiplier(effectiveTaxRate);
  const taxAdditiveModifier = calculateTaxAdditiveModifier(effectiveTaxRate);

  // Calculate RCI demand (from DemandSystem)
  const demandResult = calculateDemand(metrics, taxMultiplier, taxAdditiveModifier);

  // Calculate income and expenses (from TaxSystem and BudgetSystem)
  const income = calculateIncome(population, jobs, taxRate);
  const expenses = calculateExpenses(budget);

  // Calculate ratings
  const avgPoliceCoverage = calculateAverageCoverage(services.police);
  const avgFireCoverage = calculateAverageCoverage(services.fire);
  const avgHealthCoverage = calculateAverageCoverage(services.health);
  const avgEducationCoverage = calculateAverageCoverage(services.education);

  const safety = Math.min(100, avgPoliceCoverage * 0.7 + avgFireCoverage * 0.3);
  const health = Math.min(100, avgHealthCoverage * 0.8 + (100 - totalPollution / (size * size)) * 0.2);
  const education = Math.min(100, avgEducationCoverage);
  
  const greenRatio = (treeCount + waterCount + parkCount) / (size * size);
  const pollutionRatio = totalPollution / (size * size * 100);
  const environment = Math.min(100, Math.max(0, greenRatio * 200 - pollutionRatio * 100 + 50));

  const jobSatisfaction = jobs >= population ? 100 : (jobs / (population || 1)) * 100;
  const happiness = Math.min(100, (
    safety * 0.15 +
    health * 0.2 +
    education * 0.15 +
    environment * 0.15 +
    jobSatisfaction * 0.2 +
    (100 - taxRate * 3) * 0.15
  ));

  return {
    population,
    jobs,
    money: 0, // Will be updated from previous state
    income,
    expenses,
    happiness,
    health,
    education,
    safety,
    environment,
    demand: demandResult,
  };
}

function calculateAverageCoverage(coverage: number[][]): number {
  let total = 0;
  let count = 0;
  for (const row of coverage) {
    for (const value of row) {
      total += value;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

// updateBudgetFromMetrics moved to src/lib/simulation/economy/BudgetSystem.ts

// PERF: Generate advisor messages using pre-collected metrics (no grid scan)
function generateAdvisorMessagesFromMetrics(stats: Stats, metrics: GridMetrics): AdvisorMessage[] {
  const messages: AdvisorMessage[] = [];

  const {
    unpoweredBuildings, unwateredBuildings,
    abandonedBuildings, abandonedResidential, abandonedCommercial, abandonedIndustrial
  } = metrics;

  // Power advisor
  if (unpoweredBuildings > 0) {
    messages.push({
      name: 'Power Advisor',
      icon: 'power',
      messages: [`${unpoweredBuildings} buildings lack power. Build more power plants!`],
      priority: unpoweredBuildings > 10 ? 'high' : 'medium',
    });
  }

  // Water advisor
  if (unwateredBuildings > 0) {
    messages.push({
      name: 'Water Advisor',
      icon: 'water',
      messages: [`${unwateredBuildings} buildings lack water. Build water towers!`],
      priority: unwateredBuildings > 10 ? 'high' : 'medium',
    });
  }

  // Finance advisor
  const netIncome = stats.income - stats.expenses;
  if (netIncome < 0) {
    messages.push({
      name: 'Finance Advisor',
      icon: 'cash',
      messages: [`City is running a deficit of $${Math.abs(netIncome)}/month. Consider raising taxes or cutting services.`],
      priority: netIncome < -500 ? 'critical' : 'high',
    });
  }

  // Safety advisor
  if (stats.safety < 40) {
    messages.push({
      name: 'Safety Advisor',
      icon: 'shield',
      messages: ['Crime is on the rise. Build more police stations to protect citizens.'],
      priority: stats.safety < 20 ? 'critical' : 'high',
    });
  }

  // Health advisor
  if (stats.health < 50) {
    messages.push({
      name: 'Health Advisor',
      icon: 'hospital',
      messages: ['Health services are lacking. Build hospitals to improve citizen health.'],
      priority: stats.health < 30 ? 'high' : 'medium',
    });
  }

  // Education advisor
  if (stats.education < 50) {
    messages.push({
      name: 'Education Advisor',
      icon: 'education',
      messages: ['Education levels are low. Build schools and universities.'],
      priority: stats.education < 30 ? 'high' : 'medium',
    });
  }

  // Environment advisor
  if (stats.environment < 40) {
    messages.push({
      name: 'Environment Advisor',
      icon: 'environment',
      messages: ['Pollution is high. Plant trees and build parks to improve air quality.'],
      priority: stats.environment < 20 ? 'high' : 'medium',
    });
  }

  // Jobs advisor
  const jobRatio = stats.jobs / (stats.population || 1);
  if (stats.population > 100 && jobRatio < 0.8) {
    messages.push({
      name: 'Employment Advisor',
      icon: 'jobs',
      messages: [`Unemployment is high. Zone more commercial and industrial areas.`],
      priority: jobRatio < 0.5 ? 'high' : 'medium',
    });
  }

  // Abandonment advisor (data already collected above)
  if (abandonedBuildings > 0) {
    const details: string[] = [];
    if (abandonedResidential > 0) details.push(`${abandonedResidential} residential`);
    if (abandonedCommercial > 0) details.push(`${abandonedCommercial} commercial`);
    if (abandonedIndustrial > 0) details.push(`${abandonedIndustrial} industrial`);
    
    messages.push({
      name: 'Urban Planning Advisor',
      icon: 'planning',
      messages: [
        `${abandonedBuildings} abandoned building${abandonedBuildings > 1 ? 's' : ''} in your city (${details.join(', ')}).`,
        'Oversupply has caused buildings to become vacant.',
        'Increase demand by growing your city or wait for natural redevelopment.'
      ],
      priority: abandonedBuildings > 10 ? 'high' : abandonedBuildings > 5 ? 'medium' : 'low',
    });
  }

  return messages;
}


// Main simulation tick
export function simulateTick(state: GameState): GameState {
  // Optimized: shallow clone rows, deep clone tiles only when modified
  const size = state.gridSize;
  
  // Pre-calculate service coverage once (read-only operation on original grid)
  const services = calculateServiceCoverage(state.grid, size);
  
  // Track which rows have been modified to avoid unnecessary row cloning
  const modifiedRows = new Set<number>();
  const newGrid: Tile[][] = new Array(size);
  
  // Initialize with references to original rows (will clone on write)
  for (let y = 0; y < size; y++) {
    newGrid[y] = state.grid[y];
  }
  
  // Helper to get a modifiable tile (clones row and tile on first write)
  const getModifiableTile = (x: number, y: number): Tile => {
    if (!modifiedRows.has(y)) {
      // Clone the row on first modification
      newGrid[y] = state.grid[y].map(t => ({ ...t, building: { ...t.building } }));
      modifiedRows.add(y);
    }
    return newGrid[y][x];
  };

  // Process all tiles
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const originalTile = state.grid[y][x];
      const originalBuilding = originalTile.building;
      
      // Fast path: skip tiles that definitely won't change
      // Water tiles are completely static
      if (originalBuilding.type === 'water') {
        continue;
      }
      
      // Check what updates this tile needs
      const newPowered = services.power[y][x];
      const newWatered = services.water[y][x];
      const needsPowerWaterUpdate = originalBuilding.powered !== newPowered ||
                                    originalBuilding.watered !== newWatered;

      // PERF: Roads are static unless bulldozed - skip if no utility update needed
      if (originalBuilding.type === 'road' && !needsPowerWaterUpdate) {
        continue;
      }

      // Unzoned grass/trees with no pollution change - skip
      if (originalTile.zone === 'none' &&
          (originalBuilding.type === 'grass' || originalBuilding.type === 'tree') &&
          !needsPowerWaterUpdate &&
          originalTile.pollution < 0.01 &&
          (BUILDING_STATS[originalBuilding.type]?.pollution || 0) === 0) {
        continue;
      }

      // PERF: Completed service/park buildings with no state changes can skip heavy processing
      // They only need utility updates and pollution decay
      const isCompletedServiceBuilding = originalTile.zone === 'none' &&
          originalBuilding.constructionProgress === 100 &&
          !originalBuilding.onFire &&
          originalBuilding.type !== 'grass' &&
          originalBuilding.type !== 'tree' &&
          originalBuilding.type !== 'empty';
      if (isCompletedServiceBuilding && !needsPowerWaterUpdate && originalTile.pollution < 0.01) {
        continue;
      }
      
      // Get modifiable tile for this position
      const tile = getModifiableTile(x, y);
      
      // Update utilities
      tile.building.powered = newPowered;
      tile.building.watered = newWatered;

      // Progress construction for non-zoned buildings (service buildings, parks, etc.)
      // Zoned buildings handle construction in evolveBuilding
      if (tile.zone === 'none' &&
          tile.building.constructionProgress !== undefined &&
          tile.building.constructionProgress < 100 &&
          !NO_CONSTRUCTION_TYPES.includes(tile.building.type)) {
        const isUtilityBuilding = tile.building.type === 'power_plant' || tile.building.type === 'water_tower';
        const canConstruct = isUtilityBuilding || (tile.building.powered && tile.building.watered);
        
        if (canConstruct) {
          const constructionSpeed = getConstructionSpeed(tile.building.type);
          tile.building.constructionProgress = Math.min(100, tile.building.constructionProgress + constructionSpeed);
        }
      }

      // Cleanup orphaned 'empty' tiles
      if (tile.building.type === 'empty') {
        const origin = findBuildingOrigin(newGrid, x, y, size);
        if (!origin) {
          tile.building = createBuilding('grass');
          tile.building.powered = newPowered;
          tile.building.watered = newWatered;
        }
      }

      // Check for road access and grow buildings in zones
      if (tile.zone !== 'none' && tile.building.type === 'grass') {
        const roadAccess = hasRoadAccess(newGrid, x, y, size);
        const hasPower = newPowered;
        const hasWater = newWatered;

        // Get zone demand to factor into spawn probability
        const zoneDemandForSpawn = state.stats.demand ? (
          tile.zone === 'residential' ? state.stats.demand.residential :
          tile.zone === 'commercial' ? state.stats.demand.commercial :
          tile.zone === 'industrial' ? state.stats.demand.industrial : 0
        ) : 0;
        
        // Spawn probability scales with demand:
        // - At demand >= 50: 5% base chance (normal)
        // - At demand 0: 2.5% chance (reduced)
        // - At demand <= -30: 0% chance (no new buildings when oversupplied)
        // This creates natural market response to taxation and supply/demand
        const baseSpawnChance = 0.05;
        const demandFactor = Math.max(0, Math.min(1, (zoneDemandForSpawn + 30) / 80));
        const spawnChance = baseSpawnChance * demandFactor;

        // Starter buildings (house_small, shop_small, farms) can spawn without power/water
        const buildingList = tile.zone === 'residential' ? RESIDENTIAL_BUILDINGS :
          tile.zone === 'commercial' ? COMMERCIAL_BUILDINGS : INDUSTRIAL_BUILDINGS;
        const candidate = buildingList[0];
        const wouldBeStarter = isStarterBuilding(x, y, candidate);
        const hasUtilities = hasPower && hasWater;
        
        if (roadAccess && (hasUtilities || wouldBeStarter) && Math.random() < spawnChance) {
          const candidateSize = getBuildingSize(candidate);
          if (canSpawnMultiTileBuilding(newGrid, x, y, candidateSize.width, candidateSize.height, tile.zone, size)) {
            // Pre-clone all rows that will be modified by the building footprint
            for (let dy = 0; dy < candidateSize.height && y + dy < size; dy++) {
              if (!modifiedRows.has(y + dy)) {
                newGrid[y + dy] = state.grid[y + dy].map(t => ({ ...t, building: { ...t.building } }));
                modifiedRows.add(y + dy);
              }
            }
            applyBuildingFootprint(newGrid, x, y, candidate, tile.zone, 1, services);
          }
        }
      } else if (tile.zone !== 'none' && tile.building.type !== 'grass') {
        // Evolve existing building - this may modify multiple tiles for multi-tile buildings
        // The evolveBuilding function handles its own row modifications internally
        newGrid[y][x].building = evolveBuilding(newGrid, x, y, services, state.stats.demand);
      }

      // Update pollution from buildings
      const buildingStats = BUILDING_STATS[tile.building.type];
      tile.pollution = Math.max(0, tile.pollution * 0.95 + (buildingStats?.pollution || 0));

      // Fire simulation
      if (state.disastersEnabled && tile.building.onFire) {
        const fireCoverage = services.fire[y][x];
        const fightingChance = fireCoverage / 300;
        
        if (Math.random() < fightingChance) {
          tile.building.onFire = false;
          tile.building.fireProgress = 0;
        } else {
          tile.building.fireProgress += 2/3; // Reduced from 1 to make fires last ~50% longer
          if (tile.building.fireProgress >= 100) {
            tile.building = createBuilding('grass');
            tile.zone = 'none';
          }
        }
      }

      // Random fire start
      if (state.disastersEnabled && !tile.building.onFire && 
          tile.building.type !== 'grass' && tile.building.type !== 'water' && 
          tile.building.type !== 'road' && tile.building.type !== 'tree' &&
          tile.building.type !== 'empty' &&
          Math.random() < 0.00003) {
        tile.building.onFire = true;
        tile.building.fireProgress = 0;
      }
    }
  }

  // PERF: Collect all grid metrics in a single pass
  // This replaces 3 separate O(n²) grid scans with 1
  const metrics = collectGridMetrics(newGrid, size);

  // Update budget costs using pre-collected metrics (no grid scan)
  const newBudget = updateBudgetFromMetrics(metrics, state.budget);

  // Gradually move effectiveTaxRate toward taxRate (from TaxSystem)
  // This creates a lagging effect so tax changes don't immediately impact demand
  // Rate of change: 3% of difference per tick, so large changes take ~50-80 ticks (~2-3 game days)
  const newEffectiveTaxRate = updateEffectiveTaxRate(state.effectiveTaxRate, state.taxRate, 0.03);

  // Calculate stats using pre-collected metrics (no grid scan)
  const newStats = calculateStatsFromMetrics(metrics, size, newBudget, state.taxRate, newEffectiveTaxRate, services);
  newStats.money = state.stats.money;

  // Update money on month change
  let newYear = state.year;
  let newMonth = state.month;
  let newDay = state.day;
  let newTick = state.tick + 1;
  
  // Calculate visual hour for day/night cycle (much slower than game time)
  // One full day/night cycle = 15 game days (450 ticks)
  // This makes the cycle atmospheric rather than jarring
  const totalTicks = ((state.year - 2024) * 12 * 30 * 30) + ((state.month - 1) * 30 * 30) + ((state.day - 1) * 30) + newTick;
  const cycleLength = 450; // ticks per visual day (15 game days)
  const newHour = Math.floor((totalTicks % cycleLength) / cycleLength * 24);

  if (newTick >= 30) {
    newTick = 0;
    newDay++;
    // Weekly income/expense (deposit every 7 days at 1/4 monthly rate)
    // Only deposit when day changes to a multiple of 7
    if (newDay % 7 === 0) {
      newStats.money += Math.floor((newStats.income - newStats.expenses) / 4);
    }
  }

  if (newDay > 30) {
    newDay = 1;
    newMonth++;
  }

  if (newMonth > 12) {
    newMonth = 1;
    newYear++;
  }

  // Generate advisor messages using pre-collected metrics (no grid scan)
  const advisorMessages = generateAdvisorMessagesFromMetrics(newStats, metrics);

  // Keep existing notifications
  const newNotifications = [...state.notifications];

  // Keep only recent notifications
  while (newNotifications.length > 10) {
    newNotifications.pop();
  }

  // Update history quarterly
  const history = [...state.history];
  if (newMonth % 3 === 0 && newDay === 1 && newTick === 0) {
    history.push({
      year: newYear,
      month: newMonth,
      population: newStats.population,
      money: newStats.money,
      happiness: newStats.happiness,
    });
    // Keep last 100 entries
    while (history.length > 100) {
      history.shift();
    }
  }

  return {
    ...state,
    grid: newGrid,
    year: newYear,
    month: newMonth,
    day: newDay,
    hour: newHour,
    tick: newTick,
    effectiveTaxRate: newEffectiveTaxRate,
    stats: newStats,
    budget: newBudget,
    services,
    advisorMessages,
    notifications: newNotifications,
    history,
  };
}

// Building sizes for multi-tile buildings (width x height)
// Get construction speed for a building type (larger buildings take longer)
// Returns percentage progress per tick
function getConstructionSpeed(buildingType: BuildingType): number {
  const size = getBuildingSize(buildingType);
  const area = size.width * size.height;

  // Base speed: 24-36% per tick for 1x1 buildings (~3-4 ticks to complete)
  // Scale down by sqrt of area so larger buildings take proportionally longer:
  // - 1x1 (1 tile):  24-36% per tick → ~3-4 ticks
  // - 2x2 (4 tiles): 12-18% per tick → ~6-8 ticks
  // - 3x3 (9 tiles): 8-12% per tick → ~9-12 ticks
  // - 4x4 (16 tiles): 6-9% per tick → ~11-16 ticks
  // Construction takes 30% longer overall (speed reduced by 1/1.3)
  const baseSpeed = 24 + Math.random() * 12;
  return (baseSpeed / Math.sqrt(area)) / 1.3;
}

// Generate a random advanced city state with developed zones, infrastructure, and buildings
export function generateRandomAdvancedCity(size: number = DEFAULT_GRID_SIZE, cityName: string = 'Metropolis'): GameState {
  // Start with a base state (terrain generation)
  const baseState = createInitialGameState(size, cityName);
  const grid = baseState.grid;
  
  // Helper to check if a region is clear (no water)
  const isRegionClear = (x: number, y: number, w: number, h: number): boolean => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tile = grid[y + dy]?.[x + dx];
        if (!tile || tile.building.type === 'water') return false;
      }
    }
    return true;
  };
  
  // Helper to place a road
  const placeRoad = (x: number, y: number): void => {
    const tile = grid[y]?.[x];
    if (tile && tile.building.type !== 'water') {
      tile.building = createAdvancedBuilding('road');
      tile.zone = 'none';
    }
  };
  
  // Helper to create a completed building
  function createAdvancedBuilding(type: BuildingType): Building {
    return {
      type,
      level: type === 'grass' || type === 'empty' || type === 'water' || type === 'road' ? 0 : Math.floor(Math.random() * 3) + 3,
      population: 0,
      jobs: 0,
      powered: true,
      watered: true,
      onFire: false,
      fireProgress: 0,
      age: Math.floor(Math.random() * 100) + 50,
      constructionProgress: 100, // Fully built
      abandoned: false,
    };
  }
  
  // Helper to place a zone with developed building
  const placeZonedBuilding = (x: number, y: number, zone: ZoneType, buildingType: BuildingType): void => {
    const tile = grid[y]?.[x];
    if (tile && tile.building.type !== 'water' && tile.building.type !== 'road') {
      tile.zone = zone;
      tile.building = createAdvancedBuilding(buildingType);
      tile.building.level = Math.floor(Math.random() * 3) + 3;
      const stats = BUILDING_STATS[buildingType];
      if (stats) {
        tile.building.population = Math.floor(stats.maxPop * tile.building.level * 0.7);
        tile.building.jobs = Math.floor(stats.maxJobs * tile.building.level * 0.7);
      }
    }
  };
  
  // Helper to place a multi-tile building
  const placeMultiTileBuilding = (x: number, y: number, type: BuildingType, zone: ZoneType = 'none'): boolean => {
    const buildingSize = getBuildingSize(type);
    if (!isRegionClear(x, y, buildingSize.width, buildingSize.height)) return false;
    if (x + buildingSize.width > size || y + buildingSize.height > size) return false;
    
    // Check for roads in the way
    for (let dy = 0; dy < buildingSize.height; dy++) {
      for (let dx = 0; dx < buildingSize.width; dx++) {
        if (grid[y + dy][x + dx].building.type === 'road') return false;
      }
    }
    
    // Place the building
    for (let dy = 0; dy < buildingSize.height; dy++) {
      for (let dx = 0; dx < buildingSize.width; dx++) {
        const tile = grid[y + dy][x + dx];
        tile.zone = zone;
        if (dx === 0 && dy === 0) {
          tile.building = createAdvancedBuilding(type);
          const stats = BUILDING_STATS[type];
          if (stats) {
            tile.building.population = Math.floor(stats.maxPop * tile.building.level * 0.8);
            tile.building.jobs = Math.floor(stats.maxJobs * tile.building.level * 0.8);
          }
        } else {
          tile.building = createAdvancedBuilding('empty');
          tile.building.level = 0;
        }
      }
    }
    return true;
  };
  
  // Define city center (roughly middle of map, avoiding edges)
  const centerX = Math.floor(size / 2);
  const centerY = Math.floor(size / 2);
  const cityRadius = Math.floor(size * 0.35);
  
  // Create main road grid - major arteries
  const roadSpacing = 6 + Math.floor(Math.random() * 3); // 6-8 tile spacing
  
  // Main horizontal roads
  for (let roadY = centerY - cityRadius; roadY <= centerY + cityRadius; roadY += roadSpacing) {
    if (roadY < 2 || roadY >= size - 2) continue;
    for (let x = Math.max(2, centerX - cityRadius); x <= Math.min(size - 3, centerX + cityRadius); x++) {
      placeRoad(x, roadY);
    }
  }
  
  // Main vertical roads
  for (let roadX = centerX - cityRadius; roadX <= centerX + cityRadius; roadX += roadSpacing) {
    if (roadX < 2 || roadX >= size - 2) continue;
    for (let y = Math.max(2, centerY - cityRadius); y <= Math.min(size - 3, centerY + cityRadius); y++) {
      placeRoad(roadX, y);
    }
  }
  
  // Add some diagonal/curved roads for interest (ring road)
  const ringRadius = cityRadius - 5;
  for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
    const rx = Math.round(centerX + Math.cos(angle) * ringRadius);
    const ry = Math.round(centerY + Math.sin(angle) * ringRadius);
    if (rx >= 2 && rx < size - 2 && ry >= 2 && ry < size - 2) {
      placeRoad(rx, ry);
    }
  }
  
  // Place service buildings first (they need good placement)
  const serviceBuildings: Array<{ type: BuildingType; count: number }> = [
    { type: 'power_plant', count: 4 + Math.floor(Math.random() * 3) },
    { type: 'water_tower', count: 8 + Math.floor(Math.random() * 4) },
    { type: 'police_station', count: 6 + Math.floor(Math.random() * 4) },
    { type: 'fire_station', count: 6 + Math.floor(Math.random() * 4) },
    { type: 'hospital', count: 3 + Math.floor(Math.random() * 2) },
    { type: 'school', count: 5 + Math.floor(Math.random() * 3) },
    { type: 'university', count: 2 + Math.floor(Math.random() * 2) },
  ];
  
  for (const service of serviceBuildings) {
    let placed = 0;
    let attempts = 0;
    while (placed < service.count && attempts < 500) {
      const x = centerX - cityRadius + Math.floor(Math.random() * cityRadius * 2);
      const y = centerY - cityRadius + Math.floor(Math.random() * cityRadius * 2);
      if (placeMultiTileBuilding(x, y, service.type)) {
        placed++;
      }
      attempts++;
    }
  }
  
  // Place special/landmark buildings
  const specialBuildings: BuildingType[] = [
    'city_hall', 'stadium', 'museum', 'airport', 'space_program', 'amusement_park',
    'baseball_stadium', 'amphitheater', 'community_center'
  ];
  
  for (const building of specialBuildings) {
    let attempts = 0;
    while (attempts < 200) {
      const x = centerX - cityRadius + Math.floor(Math.random() * cityRadius * 2);
      const y = centerY - cityRadius + Math.floor(Math.random() * cityRadius * 2);
      if (placeMultiTileBuilding(x, y, building)) break;
      attempts++;
    }
  }
  
  // Place parks and recreation throughout
  const parkBuildings: BuildingType[] = [
    'park', 'park_large', 'tennis', 'basketball_courts', 'playground_small', 
    'playground_large', 'swimming_pool', 'skate_park', 'community_garden', 'pond_park'
  ];
  
  for (let i = 0; i < 25 + Math.floor(Math.random() * 15); i++) {
    const parkType = parkBuildings[Math.floor(Math.random() * parkBuildings.length)];
    let attempts = 0;
    while (attempts < 100) {
      const x = centerX - cityRadius + Math.floor(Math.random() * cityRadius * 2);
      const y = centerY - cityRadius + Math.floor(Math.random() * cityRadius * 2);
      if (placeMultiTileBuilding(x, y, parkType)) break;
      attempts++;
    }
  }
  
  // Zone and develop remaining grass tiles within city radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = grid[y][x];
      if (tile.building.type !== 'grass' && tile.building.type !== 'tree') continue;
      
      // Check distance from center
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (dist > cityRadius) continue;
      
      // Skip tiles not near roads
      let nearRoad = false;
      for (let dy = -2; dy <= 2 && !nearRoad; dy++) {
        for (let dx = -2; dx <= 2 && !nearRoad; dx++) {
          const checkTile = grid[y + dy]?.[x + dx];
          if (checkTile?.building.type === 'road') nearRoad = true;
        }
      }
      if (!nearRoad) continue;
      
      // Determine zone based on distance from center and some randomness
      const normalizedDist = dist / cityRadius;
      let zone: ZoneType;
      let buildingType: BuildingType;
      
      const rand = Math.random();
      
      if (normalizedDist < 0.3) {
        // Downtown - mostly commercial with some high-density residential
        if (rand < 0.6) {
          zone = 'commercial';
          const commercialTypes: BuildingType[] = ['shop_small', 'shop_medium', 'office_low', 'office_high', 'mall'];
          buildingType = commercialTypes[Math.floor(Math.random() * commercialTypes.length)];
        } else {
          zone = 'residential';
          const residentialTypes: BuildingType[] = ['apartment_low', 'apartment_high'];
          buildingType = residentialTypes[Math.floor(Math.random() * residentialTypes.length)];
        }
      } else if (normalizedDist < 0.6) {
        // Mid-city - mixed use
        if (rand < 0.5) {
          zone = 'residential';
          const residentialTypes: BuildingType[] = ['house_medium', 'mansion', 'apartment_low'];
          buildingType = residentialTypes[Math.floor(Math.random() * residentialTypes.length)];
        } else if (rand < 0.8) {
          zone = 'commercial';
          const commercialTypes: BuildingType[] = ['shop_small', 'shop_medium', 'office_low'];
          buildingType = commercialTypes[Math.floor(Math.random() * commercialTypes.length)];
        } else {
          zone = 'industrial';
          buildingType = 'factory_small';
        }
      } else {
        // Outer areas - more residential and industrial
        if (rand < 0.5) {
          zone = 'residential';
          const residentialTypes: BuildingType[] = ['house_small', 'house_medium'];
          buildingType = residentialTypes[Math.floor(Math.random() * residentialTypes.length)];
        } else if (rand < 0.7) {
          zone = 'industrial';
          const industrialTypes: BuildingType[] = ['factory_small', 'factory_medium', 'warehouse'];
          buildingType = industrialTypes[Math.floor(Math.random() * industrialTypes.length)];
        } else {
          zone = 'commercial';
          buildingType = 'shop_small';
        }
      }
      
      // Handle multi-tile buildings
      const bSize = getBuildingSize(buildingType);
      if (bSize.width > 1 || bSize.height > 1) {
        placeMultiTileBuilding(x, y, buildingType, zone);
      } else {
        placeZonedBuilding(x, y, zone, buildingType);
      }
    }
  }
  
  // Add some trees in remaining grass areas
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = grid[y][x];
      if (tile.building.type === 'grass' && Math.random() < 0.15) {
        tile.building = createAdvancedBuilding('tree');
      }
    }
  }
  
  // Add subway network in the city center
  for (let y = centerY - Math.floor(cityRadius * 0.6); y <= centerY + Math.floor(cityRadius * 0.6); y++) {
    for (let x = centerX - Math.floor(cityRadius * 0.6); x <= centerX + Math.floor(cityRadius * 0.6); x++) {
      const tile = grid[y]?.[x];
      if (tile && tile.building.type !== 'water') {
        // Place subway along main roads
        const onMainRoad = (x % roadSpacing === centerX % roadSpacing) || (y % roadSpacing === centerY % roadSpacing);
        if (onMainRoad && Math.random() < 0.7) {
          tile.hasSubway = true;
        }
      }
    }
  }
  
  // Place subway stations at key intersections
  const subwayStationSpacing = roadSpacing * 2;
  for (let y = centerY - cityRadius; y <= centerY + cityRadius; y += subwayStationSpacing) {
    for (let x = centerX - cityRadius; x <= centerX + cityRadius; x += subwayStationSpacing) {
      const tile = grid[y]?.[x];
      if (tile && tile.building.type === 'grass' && tile.zone === 'none') {
        tile.building = createAdvancedBuilding('subway_station');
        tile.hasSubway = true;
      }
    }
  }
  
  // Calculate services and stats
  const services = calculateServiceCoverage(grid, size);
  
  // Set power and water for all buildings
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      grid[y][x].building.powered = services.power[y][x];
      grid[y][x].building.watered = services.water[y][x];
    }
  }
  
  // Calculate initial stats
  let totalPopulation = 0;
  let totalJobs = 0;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const building = grid[y][x].building;
      totalPopulation += building.population;
      totalJobs += building.jobs;
    }
  }
  
  // Create the final state
  return {
    ...baseState,
    grid,
    cityName,
    year: 2024 + Math.floor(Math.random() * 50), // Random year in future
    month: Math.floor(Math.random() * 12) + 1,
    day: Math.floor(Math.random() * 28) + 1,
    hour: 12,
    tick: 0,
    speed: 1,
    selectedTool: 'select',
    taxRate: 7 + Math.floor(Math.random() * 4), // 7-10%
    effectiveTaxRate: 8,
    stats: {
      population: totalPopulation,
      jobs: totalJobs,
      money: 500000 + Math.floor(Math.random() * 1000000),
      income: Math.floor(totalPopulation * 0.8 + totalJobs * 0.4),
      expenses: Math.floor((totalPopulation + totalJobs) * 0.3),
      happiness: 65 + Math.floor(Math.random() * 20),
      health: 60 + Math.floor(Math.random() * 25),
      education: 55 + Math.floor(Math.random() * 30),
      safety: 60 + Math.floor(Math.random() * 25),
      environment: 50 + Math.floor(Math.random() * 30),
      demand: {
        residential: 20 + Math.floor(Math.random() * 40),
        commercial: 15 + Math.floor(Math.random() * 35),
        industrial: 10 + Math.floor(Math.random() * 30),
      },
    },
    services,
    notifications: [],
    advisorMessages: [],
    history: [],
    activePanel: 'none',
    disastersEnabled: true,
  };
}

// Diagnostic function to explain why a zoned tile isn't developing a building
export interface DevelopmentBlocker {
  reason: string;
  details: string;
}

export function getDevelopmentBlockers(
  state: GameState,
  x: number,
  y: number
): DevelopmentBlocker[] {
  const blockers: DevelopmentBlocker[] = [];
  const tile = state.grid[y]?.[x];
  
  if (!tile) {
    blockers.push({ reason: 'Invalid tile', details: `Tile at (${x}, ${y}) does not exist` });
    return blockers;
  }
  
  // Only analyze zoned tiles
  if (tile.zone === 'none') {
    blockers.push({ reason: 'Not zoned', details: 'Tile has no zone assigned' });
    return blockers;
  }
  
  // If it already has a building, no blockers
  if (tile.building.type !== 'grass' && tile.building.type !== 'tree') {
    // It's already developed or is a placeholder for a multi-tile building
    return blockers;
  }
  
  // Check road access
  const roadAccess = hasRoadAccess(state.grid, x, y, state.gridSize);
  if (!roadAccess) {
    blockers.push({
      reason: 'No road access',
      details: 'Tile must be within 8 tiles of a road (through same-zone tiles)'
    });
  }
  
  // Check if multi-tile building can spawn here
  const buildingList = tile.zone === 'residential' ? RESIDENTIAL_BUILDINGS :
    tile.zone === 'commercial' ? COMMERCIAL_BUILDINGS : INDUSTRIAL_BUILDINGS;
  const candidate = buildingList[0];
  
  // Starter buildings (house_small, shop_small, factory_small) don't require power/water
  // They represent small-scale, self-sufficient operations
  const wouldBeStarter = isStarterBuilding(x, y, candidate);
  
  // Check power (not required for starter buildings)
  const hasPower = state.services.power[y][x];
  if (!hasPower && !wouldBeStarter) {
    blockers.push({
      reason: 'No power',
      details: 'Build a power plant nearby to provide electricity'
    });
  }
  
  // Check water (not required for starter buildings)
  const hasWater = state.services.water[y][x];
  if (!hasWater && !wouldBeStarter) {
    blockers.push({
      reason: 'No water',
      details: 'Build a water tower nearby to provide water'
    });
  }
  const candidateSize = getBuildingSize(candidate);
  
  if (candidateSize.width > 1 || candidateSize.height > 1) {
    // Check if the footprint is available
    if (!canSpawnMultiTileBuilding(state.grid, x, y, candidateSize.width, candidateSize.height, tile.zone, state.gridSize)) {
      // Find out specifically why
      const footprintBlockers: string[] = [];
      
      if (x + candidateSize.width > state.gridSize || y + candidateSize.height > state.gridSize) {
        footprintBlockers.push('Too close to map edge');
      }
      
      for (let dy = 0; dy < candidateSize.height && footprintBlockers.length < 3; dy++) {
        for (let dx = 0; dx < candidateSize.width && footprintBlockers.length < 3; dx++) {
          const checkTile = state.grid[y + dy]?.[x + dx];
          if (!checkTile) {
            footprintBlockers.push(`Tile (${x + dx}, ${y + dy}) is out of bounds`);
          } else if (checkTile.zone !== tile.zone) {
            footprintBlockers.push(`Tile (${x + dx}, ${y + dy}) has different zone: ${checkTile.zone}`);
          } else if (checkTile.building.type !== 'grass' && checkTile.building.type !== 'tree') {
            footprintBlockers.push(`Tile (${x + dx}, ${y + dy}) has ${checkTile.building.type}`);
          }
        }
      }
      
      blockers.push({
        reason: 'Footprint blocked',
        details: `${candidate} needs ${candidateSize.width}x${candidateSize.height} tiles. Issues: ${footprintBlockers.join('; ')}`
      });
    }
  }
  
  // If no blockers found, it's just waiting for RNG
  const hasUtilities = hasPower && hasWater;
  if (blockers.length === 0 && roadAccess && (hasUtilities || wouldBeStarter)) {
    blockers.push({
      reason: 'Waiting for development',
      details: wouldBeStarter && !hasUtilities 
        ? 'Starter building can develop here without utilities! (5% chance per tick)' 
        : 'All conditions met! Building will spawn soon (5% chance per tick)'
    });
  }
  
  return blockers;
}
