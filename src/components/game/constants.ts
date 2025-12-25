import { BuildingType } from '@/types/game';
import { CarDirection, DirectionMeta, TILE_WIDTH, TILE_HEIGHT } from './types';

// ============================================================================
// OPTIMIZED CONSTANTS - Performance improvements applied:
// 1. Frozen arrays/objects for JIT optimization and immutability
// 2. Pre-computed derived values (angles, lengths, etc.)
// 3. Typed tuples with const assertions for better type narrowing
// 4. Sets for O(1) lookup operations
// 5. Inlined numeric literals where beneficial
// ============================================================================

// Pre-computed math constants (avoid repeated calculations)
const PI = Math.PI;
const HALF_PI = PI / 2;
const THREE_HALF_PI = (3 * PI) / 2;
const QUARTER_PI = PI / 4;
const THREE_QUARTER_PI = (3 * PI) / 4;
const HALF_TILE_WIDTH = TILE_WIDTH / 2;  // 32
const HALF_TILE_HEIGHT = TILE_HEIGHT / 2; // 19.2

// Vehicle colors (duller/muted versions) - frozen tuple
export const CAR_COLORS = Object.freeze(['#d97777', '#d4a01f', '#2ba67a', '#4d84c8', '#9a6ac9'] as const);
export const CAR_COLORS_LENGTH = 5 as const;

// Pedestrian appearance colors - frozen tuples with pre-computed lengths
export const PEDESTRIAN_SKIN_COLORS = Object.freeze(['#ffe4c4', '#ffd5b8', '#ffc8a8', '#fdbf7e', '#e0ac69', '#c68642', '#8d5524', '#613318'] as const);
export const PEDESTRIAN_SKIN_COLORS_LENGTH = 8 as const;
export const PEDESTRIAN_SHIRT_COLORS = Object.freeze(['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#1f2937'] as const);
export const PEDESTRIAN_SHIRT_COLORS_LENGTH = 9 as const;
export const PEDESTRIAN_PANTS_COLORS = Object.freeze(['#1f2937', '#374151', '#4b5563', '#1e3a8a', '#7c2d12', '#365314'] as const);
export const PEDESTRIAN_PANTS_COLORS_LENGTH = 6 as const;
export const PEDESTRIAN_HAT_COLORS = Object.freeze(['#ef4444', '#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#1f2937', '#ffffff'] as const);
export const PEDESTRIAN_HAT_COLORS_LENGTH = 7 as const;

// Pedestrian behavior constants - inlined for better optimization
export const PEDESTRIAN_BUILDING_ENTER_TIME = 0.8 as const;
export const PEDESTRIAN_MIN_ACTIVITY_TIME = 20.0 as const;
export const PEDESTRIAN_MAX_ACTIVITY_TIME = 120.0 as const;
export const PEDESTRIAN_ACTIVITY_TIME_RANGE = 100.0 as const; // Pre-computed: MAX - MIN
export const PEDESTRIAN_BUILDING_MIN_TIME = 30.0 as const;
export const PEDESTRIAN_BUILDING_MAX_TIME = 240.0 as const;
export const PEDESTRIAN_BUILDING_TIME_RANGE = 210.0 as const; // Pre-computed: MAX - MIN
export const PEDESTRIAN_SOCIAL_CHANCE = 0.02 as const;
export const PEDESTRIAN_SOCIAL_DURATION = 4.0 as const;
export const PEDESTRIAN_DOG_CHANCE = 0.05 as const;
export const PEDESTRIAN_BAG_CHANCE = 0.15 as const;
export const PEDESTRIAN_HAT_CHANCE = 0.15 as const;
export const PEDESTRIAN_IDLE_CHANCE = 0.01 as const;

// Beach/swimming pedestrian constants
export const PEDESTRIAN_BEACH_CHANCE = 0.15 as const;
export const PEDESTRIAN_BEACH_MIN_TIME = 30.0 as const;
export const PEDESTRIAN_BEACH_MAX_TIME = 180.0 as const;
export const PEDESTRIAN_BEACH_TIME_RANGE = 150.0 as const; // Pre-computed: MAX - MIN
export const PEDESTRIAN_BEACH_SWIM_CHANCE = 0.6 as const;
export const PEDESTRIAN_MAT_COLORS = Object.freeze(['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ff69b4'] as const);
export const PEDESTRIAN_MAT_COLORS_LENGTH = 8 as const;
export const MAX_BEACH_SWIMMERS_PER_TILE = 3 as const;
export const MAX_BEACH_MATS_PER_EDGE = 2 as const;

