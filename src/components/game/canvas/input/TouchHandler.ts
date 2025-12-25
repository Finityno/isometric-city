import React from 'react';
import { Tile, Tool } from '@/types/game';
import { screenToGrid } from '@/components/game/utils';
import { clampOffset } from './ViewportController';

/**
 * Configuration for touch handlers
 */
export interface TouchHandlerConfig {
  containerRef: React.RefObject<HTMLDivElement | null>;
  gridSize: number;
  grid: Tile[][];
  canvasSize: { width: number; height: number };
  selectedTool: Tool;
}

/**
 * Touch state managed by the handlers
 */
export interface TouchState {
  offset: { x: number; y: number };
  zoom: number;
  isPanning: boolean;
  dragStart: { x: number; y: number };
}

/**
 * Callbacks for touch handler state updates
 */
export interface TouchHandlerCallbacks {
  setOffset: (offset: { x: number; y: number }) => void;
  setZoom: (zoom: number) => void;
  setIsPanning: (isPanning: boolean) => void;
  setIsDragging: (isDragging: boolean) => void;
  setDragStart: (dragStart: { x: number; y: number }) => void;
  setHoveredTile: (tile: { x: number; y: number } | null) => void;
  setHoveredIncident: (incident: any | null) => void;
  setSelectedTile: (tile: { x: number; y: number } | null) => void;
  placeAtTile: (x: number, y: number) => void;
  findBuildingOrigin: (x: number, y: number) => { originX: number; originY: number } | null;
}

/**
 * Refs needed for touch handlers
 */
export interface TouchHandlerRefs {
  hoveredTileRef: React.MutableRefObject<{ x: number; y: number } | null>;
  touchStartRef: React.MutableRefObject<{ x: number; y: number; time: number } | null>;
  initialPinchDistanceRef: React.MutableRefObject<number | null>;
  initialZoomRef: React.MutableRefObject<number>;
  lastTouchCenterRef: React.MutableRefObject<{ x: number; y: number } | null>;
  isPinchZoomingRef: React.MutableRefObject<boolean>;
}

/**
 * Calculate distance between two touch points
 */
export function getTouchDistance(touch1: React.Touch, touch2: React.Touch): number {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate center point between two touches
 */
export function getTouchCenter(touch1: React.Touch, touch2: React.Touch): { x: number; y: number } {
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}

/**
 * Create touch start handler
 */
export function createTouchStartHandler(
  config: TouchHandlerConfig,
  state: TouchState,
  callbacks: TouchHandlerCallbacks,
  refs: TouchHandlerRefs
) {
  return (e: React.TouchEvent) => {
    // Clear hover on any touch interaction
    refs.hoveredTileRef.current = null;
    callbacks.setHoveredTile(null);
    callbacks.setHoveredIncident(null);

    if (e.touches.length === 1) {
      // Single touch - could be pan or tap
      const touch = e.touches[0];
      refs.touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      callbacks.setDragStart({ x: touch.clientX - state.offset.x, y: touch.clientY - state.offset.y });
      callbacks.setIsPanning(true);
      refs.isPinchZoomingRef.current = false;
    } else if (e.touches.length === 2) {
      // Two finger touch - pinch to zoom
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      refs.initialPinchDistanceRef.current = distance;
      refs.initialZoomRef.current = state.zoom;
      refs.lastTouchCenterRef.current = getTouchCenter(e.touches[0], e.touches[1]);
      callbacks.setIsPanning(false);
      refs.isPinchZoomingRef.current = true;
    }
  };
}

/**
 * Create touch move handler
 */
export function createTouchMoveHandler(
  config: TouchHandlerConfig,
  state: TouchState,
  callbacks: TouchHandlerCallbacks,
  refs: TouchHandlerRefs
) {
  return (e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 1 && state.isPanning && !refs.initialPinchDistanceRef.current) {
      // Single touch pan
      const touch = e.touches[0];
      const newOffset = {
        x: touch.clientX - state.dragStart.x,
        y: touch.clientY - state.dragStart.y,
      };
      callbacks.setOffset(
        clampOffset(newOffset, state.zoom, config.gridSize, config.canvasSize.width, config.canvasSize.height)
      );
    } else if (e.touches.length === 2 && refs.initialPinchDistanceRef.current !== null) {
      // Pinch to zoom
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / refs.initialPinchDistanceRef.current;
      const ZOOM_MIN = 0.2;
      const ZOOM_MAX = 3.0;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, refs.initialZoomRef.current * scale));

      const currentCenter = getTouchCenter(e.touches[0], e.touches[1]);
      const rect = config.containerRef.current?.getBoundingClientRect();

      if (rect && refs.lastTouchCenterRef.current) {
        // Calculate center position relative to canvas
        const centerX = currentCenter.x - rect.left;
        const centerY = currentCenter.y - rect.top;

        // World position at pinch center
        const worldX = (centerX - state.offset.x) / state.zoom;
        const worldY = (centerY - state.offset.y) / state.zoom;

        // Keep the same world position under the pinch center after zoom
        const newOffsetX = centerX - worldX * newZoom;
        const newOffsetY = centerY - worldY * newZoom;

        // Also account for pan movement during pinch
        const panDeltaX = currentCenter.x - refs.lastTouchCenterRef.current.x;
        const panDeltaY = currentCenter.y - refs.lastTouchCenterRef.current.y;

        const clampedOffset = clampOffset(
          { x: newOffsetX + panDeltaX, y: newOffsetY + panDeltaY },
          newZoom,
          config.gridSize,
          config.canvasSize.width,
          config.canvasSize.height
        );

        callbacks.setOffset(clampedOffset);
        callbacks.setZoom(newZoom);
        refs.lastTouchCenterRef.current = currentCenter;
      }
    }
  };
}

