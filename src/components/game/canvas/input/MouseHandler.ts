import React from 'react';
import { Tile, Tool } from '@/types/game';
import { screenToGrid } from '@/components/game/utils';
import { clampOffset } from './ViewportController';
import { CrimeType } from '@/components/game/incidentData';

const PAN_DRAG_THRESHOLD = 6;

/**
 * Configuration for mouse handlers
 */
export interface MouseHandlerConfig {
  containerRef: React.RefObject<HTMLDivElement | null>;
  gridSize: number;
  grid: Tile[][];
  canvasSize: { width: number; height: number };
  selectedTool: Tool;
  showsDragGrid: boolean;
  supportsDragPlace: boolean;
}

/**
 * Mouse state managed by the handlers
 */
export interface MouseState {
  offset: { x: number; y: number };
  zoom: number;
  isPanning: boolean;
  dragStart: { x: number; y: number };
  isDragging: boolean;
  dragStartTile: { x: number; y: number } | null;
  dragEndTile: { x: number; y: number } | null;
  roadDrawDirection: 'h' | 'v' | null;
}

/**
 * Callbacks for mouse handler state updates
 */
export interface MouseHandlerCallbacks {
  setIsPanning: (isPanning: boolean) => void;
  setDragStart: (dragStart: { x: number; y: number }) => void;
  setOffset: (offset: { x: number; y: number }) => void;
  setSelectedTile: (tile: { x: number; y: number } | null) => void;
  setDragStartTile: (tile: { x: number; y: number } | null) => void;
  setDragEndTile: (tile: { x: number; y: number } | null) => void;
  setIsDragging: (isDragging: boolean) => void;
  setRoadDrawDirection: (direction: 'h' | 'v' | null) => void;
  setHoveredTile: (tile: { x: number; y: number } | null) => void;
  setHoveredIncident: (incident: {
    x: number;
    y: number;
    type: 'fire' | 'crime';
    crimeType?: CrimeType;
    screenX: number;
    screenY: number;
  } | null) => void;
  placeAtTile: (x: number, y: number) => void;
  findBuildingOrigin: (x: number, y: number) => { originX: number; originY: number } | null;
  requestHoverCanvasRedraw: () => void;
  checkAndDiscoverCities: (callback: (discoveredCity: { direction: 'north' | 'south' | 'east' | 'west' }) => void) => void;
  setCityConnectionDialog: (dialog: { direction: 'north' | 'south' | 'east' | 'west' } | null) => void;
}

/**
 * Refs needed for mouse handlers
 */
export interface MouseHandlerRefs {
  panCandidateRef: React.MutableRefObject<{ startX: number; startY: number; gridX: number; gridY: number } | null>;
  hoveredTileRef: React.MutableRefObject<{ x: number; y: number } | null>;
  lastHoverStateUpdateRef: React.MutableRefObject<number>;
  activeCrimeIncidentsRef: React.MutableRefObject<Map<string, { x: number; y: number; type: CrimeType; timeRemaining: number }>>;
  placedRoadTilesRef: React.MutableRefObject<Set<string>>;
  worldStateRef: React.MutableRefObject<{
    offset: { x: number; y: number };
    zoom: number;
    gridSize: number;
    grid: Tile[][];
  }>;
}

/**
 * Create mouse down handler
 */
