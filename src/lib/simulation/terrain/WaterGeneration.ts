// Water generation functions for terrain (lakes, oceans, adjacent cities)

import { Tile, WaterBody, AdjacentCity } from '@/types/game';
import { generateCityName, generateWaterName } from '../../names';
import { perlinNoise } from './NoiseGeneration';
import { createBuilding } from './TerrainInit';

// Generate 2-3 large, round lakes and return water bodies
export function generateLakes(grid: Tile[][], size: number, seed: number): WaterBody[] {
  // Use noise to find potential lake centers - look for low points
  const lakeNoise = (x: number, y: number) => perlinNoise(x, y, seed + 1000, 3);

  // Find lake seed points (local minimums in noise)
  const lakeCenters: { x: number; y: number; noise: number }[] = [];
  const minDistFromEdge = Math.max(8, Math.floor(size * 0.15)); // Keep lakes away from ocean edges
  const minDistBetweenLakes = Math.max(size * 0.2, 10); // Adaptive but ensure minimum separation

  // Collect all potential lake centers with adaptive threshold
  // Start with a lenient threshold and tighten if we find too many
  let threshold = 0.5;
  let attempts = 0;
  const maxAttempts = 3;

  while (lakeCenters.length < 2 && attempts < maxAttempts) {
    lakeCenters.length = 0; // Reset for this attempt

    for (let y = minDistFromEdge; y < size - minDistFromEdge; y++) {
      for (let x = minDistFromEdge; x < size - minDistFromEdge; x++) {
        const noiseVal = lakeNoise(x, y);

        // Check if this is a good lake center (low noise value)
        if (noiseVal < threshold) {
          // Check distance from other lake centers
          let tooClose = false;
          for (const center of lakeCenters) {
            const dist = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
            if (dist < minDistBetweenLakes) {
              tooClose = true;
              break;
            }
          }

          if (!tooClose) {
            lakeCenters.push({ x, y, noise: noiseVal });
          }
        }
      }
    }

    // If we found enough centers, break
    if (lakeCenters.length >= 2) break;

    // Otherwise, relax the threshold for next attempt
    threshold += 0.1;
    attempts++;
  }

  // If still no centers found, force create at least 2 lakes at strategic positions
  if (lakeCenters.length === 0) {
    // Place lakes at strategic positions, ensuring they're far enough from edges
    const safeZone = minDistFromEdge + 5; // Extra buffer for lake growth
    const quarterSize = Math.max(safeZone, Math.floor(size / 4));
    const threeQuarterSize = Math.min(size - safeZone, Math.floor(size * 3 / 4));
    lakeCenters.push(
      { x: quarterSize, y: quarterSize, noise: 0 },
      { x: threeQuarterSize, y: threeQuarterSize, noise: 0 }
    );
  } else if (lakeCenters.length === 1) {
    // If only one center found, add another at a safe distance
    const existing = lakeCenters[0];
    const safeZone = minDistFromEdge + 5;
    const quarterSize = Math.max(safeZone, Math.floor(size / 4));
    const threeQuarterSize = Math.min(size - safeZone, Math.floor(size * 3 / 4));
    let newX = existing.x > size / 2 ? quarterSize : threeQuarterSize;
    let newY = existing.y > size / 2 ? quarterSize : threeQuarterSize;
    lakeCenters.push({ x: newX, y: newY, noise: 0 });
  }

  // Sort by noise value (lowest first) and pick 2-3 best candidates
  lakeCenters.sort((a, b) => a.noise - b.noise);
  const numLakes = 2 + Math.floor(Math.random() * 2); // 2 or 3 lakes
  const selectedCenters = lakeCenters.slice(0, Math.min(numLakes, lakeCenters.length));

  const waterBodies: WaterBody[] = [];
  const usedLakeNames = new Set<string>();

  // Grow lakes from each center using radial expansion for rounder shapes
  for (const center of selectedCenters) {
    // Target size: 40-80 tiles for bigger lakes
    const targetSize = 40 + Math.floor(Math.random() * 41);
    const lakeTiles: { x: number; y: number }[] = [{ x: center.x, y: center.y }];
    const candidates: { x: number; y: number; dist: number; noise: number }[] = [];

    // Add initial neighbors as candidates
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dx, dy] of directions) {
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (nx >= minDistFromEdge && nx < size - minDistFromEdge &&
          ny >= minDistFromEdge && ny < size - minDistFromEdge) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        const noise = lakeNoise(nx, ny);
        candidates.push({ x: nx, y: ny, dist, noise });
      }
    }

    // Grow lake by adding adjacent tiles, prioritizing:
    // 1. Closer to center (for rounder shape)
    // 2. Lower noise values (for organic shape)
    while (lakeTiles.length < targetSize && candidates.length > 0) {
      // Sort by distance from center first, then noise
      candidates.sort((a, b) => {
        if (Math.abs(a.dist - b.dist) < 0.5) {
          return a.noise - b.noise; // If similar distance, prefer lower noise
        }
        return a.dist - b.dist; // Prefer closer tiles for rounder shape
      });

      // Pick from top candidates (closest/lowest noise)
      const pickIndex = Math.floor(Math.random() * Math.min(5, candidates.length));
      const picked = candidates.splice(pickIndex, 1)[0];

      // Check if already in lake
      if (lakeTiles.some(t => t.x === picked.x && t.y === picked.y)) continue;

      // Check if tile is valid (not already water from another lake)
      if (grid[picked.y][picked.x].building.type === 'water') continue;

      lakeTiles.push({ x: picked.x, y: picked.y });

      // Add new neighbors as candidates
      for (const [dx, dy] of directions) {
        const nx = picked.x + dx;
        const ny = picked.y + dy;
        if (nx >= minDistFromEdge && nx < size - minDistFromEdge &&
            ny >= minDistFromEdge && ny < size - minDistFromEdge &&
            !lakeTiles.some(t => t.x === nx && t.y === ny) &&
            !candidates.some(c => c.x === nx && c.y === ny)) {
          const dist = Math.sqrt((nx - center.x) ** 2 + (ny - center.y) ** 2);
          const noise = lakeNoise(nx, ny);
          candidates.push({ x: nx, y: ny, dist, noise });
        }
      }
    }

    // Apply lake tiles to grid
    for (const tile of lakeTiles) {
      grid[tile.y][tile.x].building = createBuilding('water');
      grid[tile.y][tile.x].landValue = 60; // Water increases nearby land value
    }

    // Calculate center for labeling
    const avgX = lakeTiles.reduce((sum, t) => sum + t.x, 0) / lakeTiles.length;
    const avgY = lakeTiles.reduce((sum, t) => sum + t.y, 0) / lakeTiles.length;

    // Assign a random name to this lake
    let lakeName = generateWaterName('lake');
    while (usedLakeNames.has(lakeName)) {
      lakeName = generateWaterName('lake');
    }
    usedLakeNames.add(lakeName);

    // Add to water bodies list
    waterBodies.push({
      id: `lake-${waterBodies.length}`,
      name: lakeName,
      type: 'lake',
      tiles: lakeTiles,
      centerX: Math.round(avgX),
      centerY: Math.round(avgY),
    });
  }

  return waterBodies;
}

