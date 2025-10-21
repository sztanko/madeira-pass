#!/usr/bin/env python3
"""
Process Madeira Pass routes data.

This script:
1. Reads all routes from data/routes.geojson
2. Filters PR (Percurso Recomendado) routes
3. Fetches the official list of routes requiring payment from Simplifica
4. Marks routes as requiresPayment: true or false
5. Merges route segments by reference and island
6. Outputs to public/data/paid_routes.geojson
"""

import json
import re
import requests
from pathlib import Path
from bs4 import BeautifulSoup
import urllib3

# Disable SSL warnings for the government website
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# File paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
INPUT_FILE = PROJECT_ROOT / "data" / "routes.geojson"
OUTPUT_FILE = PROJECT_ROOT / "public" / "data" / "paid_routes.geojson"

# Simplifica Payment Portal (lists ONLY routes requiring payment)
SIMPLIFICA_URL = 'https://simplifica.madeira.gov.pt/services/78-82-259'


def fetch_official_paid_routes():
    """
    Fetch the list of official PR routes from Simplifica payment portal.
    Only routes listed on this page require payment.

    Returns:
        Set of route IDs that require payment (e.g., {'PR1', 'PR2', 'PR1-PS'})
    """
    print(f"\nFetching official paid routes from Simplifica payment portal...")
    print(f"URL: {SIMPLIFICA_URL}")

    try:
        response = requests.get(SIMPLIFICA_URL, verify=False, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')

        # Get full text
        text = soup.get_text()

        # Find the section with Madeira routes
        madeira_start = text.find('Ilha da Madeira')

        if madeira_start == -1:
            print("⚠️  Warning: Could not find 'Ilha da Madeira' section")
            return None

        # Find where Porto Santo section starts (or end of relevant content)
        porto_start = text.find('Ilha de Porto Santo', madeira_start)
        if porto_start == -1:
            # Try alternate patterns
            porto_start = text.find('Porto Santo', madeira_start)

        paid_route_ids = set()

        # Process Madeira routes (between madeira_start and porto_start)
        print("  Processing Madeira Island routes...")
        if porto_start != -1:
            madeira_section = text[madeira_start:porto_start]
        else:
            madeira_section = text[madeira_start:madeira_start+5000]

        # Extract route lines from Madeira section
        lines = madeira_section.split('\n')
        for line in lines:
            line = line.strip()
            # Look for lines starting with PR followed by number
            if line.startswith('PR') and len(line) > 2:
                # Extract just the PR code (e.g., "PR1" from "PR1 Vereda do Areeiro")
                import re
                match = re.match(r'^(PR\d+(?:\.\d+)?)\s+', line)
                if match:
                    route_id = match.group(1)
                    paid_route_ids.add(route_id)
                    print(f"    • {route_id}")

        # Process Porto Santo routes (after porto_start)
        if porto_start != -1:
            print("  Processing Porto Santo routes...")
            porto_section = text[porto_start:porto_start+1000]
            lines = porto_section.split('\n')
            for line in lines:
                line = line.strip()
                if line.startswith('PR') and len(line) > 2:
                    import re
                    match = re.match(r'^(PR\d+(?:\.\d+)?)\s+', line)
                    if match:
                        route_id = match.group(1) + '-PS'
                        paid_route_ids.add(route_id)
                        print(f"    • {route_id}")

        print(f"\n✓ Found {len(paid_route_ids)} official paid routes on Simplifica")
        return paid_route_ids

    except Exception as e:
        print(f"⚠️  Error fetching paid routes: {e}")
        print("⚠️  Falling back to marking all PR routes as paid")
        import traceback
        traceback.print_exc()
        return None


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


def merge_route_segments(features, paid_route_ids=None):
    """
    Merge route segments with the same reference into single features.
    Separates routes by island (Madeira vs Porto Santo).

    Args:
        features: List of route features
        paid_route_ids: Set of route IDs that require payment (or None to mark all as paid)

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

        # Determine if this route requires payment
        if paid_route_ids is None:
            # Fallback: mark all as requiring payment
            requires_payment = True
        else:
            requires_payment = route_id in paid_route_ids

        payment_status = "💰 PAID" if requires_payment else "🆓 FREE"

        merged_feature = {
            'type': 'Feature',
            'properties': {
                **best_properties,
                'id': route_id,
                'name': route_name,
                'island': island,
                'requiresPayment': requires_payment
            },
            'geometry': merged_geometry
        }

        merged_features.append(merged_feature)
        print(f"  ✓ Merged {len(segments)} segment(s) for {route_id} ({island}) [{payment_status}]: {route_name}")

    return merged_features


def process_pr_routes(all_routes, paid_route_ids=None):
    """
    Process all PR (Percurso Recomendado) routes and mark them as paid or free.

    Args:
        all_routes: GeoJSON FeatureCollection with all routes
        paid_route_ids: Set of route IDs that require payment (or None to mark all as paid)

    Returns:
        GeoJSON FeatureCollection with all PR routes (paid and free)
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
    merged_features = merge_route_segments(pr_features, paid_route_ids)

    # Count paid vs free routes
    paid_count = sum(1 for f in merged_features if f['properties']['requiresPayment'])
    free_count = len(merged_features) - paid_count

    print(f"\n📊 Summary:")
    print(f"   💰 Paid routes: {paid_count}")
    print(f"   🆓 Free routes: {free_count}")
    print(f"   📍 Total routes: {len(merged_features)}")

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
    print("=" * 70)
    print("MADEIRA PASS ROUTES PROCESSOR")
    print("=" * 70)

    # Fetch official list of paid routes
    paid_route_ids = fetch_official_paid_routes()

    print(f"\nLoading all routes from {INPUT_FILE}...")
    all_routes = load_all_routes()

    if all_routes is None:
        return

    print("\nProcessing PR routes (marking paid vs free)...")
    processed_routes = process_pr_routes(all_routes, paid_route_ids)

    print("\nSaving processed routes...")
    save_paid_routes(processed_routes)

    print("\n" + "=" * 70)
    print("✅ Done!")
    print("=" * 70)


if __name__ == "__main__":
    main()
