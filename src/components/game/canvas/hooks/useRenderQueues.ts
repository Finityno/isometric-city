'use client';

import { useRef } from 'react';
import type { Tile } from '@/types/game';

/**
 * Building draw item with depth for sorting
 */
export interface BuildingDrawItem {
  screenX: number;
  screenY: number;
  tile: Tile;
  depth: number;
}

/**
 * Overlay draw item (no depth needed)
 */
export interface OverlayDrawItem {
  screenX: number;
  screenY: number;
  tile: Tile;
}

/**
 * Render queues for different rendering layers
 * Cached across frames to reduce GC pressure
 */
export interface RenderQueues {
  buildingQueue: BuildingDrawItem[];
  waterQueue: BuildingDrawItem[];
  roadQueue: BuildingDrawItem[];
  railQueue: BuildingDrawItem[];
  beachQueue: BuildingDrawItem[];
  baseTileQueue: BuildingDrawItem[];
  greenBaseTileQueue: BuildingDrawItem[];
  overlayQueue: OverlayDrawItem[];
}

/**
 * Insertion sort for depth ordering
 * O(n) for nearly-sorted data (better than Array.sort for this use case)
 */
export function insertionSortByDepth<T extends { depth: number }>(arr: T[]): void {
  for (let i = 1; i < arr.length; i++) {
    const current = arr[i];
    let j = i - 1;
    // Only move elements that are strictly greater (maintains stability)
    while (j >= 0 && arr[j].depth > current.depth) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = current;
  }
}

/**
 * Clear all render queues
 * Uses .length = 0 for fast clearing without allocating new arrays
 */
export function clearRenderQueues(queues: RenderQueues): void {
  queues.buildingQueue.length = 0;
  queues.waterQueue.length = 0;
  queues.roadQueue.length = 0;
  queues.railQueue.length = 0;
  queues.beachQueue.length = 0;
  queues.baseTileQueue.length = 0;
  queues.greenBaseTileQueue.length = 0;
  queues.overlayQueue.length = 0;
}

/**
 * Render queue management hook
 * Maintains persistent queue arrays across frames to reduce GC pressure
 */
export function useRenderQueues() {
  const renderQueuesRef = useRef<RenderQueues>({
    buildingQueue: [],
    waterQueue: [],
    roadQueue: [],
    railQueue: [],
    beachQueue: [],
    baseTileQueue: [],
    greenBaseTileQueue: [],
    overlayQueue: [],
  });

  return {
    renderQueuesRef,
    clearRenderQueues: () => clearRenderQueues(renderQueuesRef.current),
    insertionSortByDepth,
  };
}
