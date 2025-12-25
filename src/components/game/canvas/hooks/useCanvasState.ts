'use client';

import { useRef, useState } from 'react';
import type {
  Car,
  EmergencyVehicle,
  Pedestrian,
  Airplane,
  Helicopter,
  Seaplane,
  Boat,
  Barge,
  Train,
  Firework,
  FactorySmog,
  WorldRenderState,
} from '@/components/game/types';
import type { Tile } from '@/types/game';
import type { CrimeType } from '@/components/game/incidentData';

/**
 * Canvas element refs organized by rendering layer
 */
export interface CanvasRefs {
  /** Main canvas element (base layer) */
  main: React.RefObject<HTMLCanvasElement | null>;
  /** Hover overlay canvas for selection highlights */
  hover: React.RefObject<HTMLCanvasElement | null>;
  /** Cars and vehicles canvas layer */
  cars: React.RefObject<HTMLCanvasElement | null>;
  /** Buildings canvas layer (rendered above cars/trains) */
  buildings: React.RefObject<HTMLCanvasElement | null>;
  /** Air layer for aircraft and fireworks */
  air: React.RefObject<HTMLCanvasElement | null>;
  /** Lighting effects canvas */
  lighting: React.RefObject<HTMLCanvasElement | null>;
}

/**
 * Entity system refs for vehicles and effects
 */
export interface EntitySystemRefs {
  // Car system
  cars: React.MutableRefObject<Car[]>;
  carId: React.MutableRefObject<number>;
  carSpawnTimer: React.MutableRefObject<number>;

  // Emergency vehicle system
  emergencyVehicles: React.MutableRefObject<EmergencyVehicle[]>;
  emergencyVehicleId: React.MutableRefObject<number>;
  emergencyDispatchTimer: React.MutableRefObject<number>;
  activeFires: React.MutableRefObject<Set<string>>;
  activeCrimes: React.MutableRefObject<Set<string>>;
  activeCrimeIncidents: React.MutableRefObject<Map<string, { x: number; y: number; type: CrimeType; timeRemaining: number }>>;
  crimeSpawnTimer: React.MutableRefObject<number>;

  // Pedestrian system
  pedestrians: React.MutableRefObject<Pedestrian[]>;
  pedestrianId: React.MutableRefObject<number>;
  pedestrianSpawnTimer: React.MutableRefObject<number>;

  // Airplane system
  airplanes: React.MutableRefObject<Airplane[]>;
  airplaneId: React.MutableRefObject<number>;
  airplaneSpawnTimer: React.MutableRefObject<number>;

  // Helicopter system
  helicopters: React.MutableRefObject<Helicopter[]>;
  helicopterId: React.MutableRefObject<number>;
  helicopterSpawnTimer: React.MutableRefObject<number>;

  // Seaplane system
  seaplanes: React.MutableRefObject<Seaplane[]>;
  seaplaneId: React.MutableRefObject<number>;
  seaplaneSpawnTimer: React.MutableRefObject<number>;

  // Boat system
  boats: React.MutableRefObject<Boat[]>;
  boatId: React.MutableRefObject<number>;
  boatSpawnTimer: React.MutableRefObject<number>;

  // Barge system (ocean cargo ships)
  barges: React.MutableRefObject<Barge[]>;
  bargeId: React.MutableRefObject<number>;
  bargeSpawnTimer: React.MutableRefObject<number>;

  // Train system
  trains: React.MutableRefObject<Train[]>;
  trainId: React.MutableRefObject<number>;
  trainSpawnTimer: React.MutableRefObject<number>;

  // Firework system
  fireworks: React.MutableRefObject<Firework[]>;
  fireworkId: React.MutableRefObject<number>;
  fireworkSpawnTimer: React.MutableRefObject<number>;
  fireworkShowActive: React.MutableRefObject<boolean>;
  fireworkShowStartTime: React.MutableRefObject<number>;
  fireworkLastHour: React.MutableRefObject<number>;

  // Factory smog system
  factorySmog: React.MutableRefObject<FactorySmog[]>;
  smogLastGridVersion: React.MutableRefObject<number>;

  // Navigation light flash timer
  navLightFlashTimer: React.MutableRefObject<number>;

  // Railroad crossing state
  crossingFlashTimer: React.MutableRefObject<number>;
  crossingGateAngles: React.MutableRefObject<Map<number, number>>;
  crossingPositions: React.MutableRefObject<{ x: number; y: number }[]>;
  crossingKeySet: React.MutableRefObject<Set<number>>;

