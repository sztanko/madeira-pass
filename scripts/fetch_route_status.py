#!/usr/bin/env python3
"""
Fetch route status information from IFCN Madeira website.
This script scrapes the official route status page and outputs JSON.

Status classification lives in route_status_parse.py, with the historical
fixtures in test_route_status_parse.py. An unrecognised status is reported as
'unknown' and makes this script exit 2 -- the file is still written, so the
other routes update, but the caller is expected to treat it as a failure and
go look at the page.
"""

import json
import sys
import requests
import urllib3
from bs4 import BeautifulSoup
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from route_status_parse import UNKNOWN, classify, colour_hint

# Disable SSL warnings for the Madeira government website
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# URLs and paths
STATUS_URL = 'https://ifcn.madeira.gov.pt/pt/atividades-de-natureza/percursos-pedestres-recomendados/percursos-pedestres-recomendados.html'
OUTPUT_FILE = Path(__file__).parent.parent / 'public' / 'data' / 'route_status.json'

# Exit code for "scrape succeeded but we did not understand part of it"
EXIT_UNKNOWN_STATUS = 2

# Column positions in the status tables
COL_PR = 1
COL_NAME = 2
COL_STATUS = 5


def find_route_tables(soup):
    """
    Return the Madeira and Porto Santo route tables.

    The page carries unrelated tables too (a footer, a management-system
    blurb), so match on the header row rather than trusting position -- taking
    tables[0]/tables[1] would silently scrape the wrong thing if the page were
    ever reordered.
    """
    route_tables = []

    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        if not rows:
            continue
        header = ' '.join(
            c.get_text(' ', strip=True).upper()
            for c in rows[0].find_all(['td', 'th'])
        )
        if 'ESTADO' in header and 'PR' in header:
            route_tables.append(table)

    return route_tables


def parse_table(table, id_suffix, island):
    """Parse one route table into {route_id: {...}}."""
    routes = {}

    for row in table.find_all('tr')[1:]:  # Skip header row
        cells = row.find_all(['td', 'th'])
        if len(cells) <= COL_STATUS:
            continue

        pr_num = cells[COL_PR].get_text(strip=True)
        if not pr_num:
            continue

        route_name = cells[COL_NAME].get_text(strip=True)
        status_text = cells[COL_STATUS].get_text(strip=True)
        status = classify(status_text)

        route_id = f"PR{pr_num}{id_suffix}"
        routes[route_id] = {
            'id': route_id,
            'name': route_name,
            'status': status,
            'status_text': status_text,
            'island': island
        }

        # IFCN also colour-codes the headline. Disagreement doesn't change what
        # we publish -- the colour is the less reliable of the two -- but it is
        # worth seeing in the log when the page and our reading diverge.
        hint = colour_hint(str(cells[COL_STATUS]))
        flag = ''
        if status == UNKNOWN:
            flag = '  <-- UNRECOGNISED STATUS'
        elif hint and hint != status:
            flag = f'  (note: IFCN colours this {hint})'

        print(f"  {route_id}: {status} - {route_name}{flag}")

    return routes


def fetch_route_status():
    """
    Fetch route status from IFCN website.

    Returns:
        Dict with route statuses and metadata, or None on failure
    """
    print(f"Fetching route status from {STATUS_URL}...")

    try:
        response = requests.get(STATUS_URL, verify=False, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching page: {e}")
        return None

    soup = BeautifulSoup(response.content, 'html.parser')
    tables = find_route_tables(soup)

    if len(tables) < 2:
        print(f"Error: Expected 2 route tables, found {len(tables)}")
        return None

    print(f"Found {len(tables)} route tables on the page")

    routes = {}

    print("\nProcessing Madeira Island routes (Table 1)...")
    routes.update(parse_table(tables[0], '', 'Madeira'))

    print("\nProcessing Porto Santo routes (Table 2)...")
    routes.update(parse_table(tables[1], '-PS', 'Porto Santo'))

    # Create output structure. 'last_updated' is when the statuses last
    # *changed*: the caller only commits when the routes differ, so a run that
    # finds nothing new leaves the published timestamp alone.
    result = {
        'last_updated': datetime.now().astimezone().isoformat(),
        'source_url': STATUS_URL,
        'routes': routes
    }

    return result


def save_route_status(data):
    """Save route status to JSON file."""
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nRoute status saved to {OUTPUT_FILE}")
    print(f"Total routes: {len(data['routes'])}")


def main():
    """Main execution function."""
    data = fetch_route_status()

    if data is None:
        print("Failed to fetch route status")
        return 1

    save_route_status(data)

    unknown = [r for r in data['routes'].values() if r['status'] == UNKNOWN]
    if unknown:
        print(f"\n{len(unknown)} route(s) have a status IFCN has not used before:")
        for route in unknown:
            print(f"  {route['id']}: {route['status_text']!r}")
        print("\nThe file was still written, so every other route is current.")
        print("Add these strings to scripts/test_route_status_parse.py with the "
              "status they should map to, then update scripts/route_status_parse.py "
              "until the tests pass.")
        return EXIT_UNKNOWN_STATUS

    print("Done!")
    return 0


if __name__ == "__main__":
    exit(main())
