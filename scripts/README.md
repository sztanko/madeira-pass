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
