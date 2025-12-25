import type { Budget } from '@/types/game';

/**
 * BudgetSystem - Handles budget initialization and updates
 * Extracted from simulation.ts for better modularity
 */

export interface GridMetrics {
  // Population & Jobs
  population: number;
  jobs: number;

  // Environment
  totalPollution: number;
  totalLandValue: number;
  treeCount: number;
  waterCount: number;
  parkCount: number;

  // Zone counts
  residentialZones: number;
  commercialZones: number;
  industrialZones: number;
  developedResidential: number;
  developedCommercial: number;
  developedIndustrial: number;

  // Transport
  subwayTiles: number;
  subwayStations: number;
  railTiles: number;
  railStations: number;
  roadCount: number;

  // Special buildings
  hasAirport: boolean;
  hasCityHall: boolean;
  hasSpaceProgram: boolean;
  stadiumCount: number;
  museumCount: number;
  hasAmusementPark: boolean;

  // Budget building counts
  policeCount: number;
  fireCount: number;
  hospitalCount: number;
  schoolCount: number;
  universityCount: number;
  powerCount: number;
  waterTowerCount: number;

  // Problem tracking
  unpoweredBuildings: number;
  unwateredBuildings: number;
  abandonedBuildings: number;
  abandonedResidential: number;
  abandonedCommercial: number;
  abandonedIndustrial: number;
}

/**
 * Creates the initial budget state with all departments at 100% funding
 */
export function createInitialBudget(): Budget {
  return {
    police: { name: 'Police', funding: 100, cost: 0 },
    fire: { name: 'Fire', funding: 100, cost: 0 },
    health: { name: 'Health', funding: 100, cost: 0 },
    education: { name: 'Education', funding: 100, cost: 0 },
    transportation: { name: 'Transportation', funding: 100, cost: 0 },
    parks: { name: 'Parks', funding: 100, cost: 0 },
    power: { name: 'Power', funding: 100, cost: 0 },
    water: { name: 'Water', funding: 100, cost: 0 },
  };
}

/**
 * Updates budget costs based on building counts from grid metrics
 * PERF: Uses pre-collected metrics to avoid grid scanning
 */
export function updateBudgetFromMetrics(metrics: GridMetrics, budget: Budget): Budget {
  const newBudget = { ...budget };

  newBudget.police.cost = metrics.policeCount * 50;
  newBudget.fire.cost = metrics.fireCount * 50;
  newBudget.health.cost = metrics.hospitalCount * 100;
  newBudget.education.cost = metrics.schoolCount * 30 + metrics.universityCount * 100;
  newBudget.transportation.cost = metrics.roadCount * 2 + metrics.subwayTiles * 3 + metrics.subwayStations * 25;
  newBudget.parks.cost = metrics.parkCount * 10;
  newBudget.power.cost = metrics.powerCount * 150;
  newBudget.water.cost = metrics.waterTowerCount * 75;

  return newBudget;
}

/**
 * Calculates total expenses based on budget categories and funding levels
 */
export function calculateExpenses(budget: Budget): number {
  let expenses = 0;
  expenses += Math.floor(budget.police.cost * budget.police.funding / 100);
  expenses += Math.floor(budget.fire.cost * budget.fire.funding / 100);
  expenses += Math.floor(budget.health.cost * budget.health.funding / 100);
  expenses += Math.floor(budget.education.cost * budget.education.funding / 100);
  expenses += Math.floor(budget.transportation.cost * budget.transportation.funding / 100);
  expenses += Math.floor(budget.parks.cost * budget.parks.funding / 100);
  expenses += Math.floor(budget.power.cost * budget.power.funding / 100);
  expenses += Math.floor(budget.water.cost * budget.water.funding / 100);
  return expenses;
}
