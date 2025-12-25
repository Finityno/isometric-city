import type { SpritePack } from '../../types';
import { SPRITE_PACK_SPRITES4 } from '../sprites4Base';

// ============================================================================
// SPRITE PACK: SPRITES4 HARRY POTTER (Harry Potter themed variant)
// ============================================================================
// Same layout and configuration as SPRITES4, but with Harry Potter themed artwork
export const SPRITE_PACK_SPRITES4_HARRY: SpritePack = {
  ...SPRITE_PACK_SPRITES4,
  id: 'sprites4-harry',
  name: 'Harry Potter Theme',
  src: '/assets/sprites_red_water_new_harry.png',
  denseSrc: '/assets/sprites_red_water_new_harry_dense.png',
  modernSrc: '/assets/sprites_red_water_new_harry_dense.png',
  constructionSrc: '/assets/sprites_red_water_new_harry_construction.png',
  // Note: Uses same construction, abandoned, dense, and parks sheets as the default
  // If you have Harry Potter themed variants for those, update these paths:
  // constructionSrc: '/assets/sprites_red_water_new_harry_construction.png',
  // abandonedSrc: '/assets/sprites_red_water_new_harry_abandoned.png',
  // denseSrc: '/assets/sprites_red_water_new_harry_dense.png',
};
