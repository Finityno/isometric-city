// ============================================================================
// SPRITE SYSTEM EXPORTS
// ============================================================================
// This file re-exports all sprite-related functionality in an organized way
// ============================================================================

// Type definitions
export type { SpritePack } from './types';

// Sprite packs
export { SPRITE_PACK_SPRITES4 } from './packs/sprites4Base';
export { SPRITE_PACK_SPRITES4_HARRY } from './packs/themes/harryPotter';
export { SPRITE_PACK_SPRITES4_CHINA } from './packs/themes/china';

// Coordinate calculation functions
export { getSpriteCoords, getSpriteOffsets } from './SpriteCoordinates';

// ============================================================================
// SPRITE PACKS REGISTRY
// ============================================================================
import { SPRITE_PACK_SPRITES4 } from './packs/sprites4Base';
import { SPRITE_PACK_SPRITES4_HARRY } from './packs/themes/harryPotter';
import { SPRITE_PACK_SPRITES4_CHINA } from './packs/themes/china';
import type { SpritePack } from './types';

export const SPRITE_PACKS: SpritePack[] = [
  SPRITE_PACK_SPRITES4,
  SPRITE_PACK_SPRITES4_HARRY,
  SPRITE_PACK_SPRITES4_CHINA,
];

// Default sprite pack ID
export const DEFAULT_SPRITE_PACK_ID = 'sprites4';

// Get a sprite pack by ID
export function getSpritePack(id: string): SpritePack {
  return SPRITE_PACKS.find(pack => pack.id === id) || SPRITE_PACKS[0];
}

// ============================================================================
// BACKWARDS COMPATIBILITY EXPORTS
// ============================================================================
// These exports maintain compatibility with existing code that uses the old API.
// They default to the first sprite pack (sprites4).
// ============================================================================

// Get active sprite pack (this will be overridden by the selected pack in context)
let _activeSpritePack: SpritePack = SPRITE_PACKS[0];

export function setActiveSpritePack(pack: SpritePack) {
  _activeSpritePack = pack;
}

export function getActiveSpritePack(): SpritePack {
  return _activeSpritePack;
}

// Legacy exports that read from the active sprite pack
export const SPRITE_SHEET = {
  get src() { return _activeSpritePack.src; },
  get cols() { return _activeSpritePack.cols; },
  get rows() { return _activeSpritePack.rows; },
  get layout() { return _activeSpritePack.layout; },
};

export const SPRITE_ORDER = _activeSpritePack.spriteOrder;

export const SPRITE_VERTICAL_OFFSETS = new Proxy({} as Record<string, number>, {
  get(_, key: string) {
    return _activeSpritePack.verticalOffsets[key] ?? 0;
  },
  has(_, key: string) {
    return key in _activeSpritePack.verticalOffsets;
  },
});

export const SPRITE_HORIZONTAL_OFFSETS = new Proxy({} as Record<string, number>, {
  get(_, key: string) {
    return _activeSpritePack.horizontalOffsets[key] ?? 0;
  },
  has(_, key: string) {
    return key in _activeSpritePack.horizontalOffsets;
  },
});

export const BUILDING_TO_SPRITE = new Proxy({} as Record<string, string>, {
  get(_, key: string) {
    return _activeSpritePack.buildingToSprite[key];
  },
  has(_, key: string) {
    return key in _activeSpritePack.buildingToSprite;
  },
});
