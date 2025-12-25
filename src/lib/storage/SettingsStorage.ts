// User settings storage (sprite pack, day/night mode, etc.)

import { getItem, setItem } from './localStorage';
import { SPRITE_PACKS, DEFAULT_SPRITE_PACK_ID } from '@/lib/renderConfig';

const SPRITE_PACK_STORAGE_KEY = 'isocity-sprite-pack';
const DAY_NIGHT_MODE_STORAGE_KEY = 'isocity-day-night-mode';

export type DayNightMode = 'auto' | 'day' | 'night';

/**
 * Load saved sprite pack ID
 */
export function loadSpritePackId(): string {
  const saved = getItem(SPRITE_PACK_STORAGE_KEY);

  // Validate that the saved pack exists
  if (saved && SPRITE_PACKS.some(p => p.id === saved)) {
    return saved;
  }

  return DEFAULT_SPRITE_PACK_ID;
}

/**
 * Save sprite pack ID
 */
export function saveSpritePackId(packId: string): void {
  setItem(SPRITE_PACK_STORAGE_KEY, packId);
}

/**
 * Load day/night mode preference
 */
export function loadDayNightMode(): DayNightMode {
  const saved = getItem(DAY_NIGHT_MODE_STORAGE_KEY);

  if (saved === 'auto' || saved === 'day' || saved === 'night') {
    return saved;
  }

  return 'auto';
}

/**
 * Save day/night mode preference
 */
export function saveDayNightMode(mode: DayNightMode): void {
  setItem(DAY_NIGHT_MODE_STORAGE_KEY, mode);
}