// Pedestrian performance limits
export const PEDESTRIAN_MAX_COUNT = 800 as const;
export const PEDESTRIAN_ROAD_TILE_DENSITY = 2.4 as const;
export const PEDESTRIAN_SPAWN_BATCH_SIZE = 25 as const;
export const PEDESTRIAN_SPAWN_INTERVAL = 0.03 as const;
export const PEDESTRIAN_UPDATE_SKIP_DISTANCE = 30 as const;
export const PEDESTRIAN_UPDATE_SKIP_DISTANCE_SQ = 900 as const; // Pre-computed: 30^2 for distance checks

// Zoom limits for camera
export const ZOOM_MIN = 0.2 as const;
export const ZOOM_MAX = 7 as const;
export const ZOOM_RANGE = 6.8 as const; // Pre-computed: MAX - MIN

// Zoom thresholds for rendering detail elements
export const CAR_MIN_ZOOM = 0.4 as const;
export const CAR_MIN_ZOOM_MOBILE = 0.45 as const;
export const PEDESTRIAN_MIN_ZOOM = 0.5 as const;
export const PEDESTRIAN_MIN_ZOOM_MOBILE = 0.55 as const;
export const TRAFFIC_LIGHT_MIN_ZOOM = 0.45 as const;
export const DIRECTION_ARROWS_MIN_ZOOM = 0.65 as const;
export const MEDIAN_PLANTS_MIN_ZOOM = 0.55 as const;
export const LANE_MARKINGS_MIN_ZOOM = 0.5 as const;
export const LANE_MARKINGS_MEDIAN_MIN_ZOOM = 0.6 as const;
export const SIDEWALK_MIN_ZOOM = 0.25 as const;
export const SIDEWALK_MIN_ZOOM_MOBILE = 0.25 as const;
export const SKIP_SMALL_ELEMENTS_ZOOM_THRESHOLD = 0.5 as const;

// Airplane system constants
export const AIRPLANE_MIN_POPULATION = 2000 as const;
export const AIRPLANE_COLORS = Object.freeze(['#ffffff', '#1e40af', '#dc2626', '#059669', '#7c3aed'] as const);
export const AIRPLANE_COLORS_LENGTH = 5 as const;
export const CONTRAIL_MAX_AGE = 3.0 as const;
export const CONTRAIL_SPAWN_INTERVAL = 0.02 as const;

// Airplane sprite sheet configuration
export const AIRPLANE_SPRITE_SRC = '/assets/sprites_red_water_new_planes.png' as const;
export const AIRPLANE_SPRITE_COLS = 5 as const;
export const AIRPLANE_SPRITE_ROWS = 6 as const;

// Plane types by row - frozen Map for O(1) lookup
export const PLANE_TYPE_ROWS_MAP = Object.freeze(new Map<string, number>([
  ['737', 0],
  ['777', 1],
  ['747', 2],
  ['a380', 3],
  ['seaplane', 4],
  ['g650', 5],
]));
// Keep original for compatibility but freeze it
export const PLANE_TYPE_ROWS: Readonly<Record<string, number>> = Object.freeze({
  '737': 0,
  '777': 1,
  '747': 2,
  'a380': 3,
  'seaplane': 4,
  'g650': 5,
});

// Available plane types - frozen tuple with pre-computed length
export const PLANE_TYPES = Object.freeze(['737', '737', '737', '777', '777', '747', 'g650'] as const);
export const PLANE_TYPES_LENGTH = 7 as const;

// Direction data type for pre-computed values
type PlaneDirectionData = Readonly<{
  col: number;
  mirrorX: boolean;
  mirrorY: boolean;
  baseAngle: number;
}>;

// Pre-computed direction data (angles calculated at module load)
const SW_BASE_ANGLE = THREE_QUARTER_PI + 0.26;  // ~2.6116
const NE_BASE_ANGLE = -QUARTER_PI + 0.17;        // ~-0.6154
const SE_BASE_ANGLE = QUARTER_PI - 0.26;         // ~0.5254
const NW_BASE_ANGLE = QUARTER_PI - 0.26;         // ~0.5254

