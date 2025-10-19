export interface Route {
  id: string;
  name: string;
  geometry: GeoJSON.Geometry;
  requiresPayment: boolean;
}

export interface RouteFeature extends GeoJSON.Feature {
  properties: {
    id: string;
    name: string;
    requiresPayment: boolean;
    ref?: string;
    from?: string;
    to?: string;
    distance?: number;
    roundtrip?: string;
    charge?: string;
    fee?: string;
    'website:en'?: string;
    'website:pt'?: string;
    'osmc:symbol'?: string;
    note?: string;
    operator?: string;
    alt_name?: string;
    [key: string]: any; // Allow other properties
  };
}

export interface RouteCollection extends GeoJSON.FeatureCollection {
  features: RouteFeature[];
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface PaidRoute {
  routeId: string;
  paidDate: string; // ISO date string
}

export interface NearbyRoute {
  route: RouteFeature;
  distance: number; // in meters
}

export type InfoPanelView = 'main' | 'routes-list' | 'pass-info' | 'about' | 'route-detail';

export interface InfoPanelState {
  isOpen: boolean;
  view: InfoPanelView;
  selectedRoute?: RouteFeature;
  nearbyRoute?: NearbyRoute;
}
