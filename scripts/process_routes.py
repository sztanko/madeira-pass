#!/usr/bin/env python3
"""
Process Madeira hiking routes data.

This script:
1. Reads all routes from data/routes.geojson
2. Filters PR (Percurso Recomendado) routes - all PR routes require payment
3. Merges route segments by reference and island
4. Outputs to public/data/paid_routes.geojson
"""

import json
import re
from pathlib import Path

# File paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
INPUT_FILE = PROJECT_ROOT / "data" / "routes.geojson"
OUTPUT_FILE = PROJECT_ROOT / "public" / "data" / "paid_routes.geojson"


def load_all_routes():
    """Load all routes from the source GeoJSON file."""
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: {INPUT_FILE} not found")
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing GeoJSON: {e}")
        return None


def normalize_ref(ref_string):
    """
    Normalize a PR reference code for matching.

    Examples:
        "PR 8" -> "PR8"
        "PR 6.1" -> "PR6.1"
        "PR8 | Vereda..." -> "PR8"
    """
    if not ref_string:
        return ""

    # Extract PR code (everything before | if present)
    ref_string = ref_string.split('|')[0].strip()

    # Remove spaces between PR and number
    ref_string = re.sub(r'PR\s+', 'PR', ref_string, flags=re.IGNORECASE)

    return ref_string.upper()


def get_island_from_coordinates(geometry):
    """
    Determine which island a route is on based on coordinates.

    Args:
        geometry: GeoJSON geometry

    Returns:
        'Porto Santo' or 'Madeira'
    """
    # Extract first coordinate to determine location
    coords = geometry.get('coordinates', [])

    if geometry['type'] == 'LineString':
        lon = coords[0][0] if coords else -17.0
    elif geometry['type'] == 'MultiLineString':
        lon = coords[0][0][0] if coords and coords[0] else -17.0
    else:
        lon = -17.0

    # Porto Santo is at longitude ~-16.3, Madeira main island is at ~-17.0
    # Use -16.5 as the dividing line
    return 'Porto Santo' if lon > -16.5 else 'Madeira'


def merge_route_segments(features):
    """
    Merge route segments with the same reference into single features.
    Separates routes by island (Madeira vs Porto Santo).

    Args:
        features: List of route features

    Returns:
        List of merged features with combined geometries
    """
    # Group features by normalized ref AND island
    routes_by_ref_and_island = {}

    for feature in features:
        ref = feature['properties'].get('ref', '')
        normalized_ref = normalize_ref(ref)
        island = get_island_from_coordinates(feature['geometry'])

        # Create a key that includes both ref and island
        key = f"{normalized_ref}|{island}"

        if key not in routes_by_ref_and_island:
            routes_by_ref_and_island[key] = []
        routes_by_ref_and_island[key].append(feature)

    merged_features = []

    for key, segments in routes_by_ref_and_island.items():
        ref, island = key.split('|')

        # Find the segment with the most complete properties (has name)
        best_properties = None
        for segment in segments:
            props = segment['properties']
            if props.get('name') and props.get('name') != 'N/A':
                best_properties = props
                break

        # Fallback to first segment if none have names
        if best_properties is None:
            best_properties = segments[0]['properties']

        # Collect all line geometries
        all_coordinates = []
        for segment in segments:
            geom = segment['geometry']
            if geom['type'] == 'LineString':
                all_coordinates.append(geom['coordinates'])
            elif geom['type'] == 'MultiLineString':
                all_coordinates.extend(geom['coordinates'])

        # Create merged feature
        merged_geometry = {
            'type': 'MultiLineString' if len(all_coordinates) > 1 else 'LineString',
            'coordinates': all_coordinates if len(all_coordinates) > 1 else all_coordinates[0]
        }

        # Create unique ID with island suffix for Porto Santo
        route_id = f"{ref}-PS" if island == 'Porto Santo' else ref

        # Add island info to name if Porto Santo
        route_name = best_properties.get('name', 'N/A')
        if island == 'Porto Santo' and route_name != 'N/A':
            route_name = f"{route_name} (Porto Santo)"

        merged_feature = {
            'type': 'Feature',
            'properties': {
                **best_properties,
                'id': route_id,
                'name': route_name,
                'island': island,
                'requiresPayment': True
            },
            'geometry': merged_geometry
        }

        merged_features.append(merged_feature)
        print(f"  ✓ Merged {len(segments)} segment(s) for {route_id} ({island}): {route_name}")

    return merged_features


def filter_paid_routes(all_routes):
    """
    Filter routes that require payment.
    All PR (Percurso Recomendado) routes in Madeira require payment.

    Args:
        all_routes: GeoJSON FeatureCollection with all routes

    Returns:
        GeoJSON FeatureCollection with only paid routes
    """
    print("\nFiltering PR routes...")

    pr_features = []
    pr_refs = set()

    # Filter routes from GeoJSON
    for feature in all_routes.get('features', []):
        properties = feature.get('properties', {})
        geometry_type = feature.get('geometry', {}).get('type', '')

        # Only consider LineString and MultiLineString geometries
        if geometry_type not in ['LineString', 'MultiLineString']:
            continue

        # Get the ref field
        ref = properties.get('ref', '')

        # Check if it's a PR route (starts with "PR")
        if ref and ref.upper().startswith('PR'):
            normalized_ref = normalize_ref(ref)
            pr_features.append(feature)
            pr_refs.add(normalized_ref)

    print(f"Found {len(pr_features)} PR route segments ({len(pr_refs)} unique refs)")

    print(f"\nMerging route segments...")
    merged_features = merge_route_segments(pr_features)

    return {
        "type": "FeatureCollection",
        "features": merged_features
    }


def save_paid_routes(paid_routes):
    """Save filtered routes to output file."""
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(paid_routes, f, indent=2, ensure_ascii=False)

    print(f"Processed {len(paid_routes['features'])} paid routes")
    print(f"Output saved to {OUTPUT_FILE}")


def main():
    """Main processing function."""
    print(f"Loading all routes from {INPUT_FILE}...")
    all_routes = load_all_routes()

    if all_routes is None:
        return

    print("Processing PR routes (all PR routes require payment)...")
    paid_routes = filter_paid_routes(all_routes)

    print("\nSaving processed routes...")
    save_paid_routes(paid_routes)

    print("\nDone!")


if __name__ == "__main__":
    main()