  // Traffic light system timer
  trafficLightTimer: React.MutableRefObject<number>;
}

/**
 * Viewport state refs (non-React state for animation loop)
 */
export interface ViewportRefs {
  zoom: React.MutableRefObject<number>;
  isPanning: React.MutableRefObject<boolean>;
  isPinchZooming: React.MutableRefObject<boolean>;
  isWheelScrolling: React.MutableRefObject<boolean>;
  wheelScrollTimeout: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * Performance and cache refs
 */
export interface PerformanceRefs {
  renderPending: React.MutableRefObject<number | null>;
  hoverRenderPending: React.MutableRefObject<number | null>;
  lastHoverStateUpdate: React.MutableRefObject<number>;

  // Cached calculations
  cachedRoadTileCount: React.MutableRefObject<{ count: number; gridVersion: number }>;
  cachedPopulation: React.MutableRefObject<{ count: number; gridVersion: number }>;
  gridVersion: React.MutableRefObject<number>;

  // Road analysis cache
  roadAnalysisCache: React.MutableRefObject<Map<string, any>>;
  roadAnalysisCacheVersion: React.MutableRefObject<number>;
}

/**
 * Hover state refs
 */
export interface HoverRefs {
  hoveredTile: React.MutableRefObject<{ x: number; y: number } | null>;
}

/**
 * Interaction refs
 */
export interface InteractionRefs {
  panCandidate: React.MutableRefObject<{ startX: number; startY: number; gridX: number; gridY: number } | null>;
  keysPressed: React.MutableRefObject<Set<string>>;
  placedRoadTiles: React.MutableRefObject<Set<string>>;

  // Touch gesture state
  touchStart: React.MutableRefObject<{ x: number; y: number; time: number } | null>;
  initialPinchDistance: React.MutableRefObject<number | null>;
  initialZoom: React.MutableRefObject<number>;
  lastTouchCenter: React.MutableRefObject<{ x: number; y: number } | null>;
}

/**
 * World state ref (for rendering)
 */
export interface WorldStateRef {
  worldState: React.MutableRefObject<WorldRenderState>;
}

/**
 * Canvas state hook - consolidates all canvas-related refs and state
 */
export function useCanvasState(isMobile: boolean, grid: Tile[][], gridSize: number, speed: number) {
  // Canvas element refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const carsCanvasRef = useRef<HTMLCanvasElement>(null);
  const buildingsCanvasRef = useRef<HTMLCanvasElement>(null);
  const airCanvasRef = useRef<HTMLCanvasElement>(null);
  const lightingCanvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport state
  const [offset, setOffset] = useState({ x: isMobile ? 200 : 620, y: isMobile ? 100 : 160 });
  const [zoom, setZoom] = useState(isMobile ? 0.6 : 1);
  const zoomRef = useRef(isMobile ? 0.6 : 1);
  const isPanningRef = useRef(false);
  const isPinchZoomingRef = useRef(false);
  const isWheelScrollingRef = useRef(false);
  const wheelScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const panCandidateRef = useRef<{ startX: number; startY: number; gridX: number; gridY: number } | null>(null);

  // Hover state
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);
  const hoveredTileRef = useRef<{ x: number; y: number } | null>(null);
  const [hoveredIncident, setHoveredIncident] = useState<{
    x: number;
    y: number;
    type: 'fire' | 'crime';
    crimeType?: CrimeType;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Drag selection state
  const [dragStartTile, setDragStartTile] = useState<{ x: number; y: number } | null>(null);
  const [dragEndTile, setDragEndTile] = useState<{ x: number; y: number } | null>(null);
  const [roadDrawDirection, setRoadDrawDirection] = useState<'h' | 'v' | null>(null);
  const placedRoadTilesRef = useRef<Set<string>>(new Set());

  // Touch gesture refs
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(zoom);
  const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null);

  // Keyboard state
  const keysPressedRef = useRef<Set<string>>(new Set());

  // Performance refs
  const renderPendingRef = useRef<number | null>(null);
  const hoverRenderPendingRef = useRef<number | null>(null);
  const lastHoverStateUpdateRef = useRef<number>(0);

