#!/usr/bin/env python3
"""
Check public/data/levadas.geojson against the properties that must hold.

Run this after every process_levadas.py run, and especially after refreshing
data/madeira.pbf -- OSM retagging can silently change what qualifies. It did
between the 2025 and 2026-09 extracts: the whole Caldeirao do Inferno / Pico
Ruivo network moved from access=no to access=permissive + foot=yes, which
legitimately added six levadas to the layer.

The checks are stated as rules, not as lists of expected names, so that they
keep meaning something when the upstream data moves.

Usage: python3 scripts/verify_levadas.py
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).parent))

from process_levadas import (  # noqa: E402
    FOOT_HIGHWAYS, MIN_LEVADA_M, OUTPUT_FILE, PAID, PAID_BUFFER_M,
    donated_name, in_madeira, levada_name, load_name_donor_relations, run_ogr,
    tags_of, to_metres, unsafe_reason,
)
from shapely.strtree import STRtree  # noqa: E402

failures = []


def check(name, ok, detail=''):
    print(f'  {"PASS" if ok else "FAIL"}  {name}{"  " + detail if detail else ""}')
    if not ok:
        failures.append(name)


def main():
    published = json.loads(OUTPUT_FILE.read_text(encoding='utf-8'))
    features = published['features']
    print(f'{OUTPUT_FILE.name}: {len(features)} levadas, '
          f'{sum(f["properties"]["length_km"] for f in features):.1f} km\n')

    # --- structure -------------------------------------------------------
    allowed_props = {'name', 'length_km', 'hasTunnel'}
    check('every feature has exactly the expected properties',
          all(set(f['properties']) == allowed_props for f in features))
    check('no feature carries a payment-related property',
          not any(k in f['properties']
                  for f in features
                  for k in ('requiresPayment', 'id', 'charge', 'fee')))
    check('every name contains "levada"',
          all('levada' in f['properties']['name'].lower() for f in features))
    check('every geometry is a valid MultiLineString',
          all(f['geometry']['type'] == 'MultiLineString'
              and shape(f['geometry']).is_valid
              and not shape(f['geometry']).is_empty
              for f in features))
    check(f'every levada is at least {MIN_LEVADA_M} m',
          all(f['properties']['length_km'] * 1000 >= MIN_LEVADA_M
              for f in features))

    published_area = unary_union(
        [to_metres(f['geometry']).buffer(5) for f in features])

    # --- the safety property: nothing published may be a paid route ------
    paid = json.loads(PAID.read_text(encoding='utf-8'))
    paid_area = unary_union([to_metres(f['geometry']).buffer(PAID_BUFFER_M)
                             for f in paid['features']
                             if to_metres(f['geometry'])])
    # The paid corridor is cut out of the levada geometry exactly, so this
    # should be ~0 rather than merely under a threshold. The small allowance
    # absorbs the buffer's own rounding at the cut ends.
    worst_name, worst_frac = None, 0.0
    for f in features:
        g = to_metres(f['geometry'])
        frac = g.intersection(paid_area).length / g.length
        if frac > worst_frac:
            worst_name, worst_frac = f['properties']['name'], frac
    check('no levada overlaps a paid PR route', worst_frac < 0.02,
          f'(worst: {worst_name} at {worst_frac:.2%})')

    # --- no excluded source segment survived into the output -------------
    # Re-derive what process_levadas.py rejected and confirm none of it is on
    # the map. This is the check that would catch a filter regression, and it
    # does not care what any particular path is called.
    with tempfile.TemporaryDirectory() as tmp:
        ways = run_ogr('lines', Path(tmp) / 'lines.geojsonl')

    # Mirror the extractor: a way qualifies by its own levada name OR by
    # running inside a levada-named relation. Both routes have to be checked,
    # or an unsafe relation member could slip through unexamined.
    donors = load_name_donor_relations()
    donor_index = STRtree([corridor for _, corridor in donors])

    rejected = []
    for feature in ways:
        tags = tags_of(feature)
        if tags.get('highway') not in FOOT_HIGHWAYS:
            continue
        if not in_madeira(feature['geometry']):
            continue
        reason = unsafe_reason(tags)
        if not reason:
            continue
        geom = to_metres(feature['geometry'])
        if not geom or geom.length <= 0:
            continue
        name = levada_name(tags) or donated_name(geom, donors, donor_index)
        if name:
            rejected.append((name, reason, geom))

    # Ways shorter than this can't be judged at a 5 m matching tolerance: a 2 m
    # stub beside an accepted path reads as "fully covered" no matter what.
    # They are junction fragments, not walkable sections, so they are not
    # evidence of a leak. Anything of real length is.
    MEANINGFUL_M = 25
    checkable = [r for r in rejected if r[2].length >= MEANINGFUL_M]
    stubs = len(rejected) - len(checkable)

    leaked = []
    for name, reason, geom in checkable:
        if geom.intersection(published_area).length / geom.length > 0.5:
            leaked.append(f'{name} ({reason}, {geom.length:.0f} m)')
    check(f'none of the {len(checkable)} unsafe/shut segments over '
          f'{MEANINGFUL_M} m reached the map',
          not leaked,
          f'leaked: {leaked[:3]}' if leaked else f'({stubs} sub-{MEANINGFUL_M} m '
          f'stubs not checkable at this tolerance)')

    # --- everything published is inside the archipelago ------------------
    check('every levada is inside the Madeira bounding box',
          all(in_madeira(f['geometry']) for f in features))

    print()
    if failures:
        print(f'{len(failures)} check(s) FAILED')
        return 1
    print('all checks passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