/**
 * Create touch end handler
 */
export function createTouchEndHandler(
  config: TouchHandlerConfig,
  state: TouchState,
  callbacks: TouchHandlerCallbacks,
  refs: TouchHandlerRefs
) {
  return (e: React.TouchEvent) => {
    const touchStart = refs.touchStartRef.current;

    if (e.touches.length === 0) {
      // All fingers lifted
      if (touchStart && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const deltaX = Math.abs(touch.clientX - touchStart.x);
        const deltaY = Math.abs(touch.clientY - touchStart.y);
        const deltaTime = Date.now() - touchStart.time;

        // Detect tap (short duration, minimal movement)
        if (deltaTime < 300 && deltaX < 10 && deltaY < 10) {
          const rect = config.containerRef.current?.getBoundingClientRect();
          if (rect) {
            const mouseX = (touch.clientX - rect.left) / state.zoom;
            const mouseY = (touch.clientY - rect.top) / state.zoom;
            const { gridX, gridY } = screenToGrid(mouseX, mouseY, state.offset.x / state.zoom, state.offset.y / state.zoom);

            if (gridX >= 0 && gridX < config.gridSize && gridY >= 0 && gridY < config.gridSize) {
              if (config.selectedTool === 'select') {
                const origin = callbacks.findBuildingOrigin(gridX, gridY);
                if (origin) {
                  callbacks.setSelectedTile({ x: origin.originX, y: origin.originY });
                } else {
                  callbacks.setSelectedTile({ x: gridX, y: gridY });
                }
              } else {
                callbacks.placeAtTile(gridX, gridY);
              }
            }
          }
        }
      }

      // Reset all touch state
      callbacks.setIsPanning(false);
      callbacks.setIsDragging(false);
      refs.isPinchZoomingRef.current = false;
      refs.touchStartRef.current = null;
      refs.initialPinchDistanceRef.current = null;
      refs.lastTouchCenterRef.current = null;
    } else if (e.touches.length === 1) {
      // Went from 2 touches to 1 - reset to pan mode
      const touch = e.touches[0];
      callbacks.setDragStart({ x: touch.clientX - state.offset.x, y: touch.clientY - state.offset.y });
      callbacks.setIsPanning(true);
      refs.isPinchZoomingRef.current = false;
      refs.initialPinchDistanceRef.current = null;
      refs.lastTouchCenterRef.current = null;
    }
  };
}