  // Cache refs
  const cachedRoadTileCountRef = useRef<{ count: number; gridVersion: number }>({ count: 0, gridVersion: -1 });
  const cachedPopulationRef = useRef<{ count: number; gridVersion: number }>({ count: 0, gridVersion: -1 });
  const gridVersionRef = useRef(0);
  const roadAnalysisCacheRef = useRef<Map<string, any>>(new Map());
  const roadAnalysisCacheVersionRef = useRef(-1);

  // Entity system refs - Cars
  const carsRef = useRef<Car[]>([]);
  const carIdRef = useRef(0);
  const carSpawnTimerRef = useRef(0);

  // Emergency vehicles
  const emergencyVehiclesRef = useRef<EmergencyVehicle[]>([]);
  const emergencyVehicleIdRef = useRef(0);
  const emergencyDispatchTimerRef = useRef(0);
  const activeFiresRef = useRef<Set<string>>(new Set());
  const activeCrimesRef = useRef<Set<string>>(new Set());
  const activeCrimeIncidentsRef = useRef<Map<string, { x: number; y: number; type: CrimeType; timeRemaining: number }>>(new Map());
  const crimeSpawnTimerRef = useRef(0);

  // Pedestrians
  const pedestriansRef = useRef<Pedestrian[]>([]);
  const pedestrianIdRef = useRef(0);
  const pedestrianSpawnTimerRef = useRef(0);

  // Airplanes
  const airplanesRef = useRef<Airplane[]>([]);
  const airplaneIdRef = useRef(0);
  const airplaneSpawnTimerRef = useRef(0);

  // Helicopters
  const helicoptersRef = useRef<Helicopter[]>([]);
  const helicopterIdRef = useRef(0);
  const helicopterSpawnTimerRef = useRef(0);

  // Seaplanes
  const seaplanesRef = useRef<Seaplane[]>([]);
  const seaplaneIdRef = useRef(0);
  const seaplaneSpawnTimerRef = useRef(0);

  // Boats
  const boatsRef = useRef<Boat[]>([]);
  const boatIdRef = useRef(0);
  const boatSpawnTimerRef = useRef(0);

  // Barges
  const bargesRef = useRef<Barge[]>([]);
  const bargeIdRef = useRef(0);
  const bargeSpawnTimerRef = useRef(0);

  // Trains
  const trainsRef = useRef<Train[]>([]);
  const trainIdRef = useRef(0);
  const trainSpawnTimerRef = useRef(0);

  // Navigation lights
  const navLightFlashTimerRef = useRef(0);

  // Railroad crossings
  const crossingFlashTimerRef = useRef(0);
  const crossingGateAnglesRef = useRef<Map<number, number>>(new Map());
  const crossingPositionsRef = useRef<{x: number, y: number}[]>([]);
  const crossingKeySetRef = useRef<Set<number>>(new Set());

  // Fireworks
  const fireworksRef = useRef<Firework[]>([]);
  const fireworkIdRef = useRef(0);
  const fireworkSpawnTimerRef = useRef(0);
  const fireworkShowActiveRef = useRef(false);
  const fireworkShowStartTimeRef = useRef(0);
  const fireworkLastHourRef = useRef(-1);

  // Factory smog
  const factorySmogRef = useRef<FactorySmog[]>([]);
  const smogLastGridVersionRef = useRef(-1);

  // Traffic lights
  const trafficLightTimerRef = useRef(0);

  // World state ref
  const worldStateRef = useRef<WorldRenderState>({
    grid,
    gridSize,
    offset,
    zoom,
    speed,
    canvasSize: { width: 1200, height: 800 },
  });

