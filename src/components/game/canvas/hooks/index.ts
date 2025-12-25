'use client';

/**
 * Canvas hooks - custom hooks for canvas state management
 *
 * These hooks extract state management from CanvasIsometricGrid.tsx
 * for better organization and maintainability.
 */

export {
  useCanvasState,
  type CanvasRefs,
  type EntitySystemRefs,
  type ViewportRefs,
  type PerformanceRefs,
  type HoverRefs,
  type InteractionRefs,
  type WorldStateRef,
} from './useCanvasState';

export {
  useRenderQueues,
  insertionSortByDepth,
  clearRenderQueues,
  type BuildingDrawItem,
  type OverlayDrawItem,
  type RenderQueues,
} from './useRenderQueues';

export {
  useViewport,
  type MapBounds,
} from './useViewport';
