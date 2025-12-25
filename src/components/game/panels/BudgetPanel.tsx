'use client';

import React, { memo, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/store/gameStore';
import {
  useSetActivePanel,
  useSetBudgetFunding,
} from '@/store/selectors';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import type { Budget } from '@/types/game';

// ============================================================================
// FINE-GRAINED SELECTORS
// ============================================================================

/** Select only budget data needed for the panel - avoids re-renders from unrelated state changes */
const useBudgetPanelData = () => useGameStore(
  useShallow((s) => ({
    income: s.stats.income,
    expenses: s.stats.expenses,
    budget: s.budget,
  }))
);

// ============================================================================
// CACHED NUMBER FORMATTER
// ============================================================================

// Cache for formatted currency strings to avoid repeated toLocaleString calls
const formatCache = new Map<number, string>();
const MAX_CACHE_SIZE = 100;

function formatCurrency(value: number): string {
  let formatted = formatCache.get(value);
  if (formatted === undefined) {
    formatted = `$${value.toLocaleString()}/mo`;
    // Prevent unbounded cache growth
    if (formatCache.size >= MAX_CACHE_SIZE) {
      const firstKey = formatCache.keys().next().value;
      if (firstKey !== undefined) formatCache.delete(firstKey);
    }
    formatCache.set(value, formatted);
  }
  return formatted;
}

// ============================================================================
// BUDGET CATEGORY KEYS (stable reference)
// ============================================================================

const BUDGET_CATEGORY_KEYS = [
  'police',
  'fire',
  'health',
  'education',
  'transportation',
  'parks',
  'power',
  'water',
] as const;

type BudgetCategoryKey = typeof BUDGET_CATEGORY_KEYS[number];

// ============================================================================
// MEMOIZED SUB-COMPONENTS
// ============================================================================

interface SummaryItemProps {
  label: string;
  value: string;
  colorClass: string;
}

/** Memoized summary item to prevent re-renders when other items change */
const SummaryItem = memo(function SummaryItem({ label, value, colorClass }: SummaryItemProps) {
  return (
    <div>
      <div className="text-muted-foreground text-xs mb-1">{label}</div>
      <div className={`font-mono ${colorClass}`}>{value}</div>
    </div>
  );
});

interface BudgetSummaryProps {
  income: number;
  expenses: number;
}

/** Memoized budget summary section */
const BudgetSummary = memo(function BudgetSummary({ income, expenses }: BudgetSummaryProps) {
  // Memoize formatted values and net calculation
  const { incomeFormatted, expensesFormatted, netFormatted, netColorClass } = useMemo(() => {
    const net = income - expenses;
    return {
      incomeFormatted: formatCurrency(income),
      expensesFormatted: formatCurrency(expenses),
      netFormatted: formatCurrency(net),
      netColorClass: net >= 0 ? 'text-green-400' : 'text-red-400',
    };
  }, [income, expenses]);

  return (
    <div className="grid grid-cols-3 gap-4 pb-4 border-b border-border">
      <SummaryItem label="Income" value={incomeFormatted} colorClass="text-green-400" />
      <SummaryItem label="Expenses" value={expensesFormatted} colorClass="text-red-400" />
      <SummaryItem label="Net" value={netFormatted} colorClass={netColorClass} />
    </div>
  );
});

interface CategorySliderProps {
  categoryKey: BudgetCategoryKey;
  name: string;
  funding: number;
  onFundingChange: (key: BudgetCategoryKey, value: number) => void;
}

/** Memoized category slider row - only re-renders when its specific funding changes */
const CategorySlider = memo(function CategorySlider({
  categoryKey,
  name,
  funding,
  onFundingChange,
}: CategorySliderProps) {
  // Memoize the slider value array to prevent Slider re-renders
  const sliderValue = useMemo(() => [funding], [funding]);

  // Memoize the change handler for this specific category
  const handleValueChange = useCallback(
    (value: number[]) => onFundingChange(categoryKey, value[0]),
    [categoryKey, onFundingChange]
  );

  return (
    <div className="flex items-center gap-4">
      <Label className="w-28 text-sm">{name}</Label>
      <Slider
        value={sliderValue}
        onValueChange={handleValueChange}
        min={0}
        max={100}
        step={5}
        className="flex-1"
      />
      <span className="w-12 text-right font-mono text-sm">{funding}%</span>
    </div>
  );
});

interface CategoryListProps {
  budget: Budget;
  onFundingChange: (key: BudgetCategoryKey, value: number) => void;
}

/** Memoized category list - re-renders only when budget object changes */
const CategoryList = memo(function CategoryList({ budget, onFundingChange }: CategoryListProps) {
  return (
    <div className="space-y-4">
      {BUDGET_CATEGORY_KEYS.map((key) => (
        <CategorySlider
          key={key}
          categoryKey={key}
          name={budget[key].name}
          funding={budget[key].funding}
          onFundingChange={onFundingChange}
        />
      ))}
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const BudgetPanel = memo(function BudgetPanel() {
  // Fine-grained selector - only subscribes to budget-related data
  const { income, expenses, budget } = useBudgetPanelData();

  // Action selectors - stable references, never cause re-renders
  const setActivePanel = useSetActivePanel();
  const setBudgetFunding = useSetBudgetFunding();

  // Memoize dialog close handler
  const handleOpenChange = useCallback(() => {
    setActivePanel('none');
  }, [setActivePanel]);

  // Memoize funding change handler with proper typing
  const handleFundingChange = useCallback(
    (key: BudgetCategoryKey, value: number) => {
      setBudgetFunding(key, value);
    },
    [setBudgetFunding]
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Budget</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <BudgetSummary income={income} expenses={expenses} />
          <CategoryList budget={budget} onFundingChange={handleFundingChange} />
        </div>
      </DialogContent>
    </Dialog>
  );
});