export const PLANE_DIRECTION_COLS: Readonly<Record<string, PlaneDirectionData>> = Object.freeze({
  'sw': Object.freeze({ col: 0, mirrorX: false, mirrorY: false, baseAngle: SW_BASE_ANGLE }),
  'ne': Object.freeze({ col: 1, mirrorX: false, mirrorY: false, baseAngle: NE_BASE_ANGLE }),
  'w': Object.freeze({ col: 2, mirrorX: false, mirrorY: false, baseAngle: PI }),
  'n': Object.freeze({ col: 3, mirrorX: false, mirrorY: false, baseAngle: THREE_HALF_PI }),
  'se': Object.freeze({ col: 0, mirrorX: true, mirrorY: false, baseAngle: SE_BASE_ANGLE }),
  'nw': Object.freeze({ col: 1, mirrorX: false, mirrorY: true, baseAngle: NW_BASE_ANGLE }),
  'e': Object.freeze({ col: 2, mirrorX: true, mirrorY: false, baseAngle: 0 }),
  's': Object.freeze({ col: 3, mirrorX: false, mirrorY: true, baseAngle: HALF_PI }),
});

// O(1) lookup Set for col1 override plane types
export const COL1_OVERRIDE_PLANE_TYPES_SET = Object.freeze(new Set(['seaplane', 'g650']));
// Keep array for compatibility
export const COL1_OVERRIDE_PLANE_TYPES = Object.freeze(['seaplane', 'g650'] as const);

// Pre-computed override angles
const COL1_NE_OVERRIDE_ANGLE = -QUARTER_PI - 0.69;       // ~-1.4754
const COL1_SE_OVERRIDE_ANGLE = THREE_QUARTER_PI - 0.78;  // ~1.5754

export const COL1_DIRECTION_OVERRIDES: Readonly<Record<string, PlaneDirectionData>> = Object.freeze({
  'ne': Object.freeze({ col: 3, mirrorX: true, mirrorY: false, baseAngle: COL1_NE_OVERRIDE_ANGLE }),
  'se': Object.freeze({ col: 3, mirrorX: true, mirrorY: true, baseAngle: COL1_SE_OVERRIDE_ANGLE }),
  'nw': Object.freeze({ col: 3, mirrorX: false, mirrorY: false, baseAngle: THREE_HALF_PI }),
});

// Plane scale factors - frozen with Map for O(1) lookup
export const PLANE_SCALES_MAP = Object.freeze(new Map<string, number>([
  ['737', 0.152],
  ['777', 0.184],
  ['747', 0.196],
  ['a380', 0.224],
  ['g650', 0.112],
  ['seaplane', 0.112],
]));
export const PLANE_SCALES: Readonly<Record<string, number>> = Object.freeze({
  '737': 0.152,
  '777': 0.184,
  '747': 0.196,
  'a380': 0.224,
  'g650': 0.112,
  'seaplane': 0.112,
});

// Seaplane system constants
export const SEAPLANE_MIN_POPULATION = 3000 as const;
export const SEAPLANE_MIN_BAY_SIZE = 12 as const;
export const SEAPLANE_COLORS = Object.freeze(['#ffffff', '#1e40af', '#dc2626', '#f97316', '#059669'] as const);
export const SEAPLANE_COLORS_LENGTH = 5 as const;
export const MAX_SEAPLANES = 25 as const;
export const SEAPLANE_SPAWN_INTERVAL_MIN = 3 as const;
export const SEAPLANE_SPAWN_INTERVAL_MAX = 8 as const;
export const SEAPLANE_SPAWN_INTERVAL_RANGE = 5 as const; // Pre-computed: MAX - MIN
export const SEAPLANE_TAXI_TIME_MIN = 3 as const;
export const SEAPLANE_TAXI_TIME_MAX = 8 as const;
export const SEAPLANE_TAXI_TIME_RANGE = 5 as const; // Pre-computed
export const SEAPLANE_FLIGHT_TIME_MIN = 20 as const;
export const SEAPLANE_FLIGHT_TIME_MAX = 40 as const;
export const SEAPLANE_FLIGHT_TIME_RANGE = 20 as const; // Pre-computed
export const SEAPLANE_WATER_SPEED = 20 as const;
export const SEAPLANE_TAKEOFF_SPEED = 60 as const;
export const SEAPLANE_FLIGHT_SPEED_MIN = 70 as const;
export const SEAPLANE_FLIGHT_SPEED_MAX = 100 as const;
export const SEAPLANE_FLIGHT_SPEED_RANGE = 30 as const; // Pre-computed
export const SEAPLANE_MIN_ZOOM = 0.3 as const;

