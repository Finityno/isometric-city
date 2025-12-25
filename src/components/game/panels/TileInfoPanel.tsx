'use client';

import React, { memo, useMemo } from 'react';
import { Tile } from '@/types/game';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CloseIcon } from '@/components/ui/Icons';

// ============================================================================
// TYPES
// ============================================================================

interface TileInfoPanelProps {
  tile: Tile | null;
  services: {
    police: number[][];
    fire: number[][];
    health: number[][];
    education: number[][];
    power: boolean[][];
    water: boolean[][];
  } | null;
  onClose: () => void;
  isMobile?: boolean;
}

// ============================================================================
// CACHED LOOKUPS (avoid recalculation each render)
// ============================================================================

// Zone badge configuration - cached lookup table
const ZONE_CONFIG = {
  residential: { variant: 'default' as const, className: 'bg-green-500/20 text-green-400', label: 'residential' },
  commercial: { variant: 'secondary' as const, className: 'bg-blue-500/20 text-blue-400', label: 'commercial' },
  industrial: { variant: 'outline' as const, className: 'bg-amber-500/20 text-amber-400', label: 'industrial' },
  none: { variant: 'secondary' as const, className: '', label: 'Unzoned' },
} as const;

// Building name cache to avoid repeated string operations
const buildingNameCache = new Map<string, string>();
function formatBuildingName(type: string): string {
  let formatted = buildingNameCache.get(type);
  if (!formatted) {
    formatted = type.replace(/_/g, ' ');
    buildingNameCache.set(type, formatted);
  }
  return formatted;
}

// Pollution color thresholds
function getPollutionColorClass(pollution: number): string {
  if (pollution > 50) return 'text-red-400';
  if (pollution > 25) return 'text-amber-400';
  return 'text-green-400';
}

// ============================================================================
// MEMOIZED SUB-COMPONENTS (prevent unnecessary re-renders of stable sections)
// ============================================================================

interface InfoRowProps {
  label: string;
  children: React.ReactNode;
}

const InfoRow = memo(function InfoRow({ label, children }: InfoRowProps) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
});

interface ServiceRowProps {
  label: string;
  value: number;
}

const ServiceRow = memo(function ServiceRow({ label, value }: ServiceRowProps) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{Math.round(value)}%</span>
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TileInfoPanel = memo(function TileInfoPanel({
  tile,
  services,
  onClose,
  isMobile = false
}: TileInfoPanelProps) {
  // Early return for hidden/null state - most important optimization
  if (!tile || !services) {
    return null;
  }

  const { x, y, building, zone, landValue, pollution } = tile;

  // Memoize computed values to avoid recalculation on each render
  const formattedBuildingName = useMemo(
    () => formatBuildingName(building.type),
    [building.type]
  );

  const zoneConfig = ZONE_CONFIG[zone] || ZONE_CONFIG.none;

  const pollutionColorClass = useMemo(
    () => getPollutionColorClass(pollution),
    [pollution]
  );

  const roundedPollution = useMemo(
    () => Math.round(pollution),
    [pollution]
  );

  // Memoize service values to avoid array access on each render
  const serviceCoverage = useMemo(() => ({
    police: services.police[y]?.[x] ?? 0,
    fire: services.fire[y]?.[x] ?? 0,
    health: services.health[y]?.[x] ?? 0,
    education: services.education[y]?.[x] ?? 0,
  }), [services, x, y]);

  // Memoize fire damage if on fire
  const fireProgress = building.onFire ? Math.round(building.fireProgress ?? 0) : 0;

  // Pre-compute container classes (stable per mobile state)
  const containerClassName = isMobile
    ? 'fixed left-0 right-0 w-full rounded-none border-x-0 border-t border-b z-30'
    : 'absolute top-4 right-4 w-72';

  const containerStyle = isMobile
    ? { top: 'calc(72px + env(safe-area-inset-top, 0px))' }
    : undefined;

  return (
    <Card className={containerClassName} style={containerStyle}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-sans">Tile ({x}, {y})</CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <CloseIcon size={14} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <InfoRow label="Building">
          <span className="capitalize">{formattedBuildingName}</span>
        </InfoRow>

        <InfoRow label="Zone">
          <Badge variant={zoneConfig.variant} className={zoneConfig.className}>
            {zoneConfig.label}
          </Badge>
        </InfoRow>

        <InfoRow label="Level">
          <span>{building.level}/5</span>
        </InfoRow>

        <InfoRow label="Population">
          <span>{building.population}</span>
        </InfoRow>

        <InfoRow label="Jobs">
          <span>{building.jobs}</span>
        </InfoRow>

        <Separator />

        <InfoRow label="Power">
          <Badge variant={building.powered ? 'default' : 'destructive'}>
            {building.powered ? 'Connected' : 'No Power'}
          </Badge>
        </InfoRow>

        <InfoRow label="Water">
          <Badge
            variant={building.watered ? 'default' : 'destructive'}
            className={building.watered ? 'bg-cyan-500/20 text-cyan-400' : ''}
          >
            {building.watered ? 'Connected' : 'No Water'}
          </Badge>
        </InfoRow>

        <InfoRow label="Land Value">
          <span>${landValue}</span>
        </InfoRow>

        <InfoRow label="Pollution">
          <span className={pollutionColorClass}>{roundedPollution}%</span>
        </InfoRow>

        {building.onFire && (
          <>
            <Separator />
            <div className="flex justify-between text-red-400">
              <span>ON FIRE!</span>
              <span>{fireProgress}% damage</span>
            </div>
          </>
        )}

        <Separator />
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
          Service Coverage
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <ServiceRow label="Police" value={serviceCoverage.police} />
          <ServiceRow label="Fire" value={serviceCoverage.fire} />
          <ServiceRow label="Health" value={serviceCoverage.health} />
          <ServiceRow label="Education" value={serviceCoverage.education} />
        </div>
      </CardContent>
    </Card>
  );
});
