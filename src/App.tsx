import { useState, useEffect, useCallback } from 'react';
import Map from './components/Map';
import InfoPanel from './components/InfoPanel';
import { RouteCollection, UserLocation, InfoPanelState, NearbyRoute, RouteStatusData } from './types';
import { getCurrentLocation, watchLocation, clearLocationWatch } from './utils/geolocation';
import { getPaidRoutes, markRoutePaid, unmarkRoutePaid, isRoutePaid } from './utils/cookies';
import { distanceToGeometry } from './utils/distance';
import './App.css';

const PROXIMITY_THRESHOLD = 50; // meters

function App() {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [routes, setRoutes] = useState<RouteCollection | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatusData | null>(null);
  const [paidRouteIds, setPaidRouteIds] = useState<string[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [infoPanelState, setInfoPanelState] = useState<InfoPanelState>({
    isOpen: false,
    view: 'main'
  });
  const [_watchId, setWatchId] = useState<number | null>(null);

  // Load routes from GeoJSON
  useEffect(() => {
    fetch('/madeira-pass/data/paid_routes.geojson')
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load routes: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then(data => {
        console.log('Routes loaded:', data.features.length);
        setRoutes(data);
      })
      .catch(err => console.error('Error loading routes:', err));
  }, []);

  // Load route status data
  useEffect(() => {
    fetch('/madeira-pass/data/route_status.json')
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load route status: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then(data => {
        console.log('Route status loaded:', Object.keys(data.routes).length, 'routes');
        setRouteStatus(data);
      })
      .catch(err => console.error('Error loading route status:', err));
  }, []);

  // Load paid routes from cookies
  useEffect(() => {
    const paid = getPaidRoutes();
    setPaidRouteIds(paid.map(r => r.routeId));
  }, []);

  // Get initial location
  useEffect(() => {
    getCurrentLocation()
      .then(location => {
        setUserLocation(location);
      })
      .catch(err => {
        console.error('Error getting location:', err);
      });
  }, []);

  // Watch location changes
  useEffect(() => {
    const id = watchLocation(
      (location) => {
        setUserLocation(location);
      },
      (error) => {
        console.error('Error watching location:', error);
      }
    );

    setWatchId(id);

    return () => {
      if (id !== null) {
        clearLocationWatch(id);
      }
    };
  }, []);

  // Check proximity to routes
  useEffect(() => {
    if (!userLocation || !routes) return;

    let closestRoute: NearbyRoute | null = null;
    let minDistance = Infinity;

    for (const feature of routes.features) {
      const distance = distanceToGeometry(
        userLocation.latitude,
        userLocation.longitude,
        feature.geometry
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestRoute = { route: feature, distance };
      }
    }

    // If within 50m of a route that requires payment and not paid
    if (closestRoute && closestRoute.distance <= PROXIMITY_THRESHOLD) {
      const routeId = closestRoute.route.properties.id;
      const requiresPayment = closestRoute.route.properties.requiresPayment;
      const isPaid = isRoutePaid(routeId);

      if (requiresPayment && !isPaid) {
        setInfoPanelState({
          isOpen: true,
          view: 'route-detail',
          selectedRoute: closestRoute.route,
          nearbyRoute: closestRoute
        });
      }
    }
  }, [userLocation, routes]);

  const handleRouteClick = useCallback((routeId: string) => {
    if (!routes) return;

    const route = routes.features.find(f => f.properties.id === routeId);
    if (route) {
      setSelectedRouteId(routeId);
      setInfoPanelState({
        isOpen: true,
        view: 'route-detail',
        selectedRoute: route
      });
    }
  }, [routes]);

  const handleMapClick = useCallback(() => {
    // Deselect route and close panel when clicking on map (not on a route)
    setSelectedRouteId(null);
    setInfoPanelState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedRouteId(null);
    setInfoPanelState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleMarkPaid = useCallback((routeId: string) => {
    markRoutePaid(routeId);
    const paid = getPaidRoutes();
    setPaidRouteIds(paid.map(r => r.routeId));
  }, []);

  const handleUnmarkPaid = useCallback((routeId: string) => {
    unmarkRoutePaid(routeId);
    const paid = getPaidRoutes();
    setPaidRouteIds(paid.map(r => r.routeId));
  }, []);

  const handleBuyPass = useCallback((_routeId: string) => {
    // Redirect to Madeira payment portal
    window.open('https://simplifica.madeira.gov.pt/services/78-82-259', '_blank');
  }, []);

  const handleMenuNavigation = useCallback((view: InfoPanelState['view']) => {
    setInfoPanelState({
      isOpen: true,
      view: view
    });
  }, []);

  return (
    <div className="app">
      <Map
        userLocation={userLocation}
        routes={routes}
        paidRoutes={paidRouteIds}
        selectedRouteId={selectedRouteId}
        onRouteClick={handleRouteClick}
        onMapClick={handleMapClick}
        onMenuClick={handleMenuNavigation}
      />
      <InfoPanel
        state={infoPanelState}
        routes={routes?.features || null}
        routeStatus={routeStatus}
        onClose={handleClosePanel}
        onMarkPaid={handleMarkPaid}
        onUnmarkPaid={handleUnmarkPaid}
        onBuyPass={handleBuyPass}
        onNavigate={handleMenuNavigation}
        onRouteClick={handleRouteClick}
        isRoutePaid={isRoutePaid}
      />
    </div>
  );
}

export default App;
