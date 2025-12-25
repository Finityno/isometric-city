'use client';

/**
 * Canvas module exports
 *
 * This module contains the extracted canvas rendering system components:
 * - RenderLoop: Main animation frame loop and layer composition
 * - Renderers: Individual drawing functions for roads, buildings, lighting, hover
 * - Hooks: Custom hooks for canvas state management
 */

// Render loop
export {
  createRenderLoop,
  type CanvasLayerRefs,
  type RenderLoopConfig,
  type RenderLoopState,
  type RenderFunctions,
  type RenderLoopRefs,
} from './RenderLoop';

// Renderers
export {
  drawRoad,
  drawBuilding,
  drawLighting,
  drawHoverCanvas,
  type RoadRenderContext,
  type RoadRenderState,
  type BuildingRenderContext,
  type LightingRenderContext,
  type HoverRenderContext,
  type CachedLight,
  nonLitTypes,
  specialTypes,
  residentialTypes,
  commercialTypes,
} from './renderers';

// Hooks
export {
  useCanvasState,
  useRenderQueues,
  useViewport,
  insertionSortByDepth,
  clearRenderQueues,
  type CanvasRefs,
  type EntitySystemRefs,
  type ViewportRefs,
  type PerformanceRefs,
  type HoverRefs,
  type InteractionRefs,
  type WorldStateRef,
  type BuildingDrawItem,
  type OverlayDrawItem,
  type RenderQueues,
  type MapBounds,
} from './hooks';
