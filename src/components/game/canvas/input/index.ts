/**
 * Canvas Input Handlers
 *
 * Extracted input handling logic from CanvasIsometricGrid.
 * Provides mouse, touch, and viewport control functionality.
 */

export {
  type ViewportConfig,
  type ViewportState,
  type ViewportCallbacks,
  type ViewportRefs,
  getMapBounds,
  clampOffset,
  createWheelHandler,
} from './ViewportController';

export {
  type MouseHandlerConfig,
  type MouseState,
  type MouseHandlerCallbacks,
  type MouseHandlerRefs,
  createMouseDownHandler,
  createMouseMoveHandler,
  createMouseUpHandler,
} from './MouseHandler';

export {
  type TouchHandlerConfig,
  type TouchState,
  type TouchHandlerCallbacks,
  type TouchHandlerRefs,
  getTouchDistance,
  getTouchCenter,
  createTouchStartHandler,
  createTouchMoveHandler,
  createTouchEndHandler,
} from './TouchHandler';