// Helicopter system constants
export const HELICOPTER_MIN_POPULATION = 3000 as const;
export const HELICOPTER_COLORS = Object.freeze(['#dc2626', '#ffffff', '#1e3a8a', '#f97316', '#059669'] as const);
export const HELICOPTER_COLORS_LENGTH = 5 as const;
export const ROTOR_WASH_MAX_AGE = 1.0 as const;
export const ROTOR_WASH_SPAWN_INTERVAL = 0.04 as const;

// Water asset path
export const WATER_ASSET_PATH = '/assets/water.png' as const;

// Boat system constants
export const BOAT_COLORS = Object.freeze(['#ffffff', '#1e3a5f', '#8b4513', '#2f4f4f', '#c41e3a', '#1e90ff'] as const);
export const BOAT_COLORS_LENGTH = 6 as const;
export const BOAT_MIN_ZOOM = 0.3 as const;
export const WAKE_MIN_ZOOM_MOBILE = 0.45 as const;
export const BOATS_PER_DOCK = 1.5 as const;
export const MAX_BOATS = 12 as const;
export const WAKE_MAX_AGE = 2.0 as const;
export const WAKE_SPAWN_INTERVAL = 0.03 as const;

// Barge system constants (ocean cargo ships)
export const BARGE_COLORS = Object.freeze(['#2c3e50', '#34495e', '#7f8c8d', '#c0392b', '#27ae60', '#2980b9'] as const);
export const BARGE_COLORS_LENGTH = 6 as const;
export const BARGE_MIN_ZOOM = 0.25 as const;
export const BARGE_SPEED_MIN = 8 as const;
export const BARGE_SPEED_MAX = 12 as const;
export const BARGE_SPEED_RANGE = 4 as const; // Pre-computed
export const MAX_BARGES = 4 as const;
export const BARGE_SPAWN_INTERVAL_MIN = 8 as const;
export const BARGE_SPAWN_INTERVAL_MAX = 20 as const;
export const BARGE_SPAWN_INTERVAL_RANGE = 12 as const; // Pre-computed
export const BARGE_DOCK_TIME_MIN = 8 as const;
export const BARGE_DOCK_TIME_MAX = 15 as const;
export const BARGE_DOCK_TIME_RANGE = 7 as const; // Pre-computed
export const BARGE_CARGO_VALUE_MIN = 100 as const;
export const BARGE_CARGO_VALUE_MAX = 350 as const;
export const BARGE_CARGO_VALUE_RANGE = 250 as const; // Pre-computed
export const BARGE_WAKE_SPAWN_INTERVAL = 0.05 as const;

// Factory smog system constants - Set for O(1) building type lookup
export const SMOG_BUILDINGS_SET: ReadonlySet<BuildingType> = Object.freeze(new Set<BuildingType>(['factory_medium', 'factory_large']));
export const SMOG_BUILDINGS: readonly BuildingType[] = Object.freeze(['factory_medium', 'factory_large']);
export const SMOG_PARTICLE_MAX_AGE = 8.0 as const;
export const SMOG_PARTICLE_MAX_AGE_MOBILE = 5.0 as const;
export const SMOG_SPAWN_INTERVAL_MEDIUM = 0.4 as const;
export const SMOG_SPAWN_INTERVAL_LARGE = 0.2 as const;
export const SMOG_SPAWN_INTERVAL_MOBILE_MULTIPLIER = 2.0 as const;
export const SMOG_DRIFT_SPEED = 8 as const;
export const SMOG_RISE_SPEED = 12 as const;
export const SMOG_MAX_ZOOM = 1.2 as const;
export const SMOG_FADE_ZOOM = 1.8 as const;
export const SMOG_ZOOM_FADE_RANGE = 0.6 as const; // Pre-computed: FADE - MAX
export const SMOG_BASE_OPACITY = 0.25 as const;
export const SMOG_PARTICLE_SIZE_MIN = 8 as const;
export const SMOG_PARTICLE_SIZE_MAX = 20 as const;
export const SMOG_PARTICLE_SIZE_RANGE = 12 as const; // Pre-computed
export const SMOG_PARTICLE_GROWTH = 0.5 as const;
export const SMOG_MAX_PARTICLES_PER_FACTORY = 25 as const;
export const SMOG_MAX_PARTICLES_PER_FACTORY_MOBILE = 12 as const;

