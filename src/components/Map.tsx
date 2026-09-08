import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { RouteCollection, UserLocation, InfoPanelState, RouteStatus, RouteStatusData } from '../types';
import { isInMadeira } from '../utils/geolocation';
import { mapIdsForStatusId } from '../utils/routeStatus';

// OpenFreeMap "Positron" — pale vector basemap, free, no API key, no rate limit.
// Attribution (OpenFreeMap / OpenMapTiles / OpenStreetMap) ships inside the style.
const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Route lines are inserted below this basemap layer (its first symbol layer) so
// place names stay legible on top of them.
const INSERT_BELOW_LAYER = 'waterway_line_label';

interface MapProps {
  userLocation: UserLocation | null;
  routes: RouteCollection | null;
  routeStatus: RouteStatusData | null;
  paidRoutes: string[];
  selectedRouteId: string | null;
  onRouteClick: (routeId: string) => void;
  onMapClick: () => void;
  onMenuClick: (view: InfoPanelState['view']) => void;
}

export default function Map({ userLocation, routes, routeStatus, paidRoutes, selectedRouteId, onRouteClick, onMapClick, onMenuClick }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [hasMovedToUser, setHasMovedToUser] = useState(false);

  // Extract route IDs by status
  // flatMap through mapIdsForStatusId because a few IFCN ids cover more than
  // one route on the map; without it their status matches no feature at all.
  const routeIdsWithStatus = (match: (status: RouteStatus) => boolean) =>
    routeStatus
      ? Object.keys(routeStatus.routes)
          .filter(id => match(routeStatus.routes[id].status))
          .flatMap(mapIdsForStatusId)
      : [];

  const closedRoutes = routeIdsWithStatus(status => status === 'closed');

  // 'conditional' shares the map colour with 'partially_open': both mean the
  // route is walkable but carries a restriction worth reading. The info panel
  // badge tells them apart.
  const partiallyOpenRoutes = routeIdsWithStatus(
    status => status === 'partially_open' || status === 'conditional'
  );

  // Extract free route IDs (routes that don't require payment)
  const freeRoutes = routes
    ? routes.features.filter(f => !f.properties.requiresPayment).map(f => f.properties.id)
    : [];

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASEMAP_STYLE_URL,
      center: [-16.95, 32.75], // Center of Madeira
      zoom: 9.5, // Zoom level to fit the whole archipelago
      // Don't re-request tiles just because their cache headers expired
      refreshExpiredTiles: false
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        trackUserLocation: true
      }),
      'top-right'
    );

    // Add custom menu control
    class MenuControl {
      private _container?: HTMLDivElement;

      onAdd(_map: maplibregl.Map) {
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

        const button = document.createElement('button');
        button.className = 'maplibregl-ctrl-icon maplibregl-ctrl-menu';
        button.type = 'button';
        button.setAttribute('aria-label', 'Menu');
        button.innerHTML = '☰'; // Hamburger icon

        button.addEventListener('click', () => {
          onMenuClick('main');
        });

        this._container.appendChild(button);
        return this._container;
      }

      onRemove() {
        this._container?.parentNode?.removeChild(this._container);
      }
    }

    map.addControl(new MenuControl(), 'top-right');

    // Add custom legend control
    class LegendControl {
      private _container?: HTMLDivElement;
      private _isExpanded: boolean = false;

      onAdd(_map: maplibregl.Map) {
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        this._container.style.backgroundColor = '#fff';

        const button = document.createElement('button');
        button.className = 'maplibregl-ctrl-legend-toggle';
        button.type = 'button';
        button.setAttribute('aria-label', 'Toggle legend');
        button.innerHTML = '🎨'; // Palette icon

        const legendContent = document.createElement('div');
        legendContent.className = 'maplibregl-ctrl-legend-content';
        legendContent.style.display = 'none';
        legendContent.innerHTML = `
          <div style="padding: 8px; min-width: 180px;">
            <div style="font-weight: 600; margin-bottom: 8px; font-size: 12px;">Route Colors</div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 20px; height: 3px; background-color: #dc2626; border-radius: 2px;"></div>
                <span>Closed</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 20px; height: 3px; background-color: #fbbf24; border-radius: 2px;"></div>
                <span>Partial / conditional</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 20px; height: 3px; background-color: #fb923c; border-radius: 2px;"></div>
                <span>Selected</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 20px; height: 3px; background-color: #10b981; border-radius: 2px;"></div>
                <span>Free</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 20px; height: 3px; background-color: #3b82f6; border-radius: 2px;"></div>
                <span>Paid by You</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 20px; height: 3px; background-color: #8b5cf6; border-radius: 2px;"></div>
                <span>Requires Payment</span>
              </div>
            </div>
          </div>
        `;

        button.addEventListener('click', () => {
          this._isExpanded = !this._isExpanded;
          legendContent.style.display = this._isExpanded ? 'block' : 'none';
        });

        this._container.appendChild(button);
        this._container.appendChild(legendContent);
        return this._container;
      }

      onRemove() {
        this._container?.parentNode?.removeChild(this._container);
      }
    }

    map.addControl(new LegendControl(), 'top-left');

    // Add CSS for menu button and legend
    const style = document.createElement('style');
    style.textContent = `
      .maplibregl-ctrl-menu {
        width: 29px;
        height: 29px;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        background-color: #fff;
        border: none;
      }
      .maplibregl-ctrl-menu:hover {
        background-color: #f0f0f0;
      }
      .maplibregl-ctrl-legend-toggle {
        width: 29px;
        height: 29px;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        background-color: #fff;
        border: none;
        border-bottom: 1px solid #ddd;
      }
      .maplibregl-ctrl-legend-toggle:hover {
        background-color: #f0f0f0;
      }
      .maplibregl-ctrl-legend-content {
        background-color: #fff;
        border-top: 1px solid #ddd;
      }
    `;
    document.head.appendChild(style);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Add routes to map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routes) return;

    console.log('Attempting to add routes to map. Routes loaded:', routes.features.length);

    // Wait for map to load
    const onLoad = () => {
      console.log('Map loaded, adding route layers');

      if (map.getSource('routes')) {
        console.log('Updating existing routes source');
        (map.getSource('routes') as maplibregl.GeoJSONSource).setData(routes);
      } else {
        console.log('Adding new routes source and single layer with data-driven styling');

        // Draw routes underneath the basemap's labels so place names stay readable
        const beforeId = map.getLayer(INSERT_BELOW_LAYER) ? INSERT_BELOW_LAYER : undefined;

        map.addSource('routes', {
          type: 'geojson',
          data: routes
        });

        // Invisible wider layer for easier tapping on mobile
        map.addLayer({
          id: 'routes-layer-hitarea',
          type: 'line',
          source: 'routes',
          paint: {
            'line-color': 'transparent',
            'line-width': 20, // Wide tap target (20px)
            'line-opacity': 0
          }
        }, beforeId);

        // Visible routes layer with data-driven styling
        map.addLayer({
          id: 'routes-layer',
          type: 'line',
          source: 'routes',
          paint: {
            // Color based on status and payment requirements
            'line-color': [
              'case',
              ['in', ['get', 'id'], ['literal', closedRoutes]],
              '#dc2626', // Closed: red
              ['in', ['get', 'id'], ['literal', partiallyOpenRoutes]],
              '#fbbf24', // Partially open or conditional: yellow/amber
              ['==', ['get', 'id'], selectedRouteId || ''],
              '#fb923c', // Selected: bright orange
              ['in', ['get', 'id'], ['literal', freeRoutes]],
              '#10b981', // Free: green
              ['in', ['get', 'id'], ['literal', paidRoutes]],
              '#3b82f6', // User paid: blue (distinct from green)
              '#8b5cf6'  // Unpaid (requires payment): purple
            ],
            // Width based on selected state
            'line-width': [
              'case',
              ['==', ['get', 'id'], selectedRouteId || ''],
              5, // Selected: thicker
              3  // Normal: standard width
            ],
            'line-opacity': 0.9
          }
        }, beforeId);

        console.log('Route layer added successfully');
        console.log('Routes source data:', routes.features.length, 'features');

        // Check if layer is queryable
        setTimeout(() => {
          const features = map.queryRenderedFeatures({ layers: ['routes-layer-hitarea', 'routes-layer'] });
          console.log('Queryable features on routes layers:', features.length);
          if (features.length === 0) {
            console.warn('⚠️ No features rendered on routes layers! Routes might be outside viewport or have rendering issue');
          }
        }, 1000);

        // Add click handler on map (check if clicked on route or not)
        map.on('click', (e) => {
          // Query both the hit area and visible layer for better tap detection
          const features = map.queryRenderedFeatures(e.point, { layers: ['routes-layer-hitarea', 'routes-layer'] });

          if (features.length > 0) {
            // Clicked on a route
            const feature = features[0];
            const routeId = feature.properties?.id;
            console.log('🎯 Route clicked!', routeId);

            if (routeId) {
              // The zoom will be handled by the useEffect that watches selectedRouteId
              onRouteClick(routeId);
            }
          } else {
            // Clicked on empty map
            console.log('🗺️ Map clicked (not on route)');
            onMapClick();
          }
        });

        // Change cursor on hover (use hit area for better detection)
        map.on('mouseenter', 'routes-layer-hitarea', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'routes-layer-hitarea', () => {
          map.getCanvas().style.cursor = '';
        });
      }
    };

    if (map.loaded()) {
      console.log('Map already loaded, calling onLoad immediately');
      onLoad();
    } else {
      console.log('Map not loaded yet, adding load listener');
      map.once('load', onLoad);
    }
  }, [routes, paidRoutes, selectedRouteId, onRouteClick, onMapClick, closedRoutes, partiallyOpenRoutes, freeRoutes, routeStatus]);

  // Update route styling based on paid status, selection, status, and free routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('routes-layer')) return;

    console.log('Updating route paint properties. Selected:', selectedRouteId);

    // Update paint properties with new data-driven expressions
    map.setPaintProperty('routes-layer', 'line-color', [
      'case',
      ['in', ['get', 'id'], ['literal', closedRoutes]],
      '#dc2626', // Closed: red
      ['in', ['get', 'id'], ['literal', partiallyOpenRoutes]],
      '#fbbf24', // Partially open: yellow/amber
      ['==', ['get', 'id'], selectedRouteId || ''],
      '#fb923c', // Selected: bright orange
      ['in', ['get', 'id'], ['literal', freeRoutes]],
      '#10b981', // Free: green
      ['in', ['get', 'id'], ['literal', paidRoutes]],
      '#3b82f6', // User paid: blue (distinct from green)
      '#8b5cf6'  // Unpaid (requires payment): purple
    ]);

    map.setPaintProperty('routes-layer', 'line-width', [
      'case',
      ['==', ['get', 'id'], selectedRouteId || ''],
      5, // Selected: thicker
      3  // Normal: standard width
    ]);
  }, [paidRoutes, selectedRouteId, closedRoutes, partiallyOpenRoutes, routeStatus, freeRoutes]);

  // Zoom to selected route when it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRouteId || !routes) return;

    // Find the selected route
    const route = routes.features.find(f => f.properties.id === selectedRouteId);
    if (!route) return;

    // Calculate bounds of the route
    const bounds = new maplibregl.LngLatBounds();

    if (route.geometry.type === 'LineString') {
      route.geometry.coordinates.forEach((coord) => {
        bounds.extend(coord as [number, number]);
      });
    } else if (route.geometry.type === 'MultiLineString') {
      route.geometry.coordinates.forEach((line) => {
        line.forEach((coord) => {
          bounds.extend(coord as [number, number]);
        });
      });
    }

    // Zoom to route with padding
    const bottomPadding = window.innerHeight * 0.6 + 50; // 60% for panel + 50px buffer
    map.fitBounds(bounds, {
      padding: { top: 100, bottom: bottomPadding, left: 80, right: 80 },
      duration: 800,
      maxZoom: 15
    });
  }, [selectedRouteId, routes]);

  // Update user location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    const inMadeira = isInMadeira(userLocation.latitude, userLocation.longitude);

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLocation.longitude, userLocation.latitude]);
    } else {
      const marker = new maplibregl.Marker({ color: '#4a90e2' })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(map);
      userMarkerRef.current = marker;

      // Only fly to user location if they're in Madeira and we haven't moved yet
      if (inMadeira && !hasMovedToUser) {
        map.flyTo({
          center: [userLocation.longitude, userLocation.latitude],
          zoom: 14,
          duration: 1000
        });
        setHasMovedToUser(true);
      }
    }
  }, [userLocation, hasMovedToUser]);

  return <div ref={mapContainerRef} className="map-container" />;
}
