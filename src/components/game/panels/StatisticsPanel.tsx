'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/store/gameStore';
import { useSetActivePanel } from '@/store/selectors';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================================================
// FINE-GRAINED SELECTORS
// ============================================================================

// Only select stats fields we actually use (avoids re-render on other stat changes)
const useStatsPanelData = () => useGameStore(
  useShallow((s) => ({
    population: s.stats.population,
    jobs: s.stats.jobs,
    money: s.stats.money,
    income: s.stats.income,
    expenses: s.stats.expenses,
  }))
);

// History changes less frequently, separate selector
const useHistoryData = () => useGameStore((s) => s.history);

// ============================================================================
// CONSTANTS
// ============================================================================

const CANVAS_WIDTH = 536;
const CANVAS_HEIGHT = 200;
const PADDING = 40;
const CHART_COLORS = {
  population: '#10b981',
  money: '#f59e0b',
  happiness: '#ec4899',
} as const;
const GRID_COLOR = '#2d3748';
const BG_COLOR = '#1a1f2e';

type TabType = 'population' | 'money' | 'happiness';

// ============================================================================
// MEMOIZED STAT CARD COMPONENT
// ============================================================================

interface StatCardProps {
  label: string;
  value: string;
  colorClass: string;
}

const StatCard = memo(function StatCard({ label, value, colorClass }: StatCardProps) {
  return (
    <Card className="p-2 sm:p-3">
      <div className="text-muted-foreground text-[10px] sm:text-xs mb-1">{label}</div>
      <div className={`font-mono tabular-nums font-semibold text-sm sm:text-base truncate ${colorClass}`}>
        {value}
      </div>
    </Card>
  );
});

// ============================================================================
// MEMOIZED CHART COMPONENT
// ============================================================================

interface ChartCanvasProps {
  data: number[];
  color: string;
}

const ChartCanvas = memo(function ChartCanvas({ data, color }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and fill background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Calculate bounds using a single pass
    let minVal = data[0];
    let maxVal = data[0];
    for (let i = 1; i < data.length; i++) {
      const val = data[i];
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
    const range = maxVal - minVal || 1;

    const chartHeight = CANVAS_HEIGHT - PADDING * 2;
    const chartWidth = CANVAS_WIDTH - PADDING * 2;

    // Draw grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = PADDING + chartHeight * (i / 4);
      ctx.moveTo(PADDING, y);
      ctx.lineTo(CANVAS_WIDTH - PADDING, y);
    }
    ctx.stroke();

    // Draw data line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const stepX = chartWidth / (data.length - 1);

    for (let i = 0; i < data.length; i++) {
      const x = PADDING + i * stepX;
      const y = PADDING + chartHeight * (1 - (data[i] - minVal) / range);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }, [data, color]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="w-full rounded-md"
    />
  );
});

// ============================================================================
// MEMOIZED STATS CARDS CONTAINER
// ============================================================================

const StatsCards = memo(function StatsCards() {
  const stats = useStatsPanelData();

  // Memoize formatted values to avoid recalculating on each render
  const formattedValues = useMemo(() => {
    const weeklyBalance = Math.floor((stats.income - stats.expenses) / 4);
    return {
      population: stats.population.toLocaleString(),
      jobs: stats.jobs.toLocaleString(),
      money: `$${stats.money.toLocaleString()}`,
      weekly: `$${weeklyBalance.toLocaleString()}`,
      weeklyPositive: weeklyBalance >= 0,
    };
  }, [stats.population, stats.jobs, stats.money, stats.income, stats.expenses]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      <StatCard
        label="Population"
        value={formattedValues.population}
        colorClass="text-green-400"
      />
      <StatCard
        label="Jobs"
        value={formattedValues.jobs}
        colorClass="text-blue-400"
      />
      <StatCard
        label="Treasury"
        value={formattedValues.money}
        colorClass="text-amber-400"
      />
      <StatCard
        label="Weekly"
        value={formattedValues.weekly}
        colorClass={formattedValues.weeklyPositive ? 'text-green-400' : 'text-red-400'}
      />
    </div>
  );
});

// ============================================================================
// MEMOIZED CHART SECTION
// ============================================================================

interface ChartSectionProps {
  activeTab: TabType;
}

const ChartSection = memo(function ChartSection({ activeTab }: ChartSectionProps) {
  const history = useHistoryData();

  // Memoize chart data extraction - only recalculate when history or tab changes
  const chartData = useMemo(() => {
    if (history.length < 2) return null;

    // Extract only the data we need for the current tab
    switch (activeTab) {
      case 'population':
        return history.map(h => h.population);
      case 'money':
        return history.map(h => h.money);
      case 'happiness':
        return history.map(h => h.happiness);
    }
  }, [history, activeTab]);

  const chartColor = CHART_COLORS[activeTab];

  if (!chartData) {
    return (
      <Card className="p-4">
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          Not enough data yet. Keep playing to see historical trends.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <ChartCanvas data={chartData} color={chartColor} />
    </Card>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const StatisticsPanel = memo(function StatisticsPanel() {
  const setActivePanel = useSetActivePanel();
  const [activeTab, setActiveTab] = useState<TabType>('population');

  // Stable callback for closing dialog
  const handleClose = useCallback(() => {
    setActivePanel('none');
  }, [setActivePanel]);

  // Stable callback for tab changes
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabType);
  }, []);

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>City Statistics</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <StatsCards />

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="population" className="text-xs sm:text-sm py-2 px-2 sm:px-3">
                Population
              </TabsTrigger>
              <TabsTrigger value="money" className="text-xs sm:text-sm py-2 px-2 sm:px-3">
                Money
              </TabsTrigger>
              <TabsTrigger value="happiness" className="text-xs sm:text-sm py-2 px-2 sm:px-3">
                Happiness
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <ChartSection activeTab={activeTab} />
        </div>
      </DialogContent>
    </Dialog>
  );
});
