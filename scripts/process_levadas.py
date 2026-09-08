#!/usr/bin/env python3
"""
Extract free (non-pass) levada walks from the OSM extract.

There is no official list of levadas -- IFCN only publishes the numbered PR
routes -- so "levada" has to be inferred from OSM. The rules below come from
surveying every levada-named object in data/madeira.pbf; the counts in
docstrings are from that survey and are what the thresholds were chosen
against.

What gets excluded, and why:

  the channel, not the path   2,472 ways are waterway=drain/ditch/stream named
                              levada. 2,325 of them are tagged width=0.5 -- a
                              50 cm water conduit. OSM Madeira maps the channel
                              and its towpath as separate objects (no way
                              carries both a highway and a waterway tag), so
                              dropping these loses nothing walkable.

  roads named levada          197 ways are highway=residential/tertiary/
                              service/track/unclassified. Driving surfaces.

  unsafe or shut              122 segments carry access=no, foot=no/private,
                              disused, an abandoned:/disused:/construction:
                              prefix, SAC grade T4+, trail_visibility=bad, a
                              hazard tag, or free text saying the path is
                              closed or not walkable. This catches, among
                              others, most of Levada do Caldeirao do Inferno
                              and a Levada do Norte water tunnel whose
                              description reads "DO NOT ATTEMPT".

  already paid                226 segments lie inside an existing PR route.
                              Levada do Caldeirao Verde, Levada do Furado and
                              Levada das 25 Fontes all have paid and free
                              stretches, so this has to be geometric -- a name
                              match would either delete real free path or, far
                              worse, publish paid path as free.

  fragments                   levadas totalling under MIN_LEVADA_M, which are
                              connectors and mis-named slivers rather than
                              walks.

Requires ogr2ogr (GDAL) on PATH and shapely -- see requirements-levadas.txt.
This is a manual, occasional job: data/madeira.pbf is committed and nothing
regenerates it. Refresh instructions are in scripts/README.md.

Usage: python3 scripts/process_levadas.py
"""

import json
import math
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

from shapely.geometry import LineString, MultiLineString, mapping, shape
from shapely.ops import linemerge, unary_union

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PBF = PROJECT_ROOT / 'data' / 'madeira.pbf'
PAID = PROJECT_ROOT / 'public' / 'data' / 'paid_routes.geojson'
OUTPUT_FILE = PROJECT_ROOT / 'public' / 'data' / 'levadas.geojson'

# A levada walk is a footpath. Roads and water channels are not.
FOOT_HIGHWAYS = {'path', 'footway', 'steps'}

# Below this total length a name is a fragment, not a walk. 500 m drops 72
# names worth 13.8 km combined and keeps every levada that an OSM hiking
# relation corroborates.
MIN_LEVADA_M = 500

# A segment this far inside the paid network is part of a PR route.
PAID_BUFFER_M = 20
PAID_OVERLAP_FRACTION = 0.8

# SAC grades we refuse to route people onto. T4 (alpine_hiking) is where
# alpine experience starts being required; T3 is still ordinary hiking.
UNSAFE_SAC = {'alpine_hiking', 'demanding_alpine_hiking'}

UNSAFE_TEXT = re.compile(
    r'do not attempt|not walkable|closed|dangerous|perigo|collapse|landslide|derrocada',
    re.IGNORECASE)

LEVADA_NAME = re.compile(r'levada', re.IGNORECASE)
NAME_KEYS = ('name', 'name:pt', 'alt_name', 'official_name')

# Madeira + Porto Santo + Desertas. The upstream extract is not clipped tightly
# -- madeira-latest.osm.pbf reaches the Algarve -- and "levada" is an ordinary
# Portuguese word, so a mainland path could otherwise land on the map. No such
# path exists today; this is a guard, not a fix.
LON_MIN, LON_MAX = -17.35, -16.20
LAT_MIN, LAT_MAX = 32.30, 33.20

