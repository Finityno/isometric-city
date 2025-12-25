// Terrain module exports

// Noise generation
export {
  noise2D,
  smoothNoise,
  interpolatedNoise,
  perlinNoise,
} from './NoiseGeneration';

// Water generation
export {
  generateLakes,
  generateOceans,
  generateAdjacentCities,
} from './WaterGeneration';

// Terrain initialization
export {
  createTile,
  createBuilding,
  NO_CONSTRUCTION_TYPES,
} from './TerrainInit';
