'use client';

import React, { memo, useMemo, useCallback } from 'react';
import {
  useAdvisorMessages,
  useQualityOfLife,
  useSetActivePanel,
} from '@/store/selectors';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AdvisorIcon,
  InfoIcon,
  PowerIcon,
  WaterIcon,
  MoneyIcon,
  SafetyIcon,
  HealthIcon,
  EducationIcon,
  EnvironmentIcon,
  JobsIcon,
} from '@/components/ui/Icons';
import type { AdvisorMessage } from '@/types/game';

// Pre-render icons once - stable references that never change
const ADVISOR_ICONS = {
  power: <PowerIcon size={18} />,
  water: <WaterIcon size={18} />,
  cash: <MoneyIcon size={18} />,
  shield: <SafetyIcon size={18} />,
  hospital: <HealthIcon size={18} />,
  education: <EducationIcon size={18} />,
  environment: <EnvironmentIcon size={18} />,
  planning: <AdvisorIcon size={18} />,
  jobs: <JobsIcon size={18} />,
  fallback: <InfoIcon size={18} />,
} as const;

// Pre-computed grade thresholds for O(1) lookup
const getGradeInfo = (avgRating: number): { grade: string; colorClass: string } => {
  if (avgRating >= 90) return { grade: 'A+', colorClass: 'text-green-400' };
  if (avgRating >= 80) return { grade: 'A', colorClass: 'text-green-400' };
  if (avgRating >= 70) return { grade: 'B', colorClass: 'text-green-400' };
  if (avgRating >= 60) return { grade: 'C', colorClass: 'text-amber-400' };
  if (avgRating >= 50) return { grade: 'D', colorClass: 'text-amber-400' };
  return { grade: 'F', colorClass: 'text-red-400' };
};

// Pre-computed priority styles
const PRIORITY_BORDER_CLASSES: Record<AdvisorMessage['priority'], string> = {
  critical: 'border-l-2 border-l-red-500',
  high: 'border-l-2 border-l-amber-500',
  medium: 'border-l-2 border-l-yellow-500',
  low: '',
};

const PRIORITY_BADGE_VARIANTS: Record<AdvisorMessage['priority'], 'destructive' | 'secondary'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'secondary',
  low: 'secondary',
};

// Memoized empty state component - never re-renders
const EmptyState = memo(function EmptyState() {
  return (
    <Card className="text-center py-8 text-muted-foreground bg-primary/10 border-primary/30">
      <AdvisorIcon size={32} className="mx-auto mb-3 opacity-50" />
      <div className="text-sm">No urgent issues to report!</div>
      <div className="text-xs mt-1">Your city is running smoothly.</div>
    </Card>
  );
});

// Memoized city rating card - only re-renders when grade changes
interface CityRatingCardProps {
  grade: string;
  colorClass: string;
}

const CityRatingCard = memo(function CityRatingCard({ grade, colorClass }: CityRatingCardProps) {
  return (
    <Card className="flex items-center gap-4 p-4 bg-primary/10 border-primary/30">
      <div
        className={`w-16 h-16 flex items-center justify-center text-3xl font-black rounded-md ${colorClass} bg-primary/20`}
      >
        {grade}
      </div>
      <div>
        <div className="text-foreground font-semibold">Overall City Rating</div>
        <div className="text-muted-foreground text-sm">Based on happiness, health, education, safety & environment</div>
      </div>
    </Card>
  );
});

// Memoized advisor message component
interface AdvisorCardProps {
  advisor: AdvisorMessage;
}

const AdvisorCard = memo(function AdvisorCard({ advisor }: AdvisorCardProps) {
  const borderClass = PRIORITY_BORDER_CLASSES[advisor.priority];
  const badgeVariant = PRIORITY_BADGE_VARIANTS[advisor.priority];
  const icon = ADVISOR_ICONS[advisor.icon as keyof typeof ADVISOR_ICONS] || ADVISOR_ICONS.fallback;

  return (
    <Card className={`p-3 bg-primary/10 border-primary/30 ${borderClass}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg text-muted-foreground">
          {icon}
        </span>
        <span className="text-foreground font-medium text-sm">{advisor.name}</span>
        <Badge
          variant={badgeVariant}
          className="ml-auto text-[10px]"
        >
          {advisor.priority}
        </Badge>
      </div>
      {advisor.messages.map((msg, j) => (
        <div key={j} className="text-muted-foreground text-sm leading-relaxed">{msg}</div>
      ))}
    </Card>
  );
});

// Memoized advisor list - only re-renders when messages change
interface AdvisorListProps {
  messages: AdvisorMessage[];
}

const AdvisorList = memo(function AdvisorList({ messages }: AdvisorListProps) {
  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {messages.map((advisor, i) => (
        <AdvisorCard key={`${advisor.name}-${advisor.priority}-${i}`} advisor={advisor} />
      ))}
    </>
  );
});

// Main panel component - memoized to prevent parent re-renders
export const AdvisorsPanel = memo(function AdvisorsPanel() {
  const advisorMessages = useAdvisorMessages();
  const stats = useQualityOfLife();
  const setActivePanel = useSetActivePanel();

  // Memoize grade calculation - only recalculate when stats change
  const { grade, colorClass } = useMemo(() => {
    const avgRating = (stats.happiness + stats.health + stats.education + stats.safety + stats.environment) / 5;
    return getGradeInfo(avgRating);
  }, [stats.happiness, stats.health, stats.education, stats.safety, stats.environment]);

  // Stable callback reference for dialog close
  const handleClose = useCallback(() => {
    setActivePanel('none');
  }, [setActivePanel]);

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="max-w-[500px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle>City Advisors</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <CityRatingCard grade={grade} colorClass={colorClass} />

          <ScrollArea className="max-h-[350px]">
            <div className="space-y-3">
              <AdvisorList messages={advisorMessages} />
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
});