# Madeira sits near 32.75N; good enough to do lengths and buffers in metres.
LAT0 = 32.75
M_PER_DEG_LON = 111320 * math.cos(math.radians(LAT0))
M_PER_DEG_LAT = 110540


def run_ogr(layer, dest):
    """Dump one OSM layer to newline-delimited GeoJSON."""
    subprocess.run(
        ['ogr2ogr', '-f', 'GeoJSONSeq', str(dest), str(PBF), layer],
        check=True, capture_output=True)
    features = []
    for line in open(dest, encoding='utf-8'):
        line = line.strip().rstrip(',')
        if line:
            try:
                features.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return features


def parse_other_tags(value):
    """GDAL packs tags it doesn't promote to columns into an hstore string."""
    tags = {}
    if not value:
        return tags
    for m in re.finditer(r'"([^"]+)"=>"((?:[^"\\]|\\.)*)"', value):
        tags[m.group(1)] = m.group(2).replace('\\"', '"')
    return tags


def tags_of(feature):
    props = dict(feature.get('properties') or {})
    tags = parse_other_tags(props.pop('other_tags', None))
    for key, value in props.items():
        if value is not None:
            tags[key] = value
    return tags


def in_madeira(geometry):
    """True when the geometry starts inside the archipelago bounding box."""
    coords = geometry.get('coordinates') or []
    if geometry.get('type') == 'MultiLineString':
        coords = coords[0] if coords else []
    if not coords:
        return False
    lon, lat = coords[0][0], coords[0][1]
    return LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX


def levada_name(tags):
    for key in NAME_KEYS:
        value = tags.get(key)
        if value and LEVADA_NAME.search(value):
            return value
    return None


def unsafe_reason(tags):
    """Why this segment must not be shown, or None."""
    if tags.get('access') in ('no', 'private'):
        return f"access={tags['access']}"
    if tags.get('foot') in ('no', 'private'):
        return f"foot={tags['foot']}"
    if tags.get('disused') == 'yes':
        return 'disused=yes'
    for key in tags:
        if key.startswith(('abandoned:', 'disused:', 'construction:')):
            return key
    if tags.get('sac_scale') in UNSAFE_SAC:
        return f"sac_scale={tags['sac_scale']}"
    if tags.get('trail_visibility') in ('bad', 'horrible', 'no'):
        return f"trail_visibility={tags['trail_visibility']}"
    if tags.get('hazard'):
        return f"hazard={tags['hazard']}"
    for key in ('description', 'note', 'fixme'):
        value = tags.get(key)
        if value and UNSAFE_TEXT.search(value):
            return f'{key}: {value[:60]}'
    return None


def to_metres(geometry):
    """Project lon/lat to a local metre grid so lengths and buffers make sense."""
    def convert(coords):
        return [(x * M_PER_DEG_LON, y * M_PER_DEG_LAT) for x, y in coords]

    geom = shape(geometry)
    if geom.geom_type == 'LineString':
        return LineString(convert(geom.coords))
    if geom.geom_type == 'MultiLineString':
        return MultiLineString([convert(p.coords) for p in geom.geoms])
    return None


def to_degrees(geom):
    """
    Back to lon/lat, rounded to 6 dp (~11 cm) to keep the payload small.

    Rounding can collapse a sub-decimetre stub to a single repeated point,
    which makes the MultiLineString invalid ("too few points in geometry
    component"), so drop consecutive duplicates and discard any part that
    no longer has two distinct points.
    """
    def convert(coords):
        rounded = [(round(x / M_PER_DEG_LON, 6), round(y / M_PER_DEG_LAT, 6))
                   for x, y in coords]
        deduped = [p for i, p in enumerate(rounded)
                   if i == 0 or p != rounded[i - 1]]
        return deduped if len(deduped) >= 2 else None

    parts = ([convert(geom.coords)] if geom.geom_type == 'LineString'
             else [convert(p.coords) for p in geom.geoms])
    parts = [p for p in parts if p]
    return MultiLineString(parts) if parts else None


