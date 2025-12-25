// ============================================================================
// IMAGE LOADING UTILITIES
// ============================================================================
// Handles loading and caching of sprite images with optional background filtering
// Optimized for performance with efficient caching, preloading, and memory management

// Background color to filter from sprite sheets
const BACKGROUND_COLOR_R = 255;
const BACKGROUND_COLOR_G = 0;
const BACKGROUND_COLOR_B = 0;

// Color distance threshold - pixels within this distance will be made transparent
const COLOR_THRESHOLD = 155;
const COLOR_THRESHOLD_SQUARED = COLOR_THRESHOLD * COLOR_THRESHOLD;

// ============================================================================
// CACHE STRUCTURES - Using Map for O(1) lookups
// ============================================================================

// Image cache for loaded images - Map provides O(1) access
const imageCache = new Map<string, HTMLImageElement>();

// Promise cache to avoid duplicate in-flight requests for the same image
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();

// Track blob URLs for proper memory cleanup
const blobUrls = new Set<string>();

// Preload queue for background loading
const preloadQueue: string[] = [];
let isPreloading = false;

// ============================================================================
// CALLBACK SYSTEM - Optimized with minimal allocations
// ============================================================================

type ImageLoadCallback = () => void;
const imageLoadCallbacks = new Set<ImageLoadCallback>();

// Batch notification flag to coalesce multiple loads
let pendingNotification = false;

/**
 * Register a callback to be notified when images are loaded
 * @returns Cleanup function to unregister the callback
 */
export function onImageLoaded(callback: ImageLoadCallback): () => void {
  imageLoadCallbacks.add(callback);
  return () => { imageLoadCallbacks.delete(callback); };
}

/**
 * Notify all registered callbacks that an image has loaded
 * Uses microtask batching to coalesce multiple notifications
 */
function notifyImageLoaded(): void {
  if (pendingNotification) return;
  pendingNotification = true;

  // Use queueMicrotask for efficient batching without setTimeout overhead
  queueMicrotask(() => {
    pendingNotification = false;
    // Use for...of instead of forEach for slightly better performance
    for (const cb of imageLoadCallbacks) {
      cb();
    }
  });
}

// ============================================================================
// CORE LOADING FUNCTIONS
// ============================================================================

/**
 * Load an image from a source URL with caching and deduplication
 * @param src The image source path
 * @returns Promise resolving to the loaded image
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  // Fast path: return cached image immediately
  const cached = imageCache.get(src);
  if (cached) {
    return Promise.resolve(cached);
  }

  // Check if already loading - prevent duplicate requests
  const existingPromise = loadingPromises.get(src);
  if (existingPromise) {
    return existingPromise;
  }

  // Create new loading promise
  const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      imageCache.set(src, img);
      loadingPromises.delete(src);
      notifyImageLoaded();
      resolve(img);
    };

    img.onerror = (e) => {
      loadingPromises.delete(src);
      reject(new Error(`Failed to load image: ${src}`, { cause: e }));
    };

    // Set src after handlers for reliability
    img.src = src;
  });

  loadingPromises.set(src, loadPromise);
  return loadPromise;
}

/**
 * Synchronously get a cached image or return undefined
 * Faster than loadImage when you only need cached images
 */
export function getImageSync(src: string): HTMLImageElement | undefined {
  return imageCache.get(src);
}

/**
 * Check if an image is fully loaded and cached
 */
export function isImageReady(src: string): boolean {
  return imageCache.has(src);
}

// ============================================================================
// BACKGROUND FILTERING - Optimized pixel processing
// ============================================================================

// Reusable canvas for filtering - avoids GC pressure from creating new canvases
let filterCanvas: HTMLCanvasElement | null = null;
let filterCtx: CanvasRenderingContext2D | null = null;

/**
 * Get or create the reusable filter canvas
 */
function getFilterCanvas(width: number, height: number): CanvasRenderingContext2D {
  if (!filterCanvas) {
    filterCanvas = document.createElement('canvas');
    filterCtx = filterCanvas.getContext('2d', { willReadFrequently: true });
  }

  // Resize only if needed
  if (filterCanvas.width !== width || filterCanvas.height !== height) {
    filterCanvas.width = width;
    filterCanvas.height = height;
  }

  return filterCtx!;
}

/**
 * Filters colors close to the background color from an image, making them transparent
 * Optimized with reusable canvas and efficient pixel processing
 * @param img The source image to process
 * @param threshold Maximum color distance to consider as background (default: COLOR_THRESHOLD)
 * @returns A new HTMLImageElement with filtered colors made transparent
 */