export function createMouseDownHandler(
  config: MouseHandlerConfig,
  state: MouseState,
  callbacks: MouseHandlerCallbacks,
  refs: MouseHandlerRefs
) {
  return (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      callbacks.setIsPanning(true);
      callbacks.setDragStart({ x: e.clientX - state.offset.x, y: e.clientY - state.offset.y });
      refs.panCandidateRef.current = null;
      // Clear hover when panning starts
      refs.hoveredTileRef.current = null;
      callbacks.setHoveredTile(null);
      callbacks.setHoveredIncident(null);
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      const rect = config.containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = (e.clientX - rect.left) / state.zoom;
        const mouseY = (e.clientY - rect.top) / state.zoom;
        const { gridX, gridY } = screenToGrid(mouseX, mouseY, state.offset.x / state.zoom, state.offset.y / state.zoom);

        const isInsideGrid = gridX >= 0 && gridX < config.gridSize && gridY >= 0 && gridY < config.gridSize;
        if (!isInsideGrid) {
          callbacks.setIsPanning(true);
          callbacks.setDragStart({ x: e.clientX - state.offset.x, y: e.clientY - state.offset.y });
          refs.panCandidateRef.current = null;
          // Clear hover when panning starts
          refs.hoveredTileRef.current = null;
          callbacks.setHoveredTile(null);
          callbacks.setHoveredIncident(null);
          return;
        }

        if (config.selectedTool === 'select') {
          const tile = config.grid[gridY]?.[gridX];
          const isOpenTile = tile?.building.type === 'empty' ||
            tile?.building.type === 'grass' ||
            tile?.building.type === 'water';
          if (isOpenTile) {
            refs.panCandidateRef.current = { startX: e.clientX, startY: e.clientY, gridX, gridY };
            return;
          }
          refs.panCandidateRef.current = null;
          // For multi-tile buildings, select the origin tile
          const origin = callbacks.findBuildingOrigin(gridX, gridY);
          if (origin) {
            callbacks.setSelectedTile({ x: origin.originX, y: origin.originY });
          } else {
            callbacks.setSelectedTile({ x: gridX, y: gridY });
          }
        } else if (config.showsDragGrid) {
          refs.panCandidateRef.current = null;
          // Start drag rectangle selection for zoning tools
          callbacks.setDragStartTile({ x: gridX, y: gridY });
          callbacks.setDragEndTile({ x: gridX, y: gridY });
          callbacks.setIsDragging(true);
        } else if (config.supportsDragPlace) {
          refs.panCandidateRef.current = null;
          // For roads, bulldoze, and other tools, start drag-to-place
          callbacks.setDragStartTile({ x: gridX, y: gridY });
          callbacks.setDragEndTile({ x: gridX, y: gridY });
          callbacks.setIsDragging(true);
          // Reset road drawing state for new drag
          callbacks.setRoadDrawDirection(null);
          refs.placedRoadTilesRef.current.clear();
          // Place immediately on first click
          callbacks.placeAtTile(gridX, gridY);
          // Track initial tile for roads, rail, and subways
          if (config.selectedTool === 'road' || config.selectedTool === 'rail' || config.selectedTool === 'subway') {
            refs.placedRoadTilesRef.current.add(`${gridX},${gridY}`);
          }
        }
      }
    }
  };
}

/**
 * Create mouse move handler
 */
export function createMouseMoveHandler(
  config: MouseHandlerConfig,
  state: MouseState,
  callbacks: MouseHandlerCallbacks,
  refs: MouseHandlerRefs
) {
  return (e: React.MouseEvent) => {
    // PERF: Read from worldStateRef to reduce callback dependencies
    const { offset: currentOffset, zoom: currentZoom, gridSize: currentGridSize, grid: currentGrid } = refs.worldStateRef.current;

    if (!state.isPanning && refs.panCandidateRef.current) {
      const { startX, startY } = refs.panCandidateRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) >= PAN_DRAG_THRESHOLD || Math.abs(dy) >= PAN_DRAG_THRESHOLD) {
        callbacks.setIsPanning(true);
        callbacks.setDragStart({ x: startX - currentOffset.x, y: startY - currentOffset.y });
        refs.panCandidateRef.current = null;
        // Clear hover when panning starts
        refs.hoveredTileRef.current = null;
        callbacks.setHoveredTile(null);
        callbacks.setHoveredIncident(null);
        const newOffset = {
          x: e.clientX - (startX - currentOffset.x),
          y: e.clientY - (startY - currentOffset.y),
        };
        callbacks.setOffset(
          clampOffset(newOffset, currentZoom, config.gridSize, config.canvasSize.width, config.canvasSize.height)
        );
        return;
      }
    }

    // While panning, don't track hover at all
    if (state.isPanning) {
      const newOffset = {
        x: e.clientX - state.dragStart.x,
        y: e.clientY - state.dragStart.y,
      };
      callbacks.setOffset(
        clampOffset(newOffset, currentZoom, config.gridSize, config.canvasSize.width, config.canvasSize.height)
      );
      return;
    }

    const rect = config.containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = (e.clientX - rect.left) / currentZoom;
      const mouseY = (e.clientY - rect.top) / currentZoom;
      const { gridX, gridY } = screenToGrid(mouseX, mouseY, currentOffset.x / currentZoom, currentOffset.y / currentZoom);

      if (gridX >= 0 && gridX < currentGridSize && gridY >= 0 && gridY < currentGridSize) {
        // PERF: Update ref directly to avoid React re-renders, then request canvas redraw
        const prevHover = refs.hoveredTileRef.current;
        if (!prevHover || prevHover.x !== gridX || prevHover.y !== gridY) {
          refs.hoveredTileRef.current = { x: gridX, y: gridY };
          callbacks.requestHoverCanvasRedraw();

          // Throttle state updates for tooltip display (only update every 100ms)
          const now = performance.now();
          if (now - refs.lastHoverStateUpdateRef.current > 100) {
            refs.lastHoverStateUpdateRef.current = now;
            callbacks.setHoveredTile({ x: gridX, y: gridY });
          }
        }

        // Check for fire or crime incidents at this tile for tooltip display
        const tile = currentGrid[gridY]?.[gridX];
        const crimeKey = `${gridX},${gridY}`;
        const crimeIncident = refs.activeCrimeIncidentsRef.current.get(crimeKey);

        if (tile?.building.onFire) {
          // Fire incident
          callbacks.setHoveredIncident({
            x: gridX,
            y: gridY,
            type: 'fire',
            screenX: e.clientX,
            screenY: e.clientY,
          });
        } else if (crimeIncident) {
          // Crime incident
          callbacks.setHoveredIncident({
            x: gridX,
            y: gridY,
            type: 'crime',
            crimeType: crimeIncident.type,
            screenX: e.clientX,
            screenY: e.clientY,
          });
        } else {
          // No incident at this tile
          callbacks.setHoveredIncident(null);
        }

        // Update drag rectangle end point for zoning tools
        if (state.isDragging && config.showsDragGrid && state.dragStartTile) {
          callbacks.setDragEndTile({ x: gridX, y: gridY });
        }
        // For roads, rail, and subways, use straight-line snapping
        else if (state.isDragging && (config.selectedTool === 'road' || config.selectedTool === 'rail' || config.selectedTool === 'subway') && state.dragStartTile) {
          const dx = Math.abs(gridX - state.dragStartTile.x);
          const dy = Math.abs(gridY - state.dragStartTile.y);

          // Lock direction after moving at least 1 tile
          let direction = state.roadDrawDirection;
          if (!direction && (dx > 0 || dy > 0)) {
            // Lock to the axis with more movement, or horizontal if equal
            direction = dx >= dy ? 'h' : 'v';
            callbacks.setRoadDrawDirection(direction);
          }

          // Calculate target position along the locked axis
          let targetX = gridX;
          let targetY = gridY;
          if (direction === 'h') {
            targetY = state.dragStartTile.y; // Lock to horizontal
          } else if (direction === 'v') {
            targetX = state.dragStartTile.x; // Lock to vertical
          }

          callbacks.setDragEndTile({ x: targetX, y: targetY });

          // Place all tiles from start to target in a straight line
          const minX = Math.min(state.dragStartTile.x, targetX);
          const maxX = Math.max(state.dragStartTile.x, targetX);
          const minY = Math.min(state.dragStartTile.y, targetY);
          const maxY = Math.max(state.dragStartTile.y, targetY);

          for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
              const key = `${x},${y}`;
              if (!refs.placedRoadTilesRef.current.has(key)) {
                callbacks.placeAtTile(x, y);
                refs.placedRoadTilesRef.current.add(key);
              }
            }
          }
        }
        // For other drag-to-place tools, place continuously
        else if (state.isDragging && config.supportsDragPlace && state.dragStartTile) {
          callbacks.placeAtTile(gridX, gridY);
        }
      }
    }
  };
}