// Train smoke constants (freight locomotives only)
export const TRAIN_SMOKE_PARTICLE_MAX_AGE = 1.8 as const;
export const TRAIN_SMOKE_SPAWN_INTERVAL = 0.15 as const;
export const TRAIN_SMOKE_SPAWN_INTERVAL_MOBILE = 0.3 as const;
export const TRAIN_SMOKE_DRIFT_SPEED = 8 as const;
export const TRAIN_SMOKE_RISE_SPEED = 18 as const;
export const TRAIN_SMOKE_BASE_OPACITY = 0.5 as const;
export const TRAIN_SMOKE_PARTICLE_SIZE_MIN = 2 as const;
export const TRAIN_SMOKE_PARTICLE_SIZE_MAX = 4 as const;
export const TRAIN_SMOKE_PARTICLE_SIZE_RANGE = 2 as const; // Pre-computed
export const TRAIN_SMOKE_PARTICLE_GROWTH = 0.8 as const;
export const TRAIN_SMOKE_MAX_PARTICLES = 12 as const;
export const TRAIN_SMOKE_MAX_PARTICLES_MOBILE = 6 as const;

// Firework system constants - Set for O(1) building type lookup
export const FIREWORK_BUILDINGS_SET: ReadonlySet<BuildingType> = Object.freeze(new Set<BuildingType>(['baseball_stadium', 'amusement_park', 'marina_docks_small', 'pier_large']));
export const FIREWORK_BUILDINGS: readonly BuildingType[] = Object.freeze(['baseball_stadium', 'amusement_park', 'marina_docks_small', 'pier_large']);
export const FIREWORK_COLORS = Object.freeze([
  '#ff4444', '#ff6b6b', // Reds
  '#44ff44', '#6bff6b', // Greens
  '#4444ff', '#6b6bff', // Blues
  '#ffff44', '#ffff6b', // Yellows
  '#ff44ff', '#ff6bff', // Magentas
  '#44ffff', '#6bffff', // Cyans
  '#ff8844', '#ffaa44', // Oranges
  '#ffffff', '#ffffee', // Whites
] as const);
export const FIREWORK_COLORS_LENGTH = 16 as const;
export const FIREWORK_PARTICLE_COUNT = 40 as const;
export const FIREWORK_PARTICLE_SPEED = 120 as const;
export const FIREWORK_PARTICLE_MAX_AGE = 1.5 as const;
export const FIREWORK_LAUNCH_SPEED = 180 as const;
export const FIREWORK_SPAWN_INTERVAL_MIN = 0.3 as const;
export const FIREWORK_SPAWN_INTERVAL_MAX = 1.2 as const;
export const FIREWORK_SPAWN_INTERVAL_RANGE = 0.9 as const; // Pre-computed
export const FIREWORK_SHOW_DURATION = 45 as const;
export const FIREWORK_SHOW_CHANCE = 0.35 as const;

// Pre-computed direction metadata (all math done at module load)
// Pre-computed vector lengths for normals
const DIAGONAL_VEC_LENGTH = Math.hypot(HALF_TILE_WIDTH, HALF_TILE_HEIGHT); // ~37.47

const NORTH_VEC_DX = -HALF_TILE_WIDTH;  // -32
const NORTH_VEC_DY = -HALF_TILE_HEIGHT; // -19.2
const NORTH_ANGLE = Math.atan2(NORTH_VEC_DY, NORTH_VEC_DX); // ~-2.6016
const NORTH_NORMAL_NX = -NORTH_VEC_DY / DIAGONAL_VEC_LENGTH;
const NORTH_NORMAL_NY = NORTH_VEC_DX / DIAGONAL_VEC_LENGTH;

