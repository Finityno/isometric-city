// Low-level localStorage abstraction with error handling

/**
 * Check if we're in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Safely get an item from localStorage
 */
export function getItem(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.error(`Failed to get item "${key}" from localStorage:`, e);
    return null;
  }
}

/**
 * Safely set an item in localStorage
 */
export function setItem(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && (e.code === 22 || e.code === 1014)) {
      console.error('localStorage quota exceeded');
    } else {
      console.error(`Failed to set item "${key}" in localStorage:`, e);
    }
  }
}

/**
 * Safely remove an item from localStorage
 */
export function removeItem(key: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`Failed to remove item "${key}" from localStorage:`, e);
  }
}

/**
 * Get and parse JSON from localStorage
 */
export function getJSON<T>(key: string): T | null {
  const item = getItem(key);
  if (!item) return null;

  try {
    return JSON.parse(item) as T;
  } catch (e) {
    console.error(`Failed to parse JSON from localStorage key "${key}":`, e);
    removeItem(key); // Clean up corrupted data
    return null;
  }
}

/**
 * Stringify and set JSON in localStorage
 */
export function setJSON(key: string, value: unknown): void {
  try {
    const json = JSON.stringify(value);
    setItem(key, json);
  } catch (e) {
    console.error(`Failed to stringify JSON for localStorage key "${key}":`, e);
  }
}