/**
 * Create mouse up handler
 */
export function createMouseUpHandler(
  config: MouseHandlerConfig,
  state: MouseState,
  callbacks: MouseHandlerCallbacks,
  refs: MouseHandlerRefs
) {
  return () => {
    if (refs.panCandidateRef.current && !state.isPanning && config.selectedTool === 'select') {
      const { gridX, gridY } = refs.panCandidateRef.current;
      refs.panCandidateRef.current = null;
      const origin = callbacks.findBuildingOrigin(gridX, gridY);
      if (origin) {
        callbacks.setSelectedTile({ x: origin.originX, y: origin.originY });
      } else {
        callbacks.setSelectedTile({ x: gridX, y: gridY });
      }
    } else {
      refs.panCandidateRef.current = null;
    }
    // Fill the drag rectangle when mouse is released (only for zoning tools)
    if (state.isDragging && state.dragStartTile && state.dragEndTile && config.showsDragGrid) {
      const minX = Math.min(state.dragStartTile.x, state.dragEndTile.x);
      const maxX = Math.max(state.dragStartTile.x, state.dragEndTile.x);
      const minY = Math.min(state.dragStartTile.y, state.dragEndTile.y);
      const maxY = Math.max(state.dragStartTile.y, state.dragEndTile.y);

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          callbacks.placeAtTile(x, y);
        }
      }
    }

    // After placing roads or rail, check if any cities should be discovered
    // This happens after any road/rail placement (drag or click) reaches an edge
    if (state.isDragging && (config.selectedTool === 'road' || config.selectedTool === 'rail')) {
      // Use setTimeout to allow state to update first, then check for discoverable cities
      setTimeout(() => {
        callbacks.checkAndDiscoverCities((discoveredCity) => {
          // Show dialog for the newly discovered city
          callbacks.setCityConnectionDialog({ direction: discoveredCity.direction });
        });
      }, 50);
    }

    // Clear drag state
    callbacks.setIsDragging(false);
    callbacks.setDragStartTile(null);
    callbacks.setDragEndTile(null);
    callbacks.setIsPanning(false);
    callbacks.setRoadDrawDirection(null);
    refs.placedRoadTilesRef.current.clear();

    // Clear hovered tile when mouse leaves
    if (!config.containerRef.current) {
      refs.hoveredTileRef.current = null;
      callbacks.setHoveredTile(null);
      callbacks.requestHoverCanvasRedraw();
    }
  };
}
