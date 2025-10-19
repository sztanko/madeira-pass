#!/usr/bin/env python3
"""
Process Madeira hiking routes data.

This script:
1. Reads all routes from data/routes.geojson
2. Fetches the list of routes requiring payment from Madeira API
3. Filters routes that require payment
4. Outputs to public/data/paid_routes.geojson
"""

import json
import re
import requests
import urllib3
from pathlib import Path

# Disable SSL warnings (needed for Madeira government portal)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API endpoint for routes requiring payment
API_URL = "https://simplifica.madeira.gov.pt/api/infoProcess/259/resources?processId=78"

# File paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
INPUT_FILE = PROJECT_ROOT / "data" / "routes.geojson"
OUTPUT_FILE = PROJECT_ROOT / "public" / "data" / "paid_routes.geojson"


def fetch_paid_routes_list():
    """Fetch the list of routes requiring payment from Madeira API."""
    try:
        # Disable SSL verification due to certificate issues with the Madeira portal
        response = requests.get(API_URL, verify=False)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching paid routes list: {e}")
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


def extract_paid_refs(paid_routes_info):
    """
    Extract normalized PR references from API response.

    Args:
        paid_routes_info: API response with paid routes data

    Returns:
        Set of normalized PR reference codes
    """
    paid_refs = set()

    for route in paid_routes_info.get('data', []):
        name = route.get('name', '')
        normalized = normalize_ref(name)
        if normalized:
            paid_refs.add(normalized)
            print(f"  Found paid route: {normalized} ({name})")

    return paid_refs


def filter_paid_routes(all_routes, paid_routes_info):
    """
    Filter routes that require payment.

    Args:
        all_routes: GeoJSON FeatureCollection with all routes
        paid_routes_info: API response with paid routes data

    Returns:
        GeoJSON FeatureCollection with only paid routes
    """
    # Extract paid route references from API
    paid_refs = extract_paid_refs(paid_routes_info)
    print(f"\nTotal unique paid routes from API: {len(paid_refs)}")

    paid_features = []
    matched_refs = set()

    # Filter routes from GeoJSON
    for feature in all_routes.get('features', []):
        properties = feature.get('properties', {})
        geometry_type = feature.get('geometry', {}).get('type', '')

        # Only consider LineString and MultiLineString geometries
        if geometry_type not in ['LineString', 'MultiLineString']:
            continue

        # Get the ref field
        ref = properties.get('ref', '')

        # Normalize and check if it's a paid route
        normalized_ref = normalize_ref(ref)

        if normalized_ref in paid_refs:
            # Add the route ID and payment requirement to properties
            feature_copy = {
                'type': feature['type'],
                'properties': {
                    **properties,
                    'id': normalized_ref,
                    'requiresPayment': True
                },
                'geometry': feature['geometry']
            }
            paid_features.append(feature_copy)
            matched_refs.add(normalized_ref)
            print(f"  ✓ Matched: {normalized_ref} - {properties.get('name', 'N/A')}")

    # Report unmatched routes
    unmatched = paid_refs - matched_refs
    if unmatched:
        print(f"\n⚠ Warning: {len(unmatched)} paid routes from API not found in GeoJSON:")
        for ref in sorted(unmatched):
            print(f"  - {ref}")

    return {
        "type": "FeatureCollection",
        "features": paid_features
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
    print("Fetching paid routes information from Madeira API...")
    paid_routes_info = fetch_paid_routes_list()

    if paid_routes_info is None:
        return

    print(f"Loading all routes from {INPUT_FILE}...")
    all_routes = load_all_routes()

    if all_routes is None:
        return

    print("Filtering routes that require payment...")
    paid_routes = filter_paid_routes(all_routes, paid_routes_info)

    print("Saving processed routes...")
    save_paid_routes(paid_routes)

    print("Done!")


if __name__ == "__main__":
    main()