export function filterBackgroundColor(
  img: HTMLImageElement,
  threshold: number = COLOR_THRESHOLD
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (width === 0 || height === 0) {
      reject(new Error('Image has zero dimensions'));
      return;
    }

    const ctx = getFilterCanvas(width, height);
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    // Clear and draw
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const len = data.length;

    // Pre-compute squared threshold
    const thresholdSq = threshold * threshold;

    // Process pixels using typed array for speed
    // Unroll loop by processing 4 pixels at a time for better CPU pipelining
    const pixelCount = len >> 2; // len / 4
    const remainder = pixelCount & 3; // pixelCount % 4
    const mainLoopEnd = (pixelCount - remainder) << 2;

    // Main unrolled loop
    for (let i = 0; i < mainLoopEnd; i += 16) {
      // Pixel 1
      let dr = data[i] - BACKGROUND_COLOR_R;
      let dg = data[i + 1] - BACKGROUND_COLOR_G;
      let db = data[i + 2] - BACKGROUND_COLOR_B;
      if (dr * dr + dg * dg + db * db <= thresholdSq) {
        data[i + 3] = 0;
      }

      // Pixel 2
      dr = data[i + 4] - BACKGROUND_COLOR_R;
      dg = data[i + 5] - BACKGROUND_COLOR_G;
      db = data[i + 6] - BACKGROUND_COLOR_B;
      if (dr * dr + dg * dg + db * db <= thresholdSq) {
        data[i + 7] = 0;
      }

      // Pixel 3
      dr = data[i + 8] - BACKGROUND_COLOR_R;
      dg = data[i + 9] - BACKGROUND_COLOR_G;
      db = data[i + 10] - BACKGROUND_COLOR_B;
      if (dr * dr + dg * dg + db * db <= thresholdSq) {
        data[i + 11] = 0;
      }

      // Pixel 4
      dr = data[i + 12] - BACKGROUND_COLOR_R;
      dg = data[i + 13] - BACKGROUND_COLOR_G;
      db = data[i + 14] - BACKGROUND_COLOR_B;
      if (dr * dr + dg * dg + db * db <= thresholdSq) {
        data[i + 15] = 0;
      }
    }

    // Handle remaining pixels
    for (let i = mainLoopEnd; i < len; i += 4) {
      const dr = data[i] - BACKGROUND_COLOR_R;
      const dg = data[i + 1] - BACKGROUND_COLOR_G;
      const db = data[i + 2] - BACKGROUND_COLOR_B;
      if (dr * dr + dg * dg + db * db <= thresholdSq) {
        data[i + 3] = 0;
      }
    }

    // Put the modified image data back
    ctx.putImageData(imageData, 0, 0);

    // Use toBlob - more efficient than toDataURL
    filterCanvas!.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create blob from filtered image'));
        return;
      }

      const url = URL.createObjectURL(blob);
      blobUrls.add(url);

      const filteredImg = new Image();
      filteredImg.onload = () => {
        resolve(filteredImg);
      };
      filteredImg.onerror = () => {
        URL.revokeObjectURL(url);
        blobUrls.delete(url);
        reject(new Error('Failed to create filtered image from blob'));
      };
      filteredImg.src = url;
    }, 'image/png');
  });
}

// ============================================================================
// SPRITE LOADING - With filtering support
// ============================================================================

// Cache key generator - inline for performance
const getFilteredCacheKey = (src: string): string => `${src}_filtered`;

/**
 * Loads an image and applies background color filtering if it's a sprite sheet
 * @param src The image source path
 * @param applyFilter Whether to apply background color filtering (default: true for sprite sheets)
 * @returns Promise resolving to the loaded (and optionally filtered) image
 */
export function loadSpriteImage(
  src: string,
  applyFilter: boolean = true
): Promise<HTMLImageElement> {
  const cacheKey = applyFilter ? getFilteredCacheKey(src) : src;

  // Fast path: return cached
  const cached = imageCache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  // Check for in-flight request
  const existingPromise = loadingPromises.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  // Create the loading chain
  const loadPromise = loadImage(src).then((img) => {
    if (!applyFilter) {
      return img;
    }

    return filterBackgroundColor(img).then((filteredImg) => {
      imageCache.set(cacheKey, filteredImg);
      loadingPromises.delete(cacheKey);
      notifyImageLoaded();
      return filteredImg;
    });
  }).catch((error) => {
    loadingPromises.delete(cacheKey);
    throw error;
  });

  loadingPromises.set(cacheKey, loadPromise);
  return loadPromise;
}

// ============================================================================
// PRELOADING - Background loading for better UX
// ============================================================================

/**
 * Add images to the preload queue for background loading
 * Images are loaded during idle time
 */
export function preloadImages(sources: string[], applyFilter: boolean = false): void {
  for (const src of sources) {
    const cacheKey = applyFilter ? getFilteredCacheKey(src) : src;
    if (!imageCache.has(cacheKey) && !loadingPromises.has(cacheKey)) {
      preloadQueue.push(applyFilter ? `filter:${src}` : src);
    }
  }

  if (!isPreloading && preloadQueue.length > 0) {
    processPreloadQueue();
  }
}

/**
 * Process the preload queue using requestIdleCallback for non-blocking loading
 */
