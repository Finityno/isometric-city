'use client';

import React, { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CloseIcon,
  PowerIcon,
  WaterIcon,
  FireIcon,
  SafetyIcon,
  HealthIcon,
  EducationIcon,
  SubwayIcon,
} from '@/components/ui/Icons';
import { OverlayMode } from './types';
import { OVERLAY_CONFIG, getOverlayButtonClass } from './overlays';

// ============================================================================
// Types
// ============================================================================

export interface OverlayModeToggleProps {
  overlayMode: OverlayMode;
  setOverlayMode: (mode: OverlayMode) => void;
}

// ============================================================================
// Static Constants (computed once at module load)
// ============================================================================

/** Pre-computed overlay modes array to avoid Object.keys on every render */
const OVERLAY_MODES = Object.keys(OVERLAY_CONFIG) as OverlayMode[];

/** Map overlay modes to their icons - stable references */
const OVERLAY_ICONS: Record<OverlayMode, React.ReactNode> = {
  none: <CloseIcon size={14} />,
  power: <PowerIcon size={14} />,
  water: <WaterIcon size={14} />,
  fire: <FireIcon size={14} />,
  police: <SafetyIcon size={14} />,
  health: <HealthIcon size={14} />,
  education: <EducationIcon size={14} />,
  subway: <SubwayIcon size={14} />,
};

/** Static label element - extracted to avoid recreation */
const LABEL_ELEMENT = (
  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-2">
    View Overlay
  </div>
);

// ============================================================================
// Memoized Button Component
// ============================================================================

interface OverlayButtonProps {
  mode: OverlayMode;
  isActive: boolean;
  onClick: (mode: OverlayMode) => void;
}

/** Individual overlay button - memoized to prevent re-renders when other buttons change */
const OverlayButton = React.memo(function OverlayButton({
  mode,
  isActive,
  onClick,
}: OverlayButtonProps) {
  const config = OVERLAY_CONFIG[mode];

  const handleClick = useCallback(() => {
    onClick(mode);
  }, [onClick, mode]);

  const className = useMemo(
    () => `h-8 px-3 ${getOverlayButtonClass(mode, isActive)}`,
    [mode, isActive]
  );

  return (
    <Button
      variant={isActive ? 'default' : 'ghost'}
      size="sm"
      onClick={handleClick}
      className={className}
      title={config.title}
    >
      {OVERLAY_ICONS[mode]}
    </Button>
  );
});

// ============================================================================
// Main Component
// ============================================================================

/**
 * Overlay mode toggle component.
 * Allows users to switch between different visualization overlays
 * (power grid, water system, service coverage, etc.)
 *
 * Performance optimizations:
 * - Static constants extracted outside component
 * - Individual buttons memoized to prevent cascade re-renders
 * - Click handlers properly memoized
 */
export const OverlayModeToggle = React.memo(function OverlayModeToggle({
  overlayMode,
  setOverlayMode,
}: OverlayModeToggleProps) {
  return (
    <Card className="absolute bottom-4 left-4 p-2 shadow-lg bg-card/90 border-border/70 z-50">
      {LABEL_ELEMENT}
      <div className="flex gap-1">
        {OVERLAY_MODES.map((mode) => (
          <OverlayButton
            key={mode}
            mode={mode}
            isActive={overlayMode === mode}
            onClick={setOverlayMode}
          />
        ))}
      </div>
    </Card>
  );
});
