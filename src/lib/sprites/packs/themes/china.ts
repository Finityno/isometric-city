import type { SpritePack } from '../../types';
import { SPRITE_PACK_SPRITES4 } from '../sprites4Base';

// ============================================================================
// SPRITE PACK: SPRITES4 CHINA (Chinese themed variant)
// ============================================================================
// Same layout and configuration as SPRITES4, but with Chinese themed artwork
export const SPRITE_PACK_SPRITES4_CHINA: SpritePack = {
  ...SPRITE_PACK_SPRITES4,
  id: 'sprites4-china',
  name: 'Chinese Theme',
  src: '/assets/sprites_red_water_new_china.png',
  // Note: Uses same construction, abandoned, dense, and parks sheets as the default
  // If you have Chinese themed variants for those, update these paths:
  // constructionSrc: '/assets/sprites_red_water_new_china_construction.png',
  // abandonedSrc: '/assets/sprites_red_water_new_china_abandoned.png',
  // denseSrc: '/assets/sprites_red_water_new_china_dense.png',
};
