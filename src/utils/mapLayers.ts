// Layer stacking and the levada visibility toggle.
//
// Kept free of maplibre imports and typed structurally, so the ordering rule
// can be tested against a fake map without a browser -- see
// scripts/test_map_layers.ts.

/**
 * Every layer we add, bottom to top.
 *
 * Free levadas must sit under the pass-carrying routes: where a levada and a
 * PR route run along the same ground, the paid colour has to be the one you
 * see, and the paid feature has to be the one a tap finds.
 *
 * Insertion order alone can't guarantee that. The routes and the levadas load
 * from separate fetches into separate effects, so either can be added first,
 * and `beforeId` only positions a layer relative to whatever already exists.
 * Rather than reason about which effect wins, both call enforceLayerOrder()
 * after adding, and the stack is re-asserted.
 */
export const LAYER_STACK = [
  'levadas-hitarea',
  'levadas-layer',
  'routes-layer-hitarea',
  'routes-layer',
] as const;

export const LEVADA_LAYER_IDS = ['levadas-hitarea', 'levadas-layer'] as const;

const LEVADA_VISIBILITY_KEY = 'madeira-pass:show-levadas';

/** The parts of a MapLibre map this module needs. */
export interface OrderableMap {
  getLayer(id: string): unknown;
  moveLayer(id: string, beforeId?: string): void;
}

export interface VisibilityMap {
  getLayer(id: string): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): void;
}

/**
 * Put our layers into LAYER_STACK order, directly beneath `anchorLayerId`.
 *
 * Moving each layer in bottom-to-top order to just before the anchor leaves
 * them stacked in exactly that order. Idempotent, and safe to call when only
 * some of the layers exist yet.
 */
export function enforceLayerOrder(map: OrderableMap, anchorLayerId: string): void {
  // A style without the anchor is fine: moveLayer with no beforeId moves to
  // the top, and iterating bottom-to-top still yields the same relative order.
  const anchor = map.getLayer(anchorLayerId) ? anchorLayerId : undefined;
  for (const id of LAYER_STACK) {
    if (map.getLayer(id)) {
      map.moveLayer(id, anchor);
    }
  }
}

/** Whether the levada layer should be shown. Defaults to on. */
export function getLevadasVisible(): boolean {
  try {
    return localStorage.getItem(LEVADA_VISIBILITY_KEY) !== 'false';
  } catch {
    // Private mode, or a browser blocking site data.
    return true;
  }
}

export function storeLevadasVisible(visible: boolean): void {
  try {
    localStorage.setItem(LEVADA_VISIBILITY_KEY, String(visible));
  } catch {
    // Preference just won't persist; the toggle still works this session.
  }
}

/**
 * Show or hide the levada layers.
 *
 * Hiding also takes them out of queryRenderedFeatures, so a hidden levada
 * can't be tapped -- no popup for a line you can't see.
 */
export function applyLevadaVisibility(map: VisibilityMap, visible: boolean): void {
  for (const id of LEVADA_LAYER_IDS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }
}
