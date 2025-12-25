/**
 * Economy Module - Handles budget, taxes, and demand calculations
 *
 * Extracted from simulation.ts for better modularity and maintainability.
 *
 * @module economy
 */

// Budget System
export {
  createInitialBudget,
  updateBudgetFromMetrics,
  calculateExpenses,
  type GridMetrics,
} from './BudgetSystem';

// Tax System
export {
  calculateIncome,
  calculateTaxMultiplier,
  calculateTaxAdditiveModifier,
  updateEffectiveTaxRate,
} from './TaxSystem';

// Demand System
export {
  calculateDemand,
  type DemandResult,
} from './DemandSystem';
