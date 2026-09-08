/**
 * Tests for the map layer stacking rule.
 *
 * The property under test is the one that matters on the ground: free levadas
 * must end up UNDER the pass-carrying PR routes, no matter which of the two
 * fetches lands first.
 *
 * FakeMap models MapLibre's documented behaviour -- addLayer(layer, beforeId)
 * inserts immediately before beforeId (so the new layer draws beneath it), and
 * moveLayer(id, beforeId) removes and reinserts at that position; with no
 * beforeId both go on top.
 *
 * Run: npm run test:layers
 */

import {
  LAYER_STACK,
  applyLevadaVisibility,
  enforceLayerOrder,
} from '../src/utils/mapLayers.ts';

const ANCHOR = 'waterway_line_label';

class FakeMap {
  layers: string[];
  visibility: Record<string, string> = {};

  constructor(styleLayers: string[]) {
    this.layers = [...styleLayers];
  }

  getLayer(id: string) {
    return this.layers.includes(id) ? { id } : undefined;
  }

  addLayer(id: string, beforeId?: string) {
    const at = beforeId ? this.layers.indexOf(beforeId) : -1;
    if (at === -1) this.layers.push(id);
    else this.layers.splice(at, 0, id);
  }

  moveLayer(id: string, beforeId?: string) {
    const from = this.layers.indexOf(id);
    if (from === -1) return;
    this.layers.splice(from, 1);
    const at = beforeId ? this.layers.indexOf(beforeId) : -1;
    if (at === -1) this.layers.push(id);
    else this.layers.splice(at, 0, id);
  }

  setLayoutProperty(layerId: string, name: string, value: unknown) {
    if (!this.getLayer(layerId)) throw new Error(`no such layer: ${layerId}`);
    if (name === 'visibility') this.visibility[layerId] = String(value);
  }

  /** Index in draw order; higher means drawn on top. */
  depth(id: string) {
    return this.layers.indexOf(id);
  }
}

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
}

function addLevadas(map: FakeMap) {
  const before = map.getLayer('routes-layer-hitarea')
    ? 'routes-layer-hitarea'
    : map.getLayer(ANCHOR) ? ANCHOR : undefined;
  map.addLayer('levadas-hitarea', before);
  map.addLayer('levadas-layer', before);
  enforceLayerOrder(map, ANCHOR);
}

function addRoutes(map: FakeMap) {
  const before = map.getLayer(ANCHOR) ? ANCHOR : undefined;
  map.addLayer('routes-layer-hitarea', before);
  map.addLayer('routes-layer', before);
  enforceLayerOrder(map, ANCHOR);
}

function levadasBelowRoutes(map: FakeMap) {
  return (
    map.depth('levadas-hitarea') < map.depth('routes-layer-hitarea') &&
    map.depth('levadas-layer') < map.depth('routes-layer-hitarea') &&
    map.depth('levadas-layer') < map.depth('routes-layer')
  );
}

const BASEMAP = ['background', 'water', 'highway_path', ANCHOR, 'label_city'];

console.log('layer ordering\n');

// The whole point: order must not depend on which fetch resolves first.
{
  const map = new FakeMap(BASEMAP);
  addLevadas(map);
  addRoutes(map);
  check('levadas load first -> levadas below routes', levadasBelowRoutes(map),
        map.layers.filter(l => !BASEMAP.includes(l)).join(' < '));
}
{
  const map = new FakeMap(BASEMAP);
  addRoutes(map);
  addLevadas(map);
  check('routes load first -> levadas below routes', levadasBelowRoutes(map),
        map.layers.filter(l => !BASEMAP.includes(l)).join(' < '));
}
{
  const map = new FakeMap(BASEMAP);
  addRoutes(map);
  addLevadas(map);
  check('everything stays under the basemap labels',
        map.depth('routes-layer') < map.depth(ANCHOR));
}
{
  // A basemap style without that symbol layer must not break the ordering.
  const map = new FakeMap(['background', 'water']);
  addRoutes(map);
  addLevadas(map);
  check('no anchor layer -> ordering still holds', levadasBelowRoutes(map),
        map.layers.join(' < '));
}
{
  const map = new FakeMap(BASEMAP);
  addLevadas(map);
  check('levadas alone, routes never arrive -> no crash',
        map.depth('levadas-layer') < map.depth(ANCHOR));
}
{
  const map = new FakeMap(BASEMAP);
  addRoutes(map);
  addLevadas(map);
  const before = [...map.layers];
  enforceLayerOrder(map, ANCHOR);
  enforceLayerOrder(map, ANCHOR);
  check('enforceLayerOrder is idempotent',
        JSON.stringify(before) === JSON.stringify(map.layers));
}
{
  const map = new FakeMap(BASEMAP);
  addRoutes(map);
  addLevadas(map);
  const ours = map.layers.filter(l => (LAYER_STACK as readonly string[]).includes(l));
  check('final stack is exactly LAYER_STACK order',
        JSON.stringify(ours) === JSON.stringify([...LAYER_STACK]),
        ours.join(' < '));
}

console.log('\nvisibility toggle\n');

{
  const map = new FakeMap(BASEMAP);
  addRoutes(map);
  addLevadas(map);

  applyLevadaVisibility(map, false);
  check('hiding sets both levada layers to none',
        map.visibility['levadas-hitarea'] === 'none' &&
        map.visibility['levadas-layer'] === 'none');
  check('hiding leaves the PR routes alone',
        map.visibility['routes-layer'] === undefined &&
        map.visibility['routes-layer-hitarea'] === undefined);

  applyLevadaVisibility(map, true);
  check('showing sets both back to visible',
        map.visibility['levadas-hitarea'] === 'visible' &&
        map.visibility['levadas-layer'] === 'visible');
}
{
  // The toggle can be flipped before the levada fetch resolves.
  const map = new FakeMap(BASEMAP);
  let threw = false;
  try {
    applyLevadaVisibility(map, false);
  } catch {
    threw = true;
  }
  check('toggling before the layers exist is a no-op, not a crash', !threw);
}

console.log();
if (failures) {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('all checks passed');
