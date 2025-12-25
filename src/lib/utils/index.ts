/**
 * Centralized utilities for IsoCity game
 *
 * This module re-exports all utility functions from specialized modules:
 * - Coordinate transformations (grid ↔ screen)
 * - Math helpers (clamp, lerp, distance, angle normalization)
 */

// Re-export coordinate utilities
export { gridToScreen, screenToGrid } from './coordinates';

// Re-export math utilities
export {
  clamp,
  lerp,
  distance,
  distanceSquared,
  normalizeAngle,
  normalizeAngleDiff,
  normalizeAngleFast,
} from './math';