function processPreloadQueue(): void {
  if (preloadQueue.length === 0) {
    isPreloading = false;
    return;
  }

  isPreloading = true;

  const processNext = (deadline?: IdleDeadline) => {
    // Load images while we have idle time (or at least one if no deadline)
    const timeRemaining = deadline ? deadline.timeRemaining() : 16;

    while (preloadQueue.length > 0 && timeRemaining > 5) {
      const item = preloadQueue.shift()!;

      if (item.startsWith('filter:')) {
        const src = item.slice(7);
        loadSpriteImage(src, true).catch(() => {
          // Silently ignore preload errors
        });
      } else {
        loadImage(item).catch(() => {
          // Silently ignore preload errors
        });
      }

      // Only process one per idle callback to stay responsive
      break;
    }

    if (preloadQueue.length > 0) {
      // Schedule next batch
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(processNext, { timeout: 1000 });
      } else {
        setTimeout(() => processNext(), 16);
      }
    } else {
      isPreloading = false;
    }
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(processNext, { timeout: 1000 });
  } else {
    setTimeout(() => processNext(), 0);
  }
}

/**
 * Preload critical images immediately (blocking)
 * Use for essential UI/game images that must be ready
 */
export function preloadCriticalImages(
  sources: string[],
  applyFilter: boolean = false
): Promise<HTMLImageElement[]> {
  const promises = sources.map((src) =>
    applyFilter ? loadSpriteImage(src, true) : loadImage(src)
  );
  return Promise.all(promises);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Check if an image is cached
 * @param src The image source path
 * @param filtered Whether to check for the filtered version
 */
export function isImageCached(src: string, filtered: boolean = false): boolean {
  const cacheKey = filtered ? getFilteredCacheKey(src) : src;
  return imageCache.has(cacheKey);
}

/**
 * Get a cached image if available
 * @param src The image source path
 * @param filtered Whether to get the filtered version
 */
export function getCachedImage(
  src: string,
  filtered: boolean = false
): HTMLImageElement | undefined {
  const cacheKey = filtered ? getFilteredCacheKey(src) : src;
  return imageCache.get(cacheKey);
}

/**
 * Get cache statistics for debugging/monitoring
 */
export function getCacheStats(): {
  cachedImages: number;
  pendingLoads: number;
  preloadQueueSize: number;
  blobUrlCount: number;
} {
  return {
    cachedImages: imageCache.size,
    pendingLoads: loadingPromises.size,
    preloadQueueSize: preloadQueue.length,
    blobUrlCount: blobUrls.size,
  };
}

/**
 * Clear the image cache and revoke any blob URLs to free VRAM
 */
export function clearImageCache(): void {
  // Revoke all tracked blob URLs
  for (const url of blobUrls) {
    URL.revokeObjectURL(url);
  }
  blobUrls.clear();

  // Also check cache for any blob URLs we might have missed
  for (const img of imageCache.values()) {
    if (img.src.startsWith('blob:')) {
      URL.revokeObjectURL(img.src);
    }
  }

  imageCache.clear();
  loadingPromises.clear();
  preloadQueue.length = 0;
  isPreloading = false;
}

/**
 * Remove specific images from cache
 * Useful for memory management when certain sprites are no longer needed
 */
export function evictFromCache(sources: string[]): void {
  for (const src of sources) {
    const img = imageCache.get(src);
    if (img?.src.startsWith('blob:')) {
      URL.revokeObjectURL(img.src);
      blobUrls.delete(img.src);
    }
    imageCache.delete(src);

    // Also evict filtered version
    const filteredKey = getFilteredCacheKey(src);
    const filteredImg = imageCache.get(filteredKey);
    if (filteredImg?.src.startsWith('blob:')) {
      URL.revokeObjectURL(filteredImg.src);
      blobUrls.delete(filteredImg.src);
    }
    imageCache.delete(filteredKey);
  }
}

/**
 * Clear all image load callbacks (useful for cleanup)
 */
export function clearImageLoadCallbacks(): void {
  imageLoadCallbacks.clear();
  pendingNotification = false;
}

// ============================================================================
// MEMORY OPTIMIZATION
// ============================================================================

/**
 * Release the reusable filter canvas to free memory
 * Call this when filtering is complete and won't be needed soon
 */
export function releaseFilterCanvas(): void {
  if (filterCanvas) {
    // Clear canvas to release GPU memory
    filterCanvas.width = 1;
    filterCanvas.height = 1;
    filterCtx?.clearRect(0, 0, 1, 1);
  }
  filterCanvas = null;
  filterCtx = null;
}

/**
 * Trim cache to a maximum number of entries (LRU-style but simpler)
 * Useful for memory-constrained environments
 */
export function trimCache(maxEntries: number): void {
  if (imageCache.size <= maxEntries) return;

  const toRemove = imageCache.size - maxEntries;
  let removed = 0;

  // Map maintains insertion order, so first entries are oldest
  for (const [key, img] of imageCache) {
    if (removed >= toRemove) break;

    if (img.src.startsWith('blob:')) {
      URL.revokeObjectURL(img.src);
      blobUrls.delete(img.src);
    }
    imageCache.delete(key);
    removed++;
  }
}