// Generate ocean connections on map edges (sometimes) with organic coastlines
export function generateOceans(grid: Tile[][], size: number, seed: number): WaterBody[] {
  const waterBodies: WaterBody[] = [];
  const oceanChance = 0.4; // 40% chance per edge

  // Use noise for coastline variation
  const coastNoise = (x: number, y: number) => perlinNoise(x, y, seed + 2000, 3);

  // Check each edge independently
  const edges: Array<{ side: 'north' | 'east' | 'south' | 'west'; tiles: { x: number; y: number }[] }> = [];

  // Ocean parameters
  const baseDepth = Math.max(4, Math.floor(size * 0.12));
  const depthVariation = Math.max(4, Math.floor(size * 0.08));
  const maxDepth = Math.floor(size * 0.18);

  // Helper to generate organic ocean section along an edge
  const generateOceanEdge = (
    isHorizontal: boolean,
    edgePosition: number, // 0 for north/west, size-1 for south/east
    inwardDirection: 1 | -1 // 1 = increasing coord, -1 = decreasing coord
  ): { x: number; y: number }[] => {
    const tiles: { x: number; y: number }[] = [];

    // Randomize the span of the ocean (40-80% of edge, not full length)
    const spanStart = Math.floor(size * (0.05 + Math.random() * 0.25));
    const spanEnd = Math.floor(size * (0.7 + Math.random() * 0.25));

    for (let i = spanStart; i < spanEnd; i++) {
      // Use noise to determine depth at this position, with fade at edges
      const edgeFade = Math.min(
        (i - spanStart) / 5,
        (spanEnd - i) / 5,
        1
      );

      // Layer two noise frequencies for more interesting coastline
      // Higher frequency noise for fine detail, lower for broad shape
      const coarseNoise = coastNoise(
        isHorizontal ? i * 0.08 : edgePosition * 0.08,
        isHorizontal ? edgePosition * 0.08 : i * 0.08
      );
      const fineNoise = coastNoise(
        isHorizontal ? i * 0.25 : edgePosition * 0.25 + 500,
        isHorizontal ? edgePosition * 0.25 + 500 : i * 0.25
      );
      const noiseVal = coarseNoise * 0.6 + fineNoise * 0.4;

      // Depth varies based on noise and fades at the ends
      const rawDepth = baseDepth + (noiseVal - 0.5) * depthVariation * 2.5;
      const localDepth = Math.max(1, Math.min(Math.floor(rawDepth * edgeFade), maxDepth));

      // Place water tiles from edge inward
      for (let d = 0; d < localDepth; d++) {
        const x = isHorizontal ? i : (inwardDirection === 1 ? d : size - 1 - d);
        const y = isHorizontal ? (inwardDirection === 1 ? d : size - 1 - d) : i;

        if (x >= 0 && x < size && y >= 0 && y < size && grid[y][x].building.type !== 'water') {
          grid[y][x].building = createBuilding('water');
          grid[y][x].landValue = 60;
          tiles.push({ x, y });
        }
      }
    }

    return tiles;
  };

  // North edge (top, y=0, extends downward)
  if (Math.random() < oceanChance) {
    const tiles = generateOceanEdge(true, 0, 1);
    if (tiles.length > 0) {
      edges.push({ side: 'north', tiles });
    }
  }

  // South edge (bottom, y=size-1, extends upward)
  if (Math.random() < oceanChance) {
    const tiles = generateOceanEdge(true, size - 1, -1);
    if (tiles.length > 0) {
      edges.push({ side: 'south', tiles });
    }
  }

  // East edge (right, x=size-1, extends leftward)
  if (Math.random() < oceanChance) {
    const tiles = generateOceanEdge(false, size - 1, -1);
    if (tiles.length > 0) {
      edges.push({ side: 'east', tiles });
    }
  }

  // West edge (left, x=0, extends rightward)
  if (Math.random() < oceanChance) {
    const tiles = generateOceanEdge(false, 0, 1);
    if (tiles.length > 0) {
      edges.push({ side: 'west', tiles });
    }
  }

  // Create water body entries for oceans
  const usedOceanNames = new Set<string>();
  for (const edge of edges) {
    if (edge.tiles.length > 0) {
      const avgX = edge.tiles.reduce((sum, t) => sum + t.x, 0) / edge.tiles.length;
      const avgY = edge.tiles.reduce((sum, t) => sum + t.y, 0) / edge.tiles.length;

      let oceanName = generateWaterName('ocean');
      while (usedOceanNames.has(oceanName)) {
        oceanName = generateWaterName('ocean');
      }
      usedOceanNames.add(oceanName);

      waterBodies.push({
        id: `ocean-${edge.side}-${waterBodies.length}`,
        name: oceanName,
        type: 'ocean',
        tiles: edge.tiles,
        centerX: Math.round(avgX),
        centerY: Math.round(avgY),
      });
    }
  }

  return waterBodies;
}

// Generate adjacent cities - always create one for each direction (undiscovered until road reaches edge)
export function generateAdjacentCities(): AdjacentCity[] {
  const cities: AdjacentCity[] = [];
  const directions: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];
  const usedNames = new Set<string>();

  for (const direction of directions) {
    let name: string;
    do {
      name = generateCityName();
    } while (usedNames.has(name));
    usedNames.add(name);

    cities.push({
      id: `city-${direction}`,
      name,
      direction,
      connected: false,
      discovered: false, // Cities are discovered when a road reaches their edge
    });
  }

  return cities;
}
