import type { GridMetrics } from './BudgetSystem';

/**
 * DemandSystem - Handles RCI (Residential/Commercial/Industrial) demand calculations
 * Extracted from simulation.ts for better modularity
 */

export interface DemandResult {
  residential: number;
  commercial: number;
  industrial: number;
}

/**
 * Calculates RCI demand based on city metrics, special buildings, and tax effects
 *
 * Demand is calculated from:
 * 1. Base economic factors (population vs jobs balance)
 * 2. Special building bonuses (airport, city hall, stadium, etc.)
 * 3. Transportation infrastructure bonuses (subway, rail)
 * 4. Tax effects (both multiplicative and additive)
 *
 * Tax rate affects demand as BOTH a multiplier and additive modifier:
 * - Multiplier: At 100% tax, demand is reduced to 0 regardless of other factors
 * - Additive: Small bonus/penalty around the base rate for fine-tuning
 * Uses effectiveTaxRate (lagged) so changes don't impact demand immediately
 *
 * @param metrics - Grid metrics with population, jobs, and building counts
 * @param taxMultiplier - Tax multiplier from TaxSystem (0.0 to 1.0+)
 * @param taxAdditiveModifier - Tax additive modifier from TaxSystem
 * @returns Demand values for residential, commercial, and industrial (-100 to 100)
 */
export function calculateDemand(
  metrics: GridMetrics,
  taxMultiplier: number,
  taxAdditiveModifier: number
): DemandResult {
  const {
    population,
    jobs,
    subwayTiles,
    subwayStations,
    railTiles,
    railStations,
    hasAirport,
    hasCityHall,
    hasSpaceProgram,
    stadiumCount,
    museumCount,
    hasAmusementPark,
  } = metrics;

  // Subway network boosts commercial demand
  const subwayBonus = Math.min(20, subwayTiles * 0.5 + subwayStations * 3);

  // Rail network bonuses - affects commercial (passenger rail, accessibility) and industrial (freight transport)
  // Rail stations have bigger impact than raw track count since they represent actual service
  // Industrial gets a stronger bonus as freight rail is critical for factories/warehouses
  const railCommercialBonus = Math.min(12, railTiles * 0.15 + railStations * 4);
  const railIndustrialBonus = Math.min(18, railTiles * 0.25 + railStations * 6);

  // Special building bonuses
  // Airport: Major boost to commercial (business travel) and industrial (cargo/logistics)
  const airportCommercialBonus = hasAirport ? 15 : 0;
  const airportIndustrialBonus = hasAirport ? 10 : 0;

  // City Hall: Modest boost to all demand (legitimacy, attracts businesses and residents)
  const cityHallResidentialBonus = hasCityHall ? 8 : 0;
  const cityHallCommercialBonus = hasCityHall ? 10 : 0;
  const cityHallIndustrialBonus = hasCityHall ? 5 : 0;

  // Space Program: Big boost to industrial (high-tech sector), modest boost to residential (prestige)
  const spaceProgramResidentialBonus = hasSpaceProgram ? 10 : 0;
  const spaceProgramIndustrialBonus = hasSpaceProgram ? 20 : 0;

  // Stadium: Boost to commercial (entertainment, visitors, sports bars)
  const stadiumCommercialBonus = Math.min(20, stadiumCount * 12);

  // Museum: Boost to commercial (tourism) and residential (culture/quality of life)
  const museumCommercialBonus = Math.min(15, museumCount * 8);
  const museumResidentialBonus = Math.min(10, museumCount * 5);

  // Amusement Park: Big boost to commercial (tourism, entertainment)
  const amusementParkCommercialBonus = hasAmusementPark ? 18 : 0;

  // Calculate base demands from economic factors
  const baseResidentialDemand = (jobs - population * 0.7) / 18;
  const baseCommercialDemand = (population * 0.3 - jobs * 0.3) / 4 + subwayBonus;
  const baseIndustrialDemand = (population * 0.35 - jobs * 0.3) / 2.0;

  // Add special building bonuses to base demands
  const residentialWithBonuses = baseResidentialDemand + cityHallResidentialBonus + spaceProgramResidentialBonus + museumResidentialBonus;
  const commercialWithBonuses = baseCommercialDemand + airportCommercialBonus + cityHallCommercialBonus + stadiumCommercialBonus + museumCommercialBonus + amusementParkCommercialBonus + railCommercialBonus;
  const industrialWithBonuses = baseIndustrialDemand + airportIndustrialBonus + cityHallIndustrialBonus + spaceProgramIndustrialBonus + railIndustrialBonus;

  // Apply tax effect: multiply by tax factor, then add small modifier
  // The multiplier ensures high taxes crush demand; the additive fine-tunes at normal rates
  const residentialDemand = Math.min(100, Math.max(-100, residentialWithBonuses * taxMultiplier + taxAdditiveModifier));
  const commercialDemand = Math.min(100, Math.max(-100, commercialWithBonuses * taxMultiplier + taxAdditiveModifier * 0.8));
  const industrialDemand = Math.min(100, Math.max(-100, industrialWithBonuses * taxMultiplier + taxAdditiveModifier * 0.5));

  return {
    residential: residentialDemand,
    commercial: commercialDemand,
    industrial: industrialDemand,
  };
}
