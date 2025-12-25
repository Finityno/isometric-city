/**
 * TaxSystem - Handles tax calculations and income
 * Extracted from simulation.ts for better modularity
 */

/**
 * Calculates tax income from population and jobs
 * @param population - Current city population
 * @param jobs - Current number of jobs
 * @param taxRate - Tax rate percentage (0-100)
 * @returns Monthly tax income
 */
export function calculateIncome(population: number, jobs: number, taxRate: number): number {
  return Math.floor(population * taxRate * 0.1 + jobs * taxRate * 0.05);
}

/**
 * Calculates tax multiplier for demand calculations
 * Tax multiplier: 1.0 at 0% tax, ~1.0 at 9% tax (base), 0.0 at 100% tax
 * This ensures high taxes dramatically reduce demand regardless of other factors
 * @param effectiveTaxRate - Lagged tax rate (0-100)
 * @returns Multiplier value (0.0 to 1.0+)
 */
export function calculateTaxMultiplier(effectiveTaxRate: number): number {
  return Math.max(0, 1 - (effectiveTaxRate - 9) / 91);
}

/**
 * Calculates tax additive modifier for demand fine-tuning
 * Small additive modifier for fine-tuning around base rate
 * At 9% tax: 0. At 0% tax: +18. At 20% tax: -22
 * @param effectiveTaxRate - Lagged tax rate (0-100)
 * @returns Additive modifier value
 */
export function calculateTaxAdditiveModifier(effectiveTaxRate: number): number {
  return (9 - effectiveTaxRate) * 2;
}

/**
 * Updates effective tax rate by gradually moving it toward the actual tax rate
 * This creates a lagging effect so tax changes don't immediately impact demand
 * @param currentEffectiveTaxRate - Current lagged tax rate
 * @param targetTaxRate - Target tax rate
 * @param lagFactor - How quickly to catch up (default: 0.03 = 3% per tick)
 * @returns New effective tax rate
 */
export function updateEffectiveTaxRate(
  currentEffectiveTaxRate: number,
  targetTaxRate: number,
  lagFactor: number = 0.03
): number {
  const taxRateDiff = targetTaxRate - currentEffectiveTaxRate;
  return currentEffectiveTaxRate + taxRateDiff * lagFactor;
}
