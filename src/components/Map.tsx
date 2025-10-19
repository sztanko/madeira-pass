import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { RouteCollection, UserLocation, InfoPanelState } from '../types';
import { isInMadeira } from '../utils/geolocation';

interface MapProps {
  userLocation: UserLocation | null;
  routes: RouteCollection | null;
  paidRoutes: string[];
  selectedRouteId: string | null;
  onRouteClick: (routeId: string) => void;
  onMapClick: () => void;
  onMenuClick: (view: InfoPanelState['view']) => void;
}

export default function Map({ userLocation, routes, paidRoutes, selectedRouteId, onRouteClick, onMapClick, onMenuClick }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [hasMovedToUser, setHasMovedToUser] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'carto-light': {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          }
        },
        layers: [
          {
            id: 'carto-light-layer',
            type: 'raster',
            source: 'carto-light',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      },
      center: [-16.95, 32.75], // Center of Madeira
      zoom: 9.5 // Zoom level to fit the whole archipelago
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

    // Add CSS for menu button
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
        });

        // Visible routes layer with data-driven styling
        map.addLayer({
          id: 'routes-layer',
          type: 'line',
          source: 'routes',
          paint: {
            // Color based on selected state, then paid state
            'line-color': [
              'case',
              ['==', ['get', 'id'], selectedRouteId || ''],
              '#4a90e2', // Selected: blue
              ['in', ['get', 'id'], ['literal', paidRoutes]],
              '#51cf66', // Paid: green
              '#ff6b6b'  // Unpaid: red
            ],
            // Width based on selected state
            'line-width': [
              'case',
              ['==', ['get', 'id'], selectedRouteId || ''],
              5, // Selected: thicker
              3  // Normal: standard width
            ],
            'line-opacity': 1
          }
        });

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
              // Find the full route feature from the routes data
              const fullRoute = routes.features.find(f => f.properties.id === routeId);
              if (fullRoute) {
                // Calculate bounds of the route and zoom to it
                const bounds = new maplibregl.LngLatBounds();

                if (fullRoute.geometry.type === 'LineString') {
                  fullRoute.geometry.coordinates.forEach((coord) => {
                    bounds.extend(coord as [number, number]);
                  });
                } else if (fullRoute.geometry.type === 'MultiLineString') {
                  fullRoute.geometry.coordinates.forEach((line) => {
                    line.forEach((coord) => {
                      bounds.extend(coord as [number, number]);
                    });
                  });
                }

                // Zoom to route with padding
                // Calculate bottom padding based on viewport height to account for info panel (60vh)
                const bottomPadding = window.innerHeight * 0.6 + 50; // 60% for panel + 50px buffer
                map.fitBounds(bounds, {
                  padding: { top: 100, bottom: bottomPadding, left: 80, right: 80 },
                  duration: 800,
                  maxZoom: 15
                });
              }

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
  }, [routes, paidRoutes, selectedRouteId, onRouteClick, onMapClick]);

  // Update route styling based on paid status and selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('routes-layer')) return;

    console.log('Updating route paint properties. Selected:', selectedRouteId);

    // Update paint properties with new data-driven expressions
    map.setPaintProperty('routes-layer', 'line-color', [
      'case',
      ['==', ['get', 'id'], selectedRouteId || ''],
      '#4a90e2', // Selected: blue
      ['in', ['get', 'id'], ['literal', paidRoutes]],
      '#51cf66', // Paid: green
      '#ff6b6b'  // Unpaid: red
    ]);

    map.setPaintProperty('routes-layer', 'line-width', [
      'case',
      ['==', ['get', 'id'], selectedRouteId || ''],
      5, // Selected: thicker
      3  // Normal: standard width
    ]);
  }, [paidRoutes, selectedRouteId]);

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
