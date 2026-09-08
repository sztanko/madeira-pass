# Scripts

This directory contains Python scripts for processing route data.

## process_routes.py

This script will:
1. Read route data from `data/routes.geojson`
2. Fetch the list of routes requiring payment from the Madeira API (https://simplifica.madeira.gov.pt)
3. Match routes based on PR reference codes (e.g., PR8, PR6.1)
4. Filter to only LineString and MultiLineString geometries
5. Output processed data to `public/data/paid_routes.geojson`

### Matching Logic

The script uses the following heuristics:
- Normalizes PR codes by removing spaces (e.g., "PR 8" → "PR8")
- Matches routes where the `ref` field in GeoJSON matches the PR code from the API
- Only includes routes starting with "PR" prefix
- Only includes LineString and MultiLineString geometries

### Usage

**Option 1: Using the convenience script (recommended)**

```bash
./run.sh
```

**Option 2: Manual setup**

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the script
python process_routes.py
```

### Requirements

- Python 3.8+
- requests
- urllib3

### Output

The script will create `public/data/paid_routes.geojson` with the following structure:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "PR8",
        "name": "PR 8 - Vereda da Ponta de São Lourenço",
        "requiresPayment": true,
        ...
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [...]
      }
    }
  ]
}
```

### Notes

- The script handles SSL certificate issues with the Madeira government portal
- Some routes from the API may not be found in the GeoJSON if they're not yet mapped in OpenStreetMap
- The script reports any unmatched routes at the end

## fetch_route_status.py

Scrapes the IFCN route-status page and writes `public/data/route_status.json`.
Run nightly by `.github/workflows/update-route-status.yml`.

Classification lives in `route_status_parse.py`; `test_route_status_parse.py`
holds the fixtures.

### Why the classifier is not just a keyword match

IFCN writes each status as a headline word followed by an optional free-text
caveat, and the headline alone is not reliable — the same physical closure has
been published all three of these ways:

```
ABERTOPercurso transitável desde o Pico do Areeiro até ao Miradouro ... km 1,2
PARCIALMENTE ABERTO(Transitável desde o Pico do Areeiro até ao Miradouro ... km 1,2)
ENCERRADO(Transitável entre a Encumeada Folhadal – Caramujo - Bica da Cana)
```

So the parser reads the headline, then lets the caveat override it: a caveat
naming a closed stretch (`encerrado`, `fechado`) or naming the only walkable
stretch (`transitável entre/desde/até`) means `partially_open`, whatever the
headline said. Direction rules (`sentido único`, `circulação controlada`) are
not closures and leave the status alone.

### Statuses

| Status | IFCN wording | Meaning |
|---|---|---|
| `open` | `ABERTO` | Fully walkable |
| `partially_open` | `PARCIALMENTE ABERTO`, `PARCIALMENTE TRANSITÁVEL`, or any headline with a closure caveat | Part of the route is shut |
| `closed` | `ENCERRADO` | Shut |
| `conditional` | `CONDICIONADO` | Walkable, but restricted — read `status_text` |
| `unknown` | anything else | We did not recognise it. Not a safe default. |

### When the nightly job fails with "unrecognised status"

IFCN used wording we have never seen. Nothing is broken and the other routes
did update — the job fails on purpose so the new wording gets a human rather
than a guess.

1. The failing step's log names the route and prints the exact string.
2. Add it to `CASES` in `test_route_status_parse.py` with the status it should
   map to.
3. Adjust the rules in `route_status_parse.py` until `python3
   scripts/test_route_status_parse.py` passes.

The fixtures in `CASES` are every distinct string IFCN published between
2025-10-20 and 2026-09-07 (13,440 readings across 320 commits), recovered from
the git history of `route_status.json`. Keep them; they are the regression net.

### Usage

```bash
python3 scripts/test_route_status_parse.py   # no network needed
python3 scripts/fetch_route_status.py        # exits 2 on unrecognised status
```

## process_levadas.py

Extracts free levada walks from `data/madeira.pbf` into
`public/data/levadas.geojson` — the separate, non-payable layer on the map.

```bash
pip install -r requirements-levadas.txt   # shapely; also needs ogr2ogr on PATH
python3 scripts/process_levadas.py
```

### What counts as a levada

There is no official list — IFCN publishes only the numbered PR routes — so it
is inferred from OSM. 3,776 ways in Madeira carry "levada" in a name, and they
split cleanly:

| | count | kept? |
|---|---|---|
| `waterway=drain/ditch/stream` | 2,472 | no — the channel, not a path |
| `highway=path/footway/steps` | 1,086 | **yes** — the walkable towpath |
| `highway=residential/tertiary/service/track` | 197 | no — roads named levada |
| `man_made=pipeline` etc. | 21 | no |

The channels are not a judgement call: 2,325 of them are tagged `width=0.5`, a
50 cm water conduit, and no way in the extract carries both a `highway` and a
`waterway` tag — OSM Madeira maps the channel and its towpath as separate
objects. Dropping them loses nothing walkable.

### What is filtered out, and why

- **Unsafe or shut** (122 segments): `access=no|private`, `foot=no|private`,
  `disused=yes`, an `abandoned:`/`disused:`/`construction:` prefix, SAC grade
  T4+ (`alpine_hiking`, `demanding_alpine_hiking`), `trail_visibility=bad`, a
  `hazard` tag, or free text matching closed/dangerous/not-walkable. This
  catches most of Levada do Caldeirão do Inferno and a Levada do Norte water
  tunnel whose description reads *"DO NOT ATTEMPT"*.
- **Already paid** (226 segments): anything >80% within 20 m of a PR route.
  This has to be geometric. Levada do Caldeirão Verde, Levada do Furado and
  Levada das 25 Fontes each have both paid and free stretches, so a name match
  would either delete real free path or — much worse — publish paid path as
  free.
- **Fragments**: levadas under `MIN_LEVADA_M` (500 m) in total. Drops 75 names
  worth 13.8 km, and keeps every levada an OSM hiking relation corroborates.

Result: **66 levadas, 300.6 km, 0.55 MB.**

### Known limitation

IFCN publishes closure status for PR routes only. **There is no status feed for
free levadas**, so the only closure signal is OSM tagging, which is
volunteer-maintained and can be stale. The map popup says so; don't present
these as officially verified open.

### Refreshing the OSM extract

`data/madeira.pbf` is committed and nothing regenerates it — there is no
scheduled job, and `data/query.overpass` is not wired to any script. Levada
geometry barely changes, so refresh by hand when you want to: download a new
Madeira extract over `data/madeira.pbf`, re-run this script, and commit both.
