#!/usr/bin/env python3
"""
Fetch route status information from IFCN Madeira website.
This script scrapes the official route status page and outputs JSON.
"""

import json
import requests
import urllib3
from bs4 import BeautifulSoup
from datetime import datetime
from pathlib import Path

# Disable SSL warnings for the Madeira government website
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# URLs and paths
STATUS_URL = 'https://ifcn.madeira.gov.pt/pt/atividades-de-natureza/percursos-pedestres-recomendados/percursos-pedestres-recomendados.html'
OUTPUT_FILE = Path(__file__).parent.parent / 'public' / 'data' / 'route_status.json'


def normalize_status(status_text):
    """
    Normalize status text to simple values.

    Args:
        status_text: Status text from the website

    Returns:
        'open', 'closed', or 'partially_open'
    """
    status_lower = status_text.lower()

    if 'parcialmente aberto' in status_lower or 'parcialmente' in status_lower:
        return 'partially_open'
    elif 'aberto' in status_lower:
        return 'open'
    elif 'encerrado' in status_lower:
        return 'closed'
    else:
        return 'unknown'


def fetch_route_status():
    """
    Fetch route status from IFCN website.

    Returns:
        Dict with route statuses and metadata
    """
    print(f"Fetching route status from {STATUS_URL}...")

    try:
        response = requests.get(STATUS_URL, verify=False, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching page: {e}")
        return None

    soup = BeautifulSoup(response.content, 'html.parser')
    tables = soup.find_all('table')

    if len(tables) < 2:
        print(f"Error: Expected at least 2 tables, found {len(tables)}")
        return None

    print(f"Found {len(tables)} tables on the page")

    routes = {}

    # Process first table (Madeira Island routes)
    print("\nProcessing Madeira Island routes (Table 1)...")
    madeira_table = tables[0]
    rows = madeira_table.find_all('tr')[1:]  # Skip header row

    for row in rows:
        cells = row.find_all(['td', 'th'])
        if len(cells) >= 6:
            pr_num = cells[1].get_text(strip=True)
            route_name = cells[2].get_text(strip=True)
            status_text = cells[5].get_text(strip=True)
            status = normalize_status(status_text)

            if pr_num:
                route_id = f"PR{pr_num}"
                routes[route_id] = {
                    'id': route_id,
                    'name': route_name,
                    'status': status,
                    'status_text': status_text,
                    'island': 'Madeira'
                }
                print(f"  {route_id}: {status} - {route_name}")

    # Process second table (Porto Santo routes)
    print("\nProcessing Porto Santo routes (Table 2)...")
    porto_santo_table = tables[1]
    rows = porto_santo_table.find_all('tr')[1:]  # Skip header row

    for row in rows:
        cells = row.find_all(['td', 'th'])
        if len(cells) >= 6:
            pr_num = cells[1].get_text(strip=True)
            route_name = cells[2].get_text(strip=True)
            status_text = cells[5].get_text(strip=True)
            status = normalize_status(status_text)

            if pr_num:
                route_id = f"PR{pr_num}-PS"
                routes[route_id] = {
                    'id': route_id,
                    'name': route_name,
                    'status': status,
                    'status_text': status_text,
                    'island': 'Porto Santo'
                }
                print(f"  {route_id}: {status} - {route_name}")

    # Create output structure
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
    print("Done!")
    return 0


if __name__ == "__main__":
    exit(main())
