import React from 'react';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';
import { ZOOM_MIN, ZOOM_MAX } from '@/components/game/constants';

/**
 * Configuration for viewport control operations
 */
export interface ViewportConfig {
  gridSize: number;
  canvasSize: { width: number; height: number };
}

/**
 * Viewport state managed by the controller
 */
export interface ViewportState {
  offset: { x: number; y: number };
  zoom: number;
}

/**
 * Callbacks for viewport state updates
 */
export interface ViewportCallbacks {
  setOffset: (offset: { x: number; y: number }) => void;
  setZoom: (zoom: number) => void;
}

/**
 * Refs needed for viewport control
 */
export interface ViewportRefs {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isWheelScrollingRef: React.MutableRefObject<boolean>;
  wheelScrollTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * Calculate camera bounds based on grid size
 */
export function getMapBounds(
  gridSize: number,
  currentZoom: number,
  canvasW: number,
  canvasH: number
) {
  const n = gridSize;
  const padding = 100; // Allow some over-scroll

  // Map bounds in world coordinates
  const mapLeft = -(n - 1) * TILE_WIDTH / 2;
  const mapRight = (n - 1) * TILE_WIDTH / 2;
  const mapTop = 0;
  const mapBottom = (n - 1) * TILE_HEIGHT;

  const minOffsetX = padding - mapRight * currentZoom;
  const maxOffsetX = canvasW - padding - mapLeft * currentZoom;
  const minOffsetY = padding - mapBottom * currentZoom;
  const maxOffsetY = canvasH - padding - mapTop * currentZoom;

  return { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY };
}

/**
 * Clamp offset to keep camera within reasonable bounds
 */
export function clampOffset(
  newOffset: { x: number; y: number },
  currentZoom: number,
  gridSize: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const bounds = getMapBounds(gridSize, currentZoom, canvasWidth, canvasHeight);
  return {
    x: Math.max(bounds.minOffsetX, Math.min(bounds.maxOffsetX, newOffset.x)),
    y: Math.max(bounds.minOffsetY, Math.min(bounds.maxOffsetY, newOffset.y)),
  };
}

/**
 * Create wheel handler for zoom and pan operations
 */
export function createWheelHandler(
  config: ViewportConfig,
  state: ViewportState,
  callbacks: ViewportCallbacks,
  refs: ViewportRefs
) {
  return (e: WheelEvent) => {
    // Prevent browser zoom and page scroll
    e.preventDefault();
    e.stopPropagation();

    // Clear hover when scrolling/zooming with wheel/trackpad
    refs.isWheelScrollingRef.current = true;

    // Reset the wheel scrolling flag after a short delay of no wheel events
    if (refs.wheelScrollTimeoutRef.current) {
      clearTimeout(refs.wheelScrollTimeoutRef.current);
    }
    refs.wheelScrollTimeoutRef.current = setTimeout(() => {
      refs.isWheelScrollingRef.current = false;
    }, 150);

    const rect = refs.containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Trackpad pinch-to-zoom sends ctrlKey=true (browser synthesizes this)
    // Mouse wheel zoom: use Ctrl/Cmd + scroll OR regular scroll
    const isPinchZoom = e.ctrlKey || e.metaKey;

    if (isPinchZoom) {
      // ZOOM: Pinch gesture or Ctrl+wheel
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Use deltaY for zoom amount - pinch gestures have smaller deltas
      const zoomDelta = -e.deltaY * 0.01;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom * (1 + zoomDelta)));

      if (Math.abs(newZoom - state.zoom) < 0.001) return;

      // World position under the mouse before zoom
      const worldX = (mouseX - state.offset.x) / state.zoom;
      const worldY = (mouseY - state.offset.y) / state.zoom;

      // After zoom, keep the same world position under the mouse
      const newOffsetX = mouseX - worldX * newZoom;
      const newOffsetY = mouseY - worldY * newZoom;

      const clampedOffset = clampOffset(
        { x: newOffsetX, y: newOffsetY },
        newZoom,
        config.gridSize,
        config.canvasSize.width,
        config.canvasSize.height
      );
      callbacks.setOffset(clampedOffset);
      callbacks.setZoom(newZoom);
    } else {
      // PAN: Two-finger scroll on trackpad or regular scroll wheel
      // deltaMode: 0 = pixels, 1 = lines, 2 = pages
      const multiplier = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 400 : 1;
      const deltaX = e.deltaX * multiplier;
      const deltaY = e.deltaY * multiplier;

      // If mostly horizontal scroll with minimal vertical, treat as pure horizontal pan
      // This prevents jittery up/down movement during horizontal trackpad gestures
      const isHorizontalDominant = Math.abs(deltaX) > Math.abs(deltaY) * 2;
      const effectiveDeltaY = isHorizontalDominant ? 0 : deltaY;

      // Skip tiny movements to reduce jitter
      if (Math.abs(deltaX) < 0.5 && Math.abs(effectiveDeltaY) < 0.5) return;

      const newOffset = {
        x: state.offset.x - deltaX,
        y: state.offset.y - effectiveDeltaY,
      };

      callbacks.setOffset(
        clampOffset(
          newOffset,
          state.zoom,
          config.gridSize,
          config.canvasSize.width,
          config.canvasSize.height
        )
      );
    }
  };
}
