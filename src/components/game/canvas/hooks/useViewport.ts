'use client';

import { useCallback } from 'react';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';

/**
 * Map bounds in screen coordinates
 */
export interface MapBounds {
  minOffsetX: number;
  maxOffsetX: number;
  minOffsetY: number;
  maxOffsetY: number;
}

/**
 * Viewport calculations and bounds management
 */
export function useViewport(gridSize: number) {
  /**
   * Calculate map bounds for viewport clamping
   * @param currentZoom - Current zoom level
   * @param canvasW - Canvas width
   * @param canvasH - Canvas height
   * @returns Map bounds for offset clamping
   */
  const getMapBounds = useCallback(
    (currentZoom: number, canvasW: number, canvasH: number): MapBounds => {
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
    },
    [gridSize]
  );

  /**
   * Clamp offset to keep camera within reasonable bounds
   * @param newOffset - Desired offset
   * @param currentZoom - Current zoom level
   * @param canvasWidth - Canvas width
   * @param canvasHeight - Canvas height
   * @returns Clamped offset
   */
  const clampOffset = useCallback(
    (
      newOffset: { x: number; y: number },
      currentZoom: number,
      canvasWidth: number,
      canvasHeight: number
    ): { x: number; y: number } => {
      const bounds = getMapBounds(currentZoom, canvasWidth, canvasHeight);
      return {
        x: Math.max(bounds.minOffsetX, Math.min(bounds.maxOffsetX, newOffset.x)),
        y: Math.max(bounds.minOffsetY, Math.min(bounds.maxOffsetY, newOffset.y)),
      };
    },
    [getMapBounds]
  );

  return {
    getMapBounds,
    clampOffset,
  };
}