const EAST_VEC_DX = HALF_TILE_WIDTH;   // 32
const EAST_VEC_DY = -HALF_TILE_HEIGHT; // -19.2
const EAST_ANGLE = Math.atan2(EAST_VEC_DY, EAST_VEC_DX); // ~-0.5404
const EAST_NORMAL_NX = -EAST_VEC_DY / DIAGONAL_VEC_LENGTH;
const EAST_NORMAL_NY = EAST_VEC_DX / DIAGONAL_VEC_LENGTH;

const SOUTH_VEC_DX = HALF_TILE_WIDTH;  // 32
const SOUTH_VEC_DY = HALF_TILE_HEIGHT; // 19.2
const SOUTH_ANGLE = Math.atan2(SOUTH_VEC_DY, SOUTH_VEC_DX); // ~0.5404
const SOUTH_NORMAL_NX = -SOUTH_VEC_DY / DIAGONAL_VEC_LENGTH;
const SOUTH_NORMAL_NY = SOUTH_VEC_DX / DIAGONAL_VEC_LENGTH;

const WEST_VEC_DX = -HALF_TILE_WIDTH; // -32
const WEST_VEC_DY = HALF_TILE_HEIGHT; // 19.2
const WEST_ANGLE = Math.atan2(WEST_VEC_DY, WEST_VEC_DX); // ~2.6016
const WEST_NORMAL_NX = -WEST_VEC_DY / DIAGONAL_VEC_LENGTH;
const WEST_NORMAL_NY = WEST_VEC_DX / DIAGONAL_VEC_LENGTH;

// Fully pre-computed and frozen direction metadata
export const DIRECTION_META: Readonly<Record<CarDirection, DirectionMeta>> = Object.freeze({
  north: Object.freeze({
    step: Object.freeze({ x: -1, y: 0 }),
    vec: Object.freeze({ dx: NORTH_VEC_DX, dy: NORTH_VEC_DY }),
    angle: NORTH_ANGLE,
    normal: Object.freeze({ nx: NORTH_NORMAL_NX, ny: NORTH_NORMAL_NY }),
  }),
  east: Object.freeze({
    step: Object.freeze({ x: 0, y: -1 }),
    vec: Object.freeze({ dx: EAST_VEC_DX, dy: EAST_VEC_DY }),
    angle: EAST_ANGLE,
    normal: Object.freeze({ nx: EAST_NORMAL_NX, ny: EAST_NORMAL_NY }),
  }),
  south: Object.freeze({
    step: Object.freeze({ x: 1, y: 0 }),
    vec: Object.freeze({ dx: SOUTH_VEC_DX, dy: SOUTH_VEC_DY }),
    angle: SOUTH_ANGLE,
    normal: Object.freeze({ nx: SOUTH_NORMAL_NX, ny: SOUTH_NORMAL_NY }),
  }),
  west: Object.freeze({
    step: Object.freeze({ x: 0, y: 1 }),
    vec: Object.freeze({ dx: WEST_VEC_DX, dy: WEST_VEC_DY }),
    angle: WEST_ANGLE,
    normal: Object.freeze({ nx: WEST_NORMAL_NX, ny: WEST_NORMAL_NY }),
  }),
});

export const OPPOSITE_DIRECTION: Readonly<Record<CarDirection, CarDirection>> = Object.freeze({
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
});

// Traffic light timing constants (faster cycle)
export const TRAFFIC_LIGHT_GREEN_DURATION = 3.0 as const;
export const TRAFFIC_LIGHT_YELLOW_DURATION = 0.8 as const;
export const TRAFFIC_LIGHT_CYCLE = 7.6 as const;
// Pre-computed phase boundaries for traffic light state checks
export const TRAFFIC_LIGHT_YELLOW_START = 3.0 as const; // GREEN_DURATION
export const TRAFFIC_LIGHT_RED_START = 3.8 as const;     // GREEN + YELLOW

// Train system constants
export const TRAIN_MIN_ZOOM = 0.35 as const;
export const TRAIN_SPAWN_INTERVAL = 3.0 as const;
export const MIN_RAIL_TILES_FOR_TRAINS = 10 as const;
export const MAX_TRAINS = 35 as const;
