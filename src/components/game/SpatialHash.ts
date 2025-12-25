/**
 * PERF: Spatial Hash data structure for O(1) entity lookups
 *
 * Used for:
 * - Emergency vehicle dispatch (nearest station lookup)
 * - Pedestrian social interaction checks
 * - Vehicle collision detection
 * - Traffic density calculations
 *
 * Performance characteristics:
 * - insert(): O(1)
 * - remove(): O(1) amortized
 * - query(rect): O(k) where k = entities in region
 * - queryNearest(): O(k) where k = entities in expanding search
 * - clear(): O(1)
 */

export interface SpatialEntity {
  x: number;
  y: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class SpatialHash<T extends SpatialEntity> {
  private cellSize: number;
  private cells: Map<number, Set<T>>;
  private entityCells: Map<T, number>; // Track which cell each entity is in
  private count: number;

  constructor(cellSize: number = 32) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entityCells = new Map();
    this.count = 0;
  }

  /**
   * Hash function to convert x,y coordinates to a cell key
   */
  private getCellKey(x: number, y: number): number {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    // Use Cantor pairing function for unique key (handles negative coords)
    // Shift to handle negatives: add large offset
    const shiftX = cellX + 10000;
    const shiftY = cellY + 10000;
    return ((shiftX + shiftY) * (shiftX + shiftY + 1)) / 2 + shiftY;
  }

  /**
   * Get or create a cell at the given key
   */
  private getOrCreateCell(key: number): Set<T> {
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    return cell;
  }

  /**
   * Insert an entity into the spatial hash
   * O(1) time complexity
   */
  insert(entity: T): void {
    const key = this.getCellKey(entity.x, entity.y);
    const cell = this.getOrCreateCell(key);

    if (!cell.has(entity)) {
      cell.add(entity);
      this.entityCells.set(entity, key);
      this.count++;
    }
  }

  /**
   * Remove an entity from the spatial hash
   * O(1) time complexity
   */
  remove(entity: T): boolean {
    const key = this.entityCells.get(entity);
    if (key === undefined) return false;

    const cell = this.cells.get(key);
    if (cell) {
      cell.delete(entity);
      if (cell.size === 0) {
        this.cells.delete(key);
      }
    }
    this.entityCells.delete(entity);
    this.count--;
    return true;
  }

  /**
   * Update an entity's position in the spatial hash
   * Call this when an entity moves
   * O(1) time complexity
   */
  update(entity: T): void {
    const oldKey = this.entityCells.get(entity);
    const newKey = this.getCellKey(entity.x, entity.y);

    // Only update if cell changed
    if (oldKey !== newKey) {
      if (oldKey !== undefined) {
        const oldCell = this.cells.get(oldKey);
        if (oldCell) {
          oldCell.delete(entity);
          if (oldCell.size === 0) {
            this.cells.delete(oldKey);
          }
        }
      }

      const newCell = this.getOrCreateCell(newKey);
      newCell.add(entity);
      this.entityCells.set(entity, newKey);

      // Adjust count if this was a new insertion
      if (oldKey === undefined) {
        this.count++;
      }
    }
  }

