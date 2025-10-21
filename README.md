# Madeira Pass

A micro web app that tracks your location and warns you if you need to buy a pass to walk on hiking routes in Madeira.

## Features

- Real-time location tracking
- Map display of all paid hiking routes in Madeira
- Automatic warnings when approaching routes that require payment
- Cookie-based tracking of purchased passes (expires at midnight)
- Direct link to Madeira's official payment portal
- Mobile-first design

## Tech Stack

- React + TypeScript
- MapLibre GL JS
- Vite
- Vanilla CSS

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open your browser at `http://localhost:5173`

### Build

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Data Processing

The project includes Python scripts to process route data:

1. Source data: `data/routes.geojson` - all hiking routes in Madeira from OpenStreetMap
2. Processed data: `public/data/paid_routes.geojson` - only routes requiring payment

The processing script:
- Fetches the official list of paid routes from Madeira's government portal
- Matches routes by PR code (e.g., PR8, PR6.1)
- Filters to only LineString and MultiLineString geometries
- Adds payment requirement metadata

### Prerequisites

- Python 3.8+

### Running the Script

**Option 1: Using the convenience script (recommended)**

```bash
cd scripts
./run.sh
```

**Option 2: Manual setup**

```bash
cd scripts
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python process_routes.py
```

The script will generate `public/data/paid_routes.geojson` which the web app loads at runtime.

## Project Structure

```
madeira_hiking/
├── src/
│   ├── components/     # React components
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── App.tsx         # Main app component
│   ├── App.css         # Global styles
│   └── main.tsx        # Entry point
├── public/
│   └── data/           # GeoJSON data files
├── scripts/            # Python preprocessing scripts
├── data/               # Source data
└── index.html          # HTML entry point
```

## License

Open source project for personal use.