def main():
    if not PBF.exists():
        print(f'Missing {PBF}. See scripts/README.md for how to refresh it.')
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        print(f'Reading {PBF.name}...')
        ways = run_ogr('lines', Path(tmp) / 'lines.geojsonl')
    print(f'  {len(ways)} ways in the extract')

    # 1. levada-named footpaths
    candidates = []
    skipped = defaultdict(int)
    for feature in ways:
        tags = tags_of(feature)
        name = levada_name(tags)
        if not name:
            continue
        highway = tags.get('highway')
        if highway not in FOOT_HIGHWAYS:
            skipped['waterway' if tags.get('waterway') else 'not a footpath'] += 1
            continue
        if not in_madeira(feature['geometry']):
            skipped['outside the archipelago'] += 1
            continue
        reason = unsafe_reason(tags)
        if reason:
            skipped[f'unsafe/shut ({reason.split(":")[0]})'] += 1
            continue
        geom = to_metres(feature['geometry'])
        if geom and geom.length > 0:
            candidates.append((name, tags, geom))

    print(f'\n  levada-named footpaths kept: {len(candidates)} '
          f'({sum(g.length for _, _, g in candidates) / 1000:.1f} km)')
    for reason, count in sorted(skipped.items(), key=lambda kv: -kv[1]):
        print(f'    excluded {count:5}  {reason}')

    # 2. subtract anything already covered by a paid PR route
    paid = json.loads(PAID.read_text(encoding='utf-8'))
    paid_geoms = [to_metres(f['geometry']) for f in paid['features']]
    paid_area = unary_union([g.buffer(PAID_BUFFER_M) for g in paid_geoms if g])

    free = []
    overlapping = 0
    for name, tags, geom in candidates:
        if geom.intersection(paid_area).length / geom.length > PAID_OVERLAP_FRACTION:
            overlapping += 1
            continue
        free.append((name, tags, geom))
    print(f'    excluded {overlapping:5}  inside a paid PR route')

    # 3. group by name and drop fragments
    grouped = defaultdict(list)
    for name, tags, geom in free:
        grouped[name].append((tags, geom))

    features = []
    dropped_short = 0
    for name, parts in sorted(grouped.items()):
        total = sum(g.length for _, g in parts)
        if total < MIN_LEVADA_M:
            dropped_short += 1
            continue
        # Stitch touching segments into as few lines as possible. linemerge
        # rejects a lone LineString, which is what a single-way levada gives.
        merged = unary_union([g for _, g in parts])
        if merged.geom_type != 'LineString':
            merged = linemerge(merged)
        if merged.geom_type == 'LineString':
            merged = MultiLineString([merged])
        geometry = to_degrees(merged)
        if geometry is None:
            dropped_short += 1
            continue
        features.append({
            'type': 'Feature',
            'properties': {
                'name': name,
                'length_km': round(total / 1000, 2),
                # Levada tunnels are walkable but need a torch.
                'hasTunnel': any(t.get('tunnel') in ('yes', 'building_passage')
                                 for t, _ in parts),
            },
            'geometry': mapping(geometry),
        })
    print(f'    excluded {dropped_short:5}  under {MIN_LEVADA_M} m total (fragments)')

    collection = {
        'type': 'FeatureCollection',
        'features': sorted(features,
                           key=lambda f: -f['properties']['length_km']),
    }
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(collection, ensure_ascii=False), encoding='utf-8')

    total_km = sum(f['properties']['length_km'] for f in features)
    size_mb = OUTPUT_FILE.stat().st_size / 1e6
    print(f'\nWrote {len(features)} levadas, {total_km:.1f} km '
          f'-> {OUTPUT_FILE} ({size_mb:.2f} MB)')
    print('\nLongest:')
    for f in collection['features'][:10]:
        tunnel = ' [tunnel]' if f['properties']['hasTunnel'] else ''
        print(f"  {f['properties']['length_km']:7.2f} km  "
              f"{f['properties']['name'][:48]}{tunnel}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