  /**
   * Query all entities within a rectangular region
   * O(k) where k = number of entities in the region
   */
  query(rect: Rect): T[] {
    const results: T[] = [];

    const minCellX = Math.floor(rect.minX / this.cellSize);
    const maxCellX = Math.floor(rect.maxX / this.cellSize);
    const minCellY = Math.floor(rect.minY / this.cellSize);
    const maxCellY = Math.floor(rect.maxY / this.cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const key = this.getCellKey(cellX * this.cellSize, cellY * this.cellSize);
        const cell = this.cells.get(key);

        if (cell) {
          for (const entity of cell) {
            // Precise bounds check
            if (
              entity.x >= rect.minX &&
              entity.x <= rect.maxX &&
              entity.y >= rect.minY &&
              entity.y <= rect.maxY
            ) {
              results.push(entity);
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Query all entities within a circular radius
   * O(k) where k = number of entities in the region
   */
  queryRadius(centerX: number, centerY: number, radius: number): T[] {
    const results: T[] = [];
    const radiusSq = radius * radius;

    // Convert to bounding rect and query cells
    const rect: Rect = {
      minX: centerX - radius,
      minY: centerY - radius,
      maxX: centerX + radius,
      maxY: centerY + radius,
    };

    const minCellX = Math.floor(rect.minX / this.cellSize);
    const maxCellX = Math.floor(rect.maxX / this.cellSize);
    const minCellY = Math.floor(rect.minY / this.cellSize);
    const maxCellY = Math.floor(rect.maxY / this.cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const key = this.getCellKey(cellX * this.cellSize, cellY * this.cellSize);
        const cell = this.cells.get(key);

        if (cell) {
          for (const entity of cell) {
            // Precise distance check
            const dx = entity.x - centerX;
            const dy = entity.y - centerY;
            if (dx * dx + dy * dy <= radiusSq) {
              results.push(entity);
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Find the nearest entity to a point
   * Uses expanding search starting from the center cell
   * O(k) where k = entities searched before finding nearest
   */
  queryNearest(
    x: number,
    y: number,
    maxRadius: number = Infinity,
    filter?: (entity: T) => boolean
  ): T | null {
    let nearest: T | null = null;
    let nearestDistSq = maxRadius * maxRadius;

    // Start with the center cell and expand outward
    const centerCellX = Math.floor(x / this.cellSize);
    const centerCellY = Math.floor(y / this.cellSize);

    // Calculate max cell radius to search
    const maxCellRadius = maxRadius === Infinity
      ? 100 // Reasonable limit
      : Math.ceil(maxRadius / this.cellSize);

    // Expand search in rings until we find something or hit max radius
    for (let ring = 0; ring <= maxCellRadius; ring++) {
      let foundInRing = false;

      // Search cells in this ring
      for (let cellX = centerCellX - ring; cellX <= centerCellX + ring; cellX++) {
        for (let cellY = centerCellY - ring; cellY <= centerCellY + ring; cellY++) {
          // Only process cells on the ring perimeter (or all if ring 0)
          if (ring > 0 &&
              cellX !== centerCellX - ring &&
              cellX !== centerCellX + ring &&
              cellY !== centerCellY - ring &&
              cellY !== centerCellY + ring) {
            continue;
          }

          const key = this.getCellKey(cellX * this.cellSize, cellY * this.cellSize);
          const cell = this.cells.get(key);

          if (cell) {
            for (const entity of cell) {
              if (filter && !filter(entity)) continue;

              const dx = entity.x - x;
              const dy = entity.y - y;
              const distSq = dx * dx + dy * dy;

              if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearest = entity;
                foundInRing = true;
              }
            }
          }
        }
      }

      // If we found something in this ring and the next ring can't be closer,
      // we can stop searching
      if (foundInRing && nearest) {
        const minNextRingDist = (ring + 1) * this.cellSize;
        if (minNextRingDist * minNextRingDist > nearestDistSq) {
          break;
        }
      }
    }

    return nearest;
  }

  /**
   * Find K nearest entities to a point
   */
  queryKNearest(
    x: number,
    y: number,
    k: number,
    maxRadius: number = Infinity,
    filter?: (entity: T) => boolean
  ): T[] {
    // Get all entities in radius and sort by distance
    const candidates = this.queryRadius(x, y, maxRadius);

    const filtered = filter ? candidates.filter(filter) : candidates;

    // Calculate distances and sort
    const withDist = filtered.map(entity => {
      const dx = entity.x - x;
      const dy = entity.y - y;
      return { entity, distSq: dx * dx + dy * dy };
    });

    withDist.sort((a, b) => a.distSq - b.distSq);

    return withDist.slice(0, k).map(item => item.entity);
  }

  /**
   * Clear all entities from the spatial hash
   * O(1) time complexity
   */
  clear(): void {
    this.cells.clear();
    this.entityCells.clear();
    this.count = 0;
  }

  /**
   * Get the total number of entities in the hash
   */
  size(): number {
    return this.count;
  }

  /**
   * Check if an entity is in the spatial hash
   */
  has(entity: T): boolean {
    return this.entityCells.has(entity);
  }

  /**
   * Get all entities (for iteration when needed)
   */
  getAll(): T[] {
    return Array.from(this.entityCells.keys());
  }

  /**
   * Get number of occupied cells (for debugging/stats)
   */
  getCellCount(): number {
    return this.cells.size;
  }
}

/**
 * Specialized spatial hash for grid-based entities (like buildings)
 * Uses integer grid coordinates instead of pixel coordinates
 */
export class GridSpatialHash<T extends { gridX: number; gridY: number }> {
  private cells: Map<number, Set<T>>;
  private entityCells: Map<T, number>;
  private cellSize: number;
  private count: number;

  constructor(cellSize: number = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entityCells = new Map();
    this.count = 0;
  }

  private getCellKey(gridX: number, gridY: number): number {
    const cellX = Math.floor(gridX / this.cellSize);
    const cellY = Math.floor(gridY / this.cellSize);
    return cellX * 10000 + cellY;
  }

  insert(entity: T): void {
    const key = this.getCellKey(entity.gridX, entity.gridY);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    if (!cell.has(entity)) {
      cell.add(entity);
      this.entityCells.set(entity, key);
      this.count++;
    }
  }

  remove(entity: T): boolean {
    const key = this.entityCells.get(entity);
    if (key === undefined) return false;

    const cell = this.cells.get(key);
    if (cell) {
      cell.delete(entity);
      if (cell.size === 0) {
        this.cells.delete(key);
      }
    }
    this.entityCells.delete(entity);
    this.count--;
    return true;
  }

  queryGridRadius(gridX: number, gridY: number, radius: number): T[] {
    const results: T[] = [];
    const radiusSq = radius * radius;

    const minCellX = Math.floor((gridX - radius) / this.cellSize);
    const maxCellX = Math.floor((gridX + radius) / this.cellSize);
    const minCellY = Math.floor((gridY - radius) / this.cellSize);
    const maxCellY = Math.floor((gridY + radius) / this.cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const key = cellX * 10000 + cellY;
        const cell = this.cells.get(key);

        if (cell) {
          for (const entity of cell) {
            const dx = entity.gridX - gridX;
            const dy = entity.gridY - gridY;
            if (dx * dx + dy * dy <= radiusSq) {
              results.push(entity);
            }
          }
        }
      }
    }

    return results;
  }

  queryNearest(
    gridX: number,
    gridY: number,
    maxRadius: number = Infinity,
    filter?: (entity: T) => boolean
  ): T | null {
    let nearest: T | null = null;
    let nearestDistSq = maxRadius * maxRadius;

    const minCellX = Math.floor((gridX - maxRadius) / this.cellSize);
    const maxCellX = Math.floor((gridX + maxRadius) / this.cellSize);
    const minCellY = Math.floor((gridY - maxRadius) / this.cellSize);
    const maxCellY = Math.floor((gridY + maxRadius) / this.cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const key = cellX * 10000 + cellY;
        const cell = this.cells.get(key);

        if (cell) {
          for (const entity of cell) {
            if (filter && !filter(entity)) continue;

            const dx = entity.gridX - gridX;
            const dy = entity.gridY - gridY;
            const distSq = dx * dx + dy * dy;

            if (distSq < nearestDistSq) {
              nearestDistSq = distSq;
              nearest = entity;
            }
          }
        }
      }
    }

    return nearest;
  }

  clear(): void {
    this.cells.clear();
    this.entityCells.clear();
    this.count = 0;
  }

  size(): number {
    return this.count;
  }
}