  // Canvas size state
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });

  // Image loading state
  const [imagesLoaded, setImagesLoaded] = useState(true);
  const [imageLoadVersion, setImageLoadVersion] = useState(0);

  // City connection dialog
  const [cityConnectionDialog, setCityConnectionDialog] = useState<{ direction: 'north' | 'south' | 'east' | 'west' } | null>(null);

  // Organize refs into structured groups
  const canvases: CanvasRefs = {
    main: canvasRef,
    hover: hoverCanvasRef,
    cars: carsCanvasRef,
    buildings: buildingsCanvasRef,
    air: airCanvasRef,
    lighting: lightingCanvasRef,
  };

  const entityRefs: EntitySystemRefs = {
    cars: carsRef,
    carId: carIdRef,
    carSpawnTimer: carSpawnTimerRef,
    emergencyVehicles: emergencyVehiclesRef,
    emergencyVehicleId: emergencyVehicleIdRef,
    emergencyDispatchTimer: emergencyDispatchTimerRef,
    activeFires: activeFiresRef,
    activeCrimes: activeCrimesRef,
    activeCrimeIncidents: activeCrimeIncidentsRef,
    crimeSpawnTimer: crimeSpawnTimerRef,
    pedestrians: pedestriansRef,
    pedestrianId: pedestrianIdRef,
    pedestrianSpawnTimer: pedestrianSpawnTimerRef,
    airplanes: airplanesRef,
    airplaneId: airplaneIdRef,
    airplaneSpawnTimer: airplaneSpawnTimerRef,
    helicopters: helicoptersRef,
    helicopterId: helicopterIdRef,
    helicopterSpawnTimer: helicopterSpawnTimerRef,
    seaplanes: seaplanesRef,
    seaplaneId: seaplaneIdRef,
    seaplaneSpawnTimer: seaplaneSpawnTimerRef,
    boats: boatsRef,
    boatId: boatIdRef,
    boatSpawnTimer: boatSpawnTimerRef,
    barges: bargesRef,
    bargeId: bargeIdRef,
    bargeSpawnTimer: bargeSpawnTimerRef,
    trains: trainsRef,
    trainId: trainIdRef,
    trainSpawnTimer: trainSpawnTimerRef,
    fireworks: fireworksRef,
    fireworkId: fireworkIdRef,
    fireworkSpawnTimer: fireworkSpawnTimerRef,
    fireworkShowActive: fireworkShowActiveRef,
    fireworkShowStartTime: fireworkShowStartTimeRef,
    fireworkLastHour: fireworkLastHourRef,
    factorySmog: factorySmogRef,
    smogLastGridVersion: smogLastGridVersionRef,
    navLightFlashTimer: navLightFlashTimerRef,
    crossingFlashTimer: crossingFlashTimerRef,
    crossingGateAngles: crossingGateAnglesRef,
    crossingPositions: crossingPositionsRef,
    crossingKeySet: crossingKeySetRef,
    trafficLightTimer: trafficLightTimerRef,
  };

  const viewportRefs: ViewportRefs = {
    zoom: zoomRef,
    isPanning: isPanningRef,
    isPinchZooming: isPinchZoomingRef,
    isWheelScrolling: isWheelScrollingRef,
    wheelScrollTimeout: wheelScrollTimeoutRef,
  };

  const performanceRefs: PerformanceRefs = {
    renderPending: renderPendingRef,
    hoverRenderPending: hoverRenderPendingRef,
    lastHoverStateUpdate: lastHoverStateUpdateRef,
    cachedRoadTileCount: cachedRoadTileCountRef,
    cachedPopulation: cachedPopulationRef,
    gridVersion: gridVersionRef,
    roadAnalysisCache: roadAnalysisCacheRef,
    roadAnalysisCacheVersion: roadAnalysisCacheVersionRef,
  };

  const hoverRefs: HoverRefs = {
    hoveredTile: hoveredTileRef,
  };

  const interactionRefs: InteractionRefs = {
    panCandidate: panCandidateRef,
    keysPressed: keysPressedRef,
    placedRoadTiles: placedRoadTilesRef,
    touchStart: touchStartRef,
    initialPinchDistance: initialPinchDistanceRef,
    initialZoom: initialZoomRef,
    lastTouchCenter: lastTouchCenterRef,
  };

  const worldState: WorldStateRef = {
    worldState: worldStateRef,
  };

  return {
    // Canvas refs
    canvases,

    // Entity system refs
    entityRefs,

    // Viewport state and refs
    offset,
    setOffset,
    zoom,
    setZoom,
    viewportRefs,

    // Interaction state
    isDragging,
    setIsDragging,
    isPanning,
    setIsPanning,
    dragStart,
    setDragStart,
    dragStartTile,
    setDragStartTile,
    dragEndTile,
    setDragEndTile,
    roadDrawDirection,
    setRoadDrawDirection,
    interactionRefs,

    // Hover state
    hoveredTile,
    setHoveredTile,
    hoveredIncident,
    setHoveredIncident,
    hoverRefs,

    // Performance refs
    performanceRefs,

    // World state ref
    worldState,

    // Canvas size
    canvasSize,
    setCanvasSize,

    // Image loading
    imagesLoaded,
    setImagesLoaded,
    imageLoadVersion,
    setImageLoadVersion,

    // City connection dialog
    cityConnectionDialog,
    setCityConnectionDialog,
  };
}
