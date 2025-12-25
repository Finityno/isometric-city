/**
 * Common math utilities for game calculations
 *
 * This module provides frequently used math helper functions for:
 * - Clamping values to ranges
 * - Angle normalization
 * - Distance calculations (optimized for performance)
 */

/**
 * Clamp a value between min and max
 *
 * @param value - The value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation between two values
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Calculate distance between two points
 *
 * @param dx - Delta X
 * @param dy - Delta Y
 * @returns Distance
 */
export function distance(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate squared distance between two points (avoids sqrt for performance)
 *
 * Use this for distance comparisons where the exact distance isn't needed.
 * Comparing squared distances is much faster than calculating actual distances.
 *
 * @param dx - Delta X
 * @param dy - Delta Y
 * @returns Squared distance
 */
export function distanceSquared(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

/**
 * Normalize angle to [-PI, PI] range
 *
 * @param angle - Angle in radians
 * @returns Normalized angle in range [-PI, PI]
 */
export function normalizeAngle(angle: number): number {
  const TWO_PI = Math.PI * 2;
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

/**
 * Normalize angle difference to [-PI, PI] range
 *
 * Useful for calculating the shortest rotation between two angles.
 *
 * @param diff - Angle difference in radians
 * @returns Normalized angle difference in range [-PI, PI]
 */
export function normalizeAngleDiff(diff: number): number {
  const TWO_PI = Math.PI * 2;
  while (diff > Math.PI) diff -= TWO_PI;
  while (diff < -Math.PI) diff += TWO_PI;
  return diff;
}

/**
 * Fast angle normalization for positive angles
 *
 * Optimized version for angles that are typically in [0, 2*PI] range.
 * Uses bitwise operations for better performance.
 *
 * @param angle - Angle in radians
 * @returns Normalized angle in range [0, 2*PI]
 */
export function normalizeAngleFast(angle: number): number {
  const TWO_PI = Math.PI * 2;
  const INV_TWO_PI = 1 / TWO_PI;

  // Fast normalization using bitwise floor for positive angles
  if (angle >= 0 && angle < TWO_PI) return angle;
  angle = angle - TWO_PI * Math.floor(angle * INV_TWO_PI);
  return angle;
}
