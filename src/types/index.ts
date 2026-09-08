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

// Free levada walks extracted from OSM (scripts/process_levadas.py). These
// carry no pass and no official status feed -- they exist only as a named line
// you can tap. Deliberately not a RouteFeature: nothing here is payable.
export interface LevadaFeature extends GeoJSON.Feature {
  properties: {
    name: string;
    length_km: number;
    hasTunnel: boolean;
  };
}

export interface LevadaCollection extends GeoJSON.FeatureCollection {
  features: LevadaFeature[];
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

// 'conditional' is IFCN's CONDICIONADO: the route is walkable but something
// about it is restricted (a bypass shut, a section made bidirectional).
// 'unknown' means IFCN published wording the scraper did not recognise --
// treat it as "go read the source", not as "fine".
export type RouteStatus =
  | 'open'
  | 'closed'
  | 'partially_open'
  | 'conditional'
  | 'unknown';

export interface RouteStatusInfo {
  id: string;
  name: string;
  status: RouteStatus;
  status_text: string;
  island: string;
}

export interface RouteStatusData {
  last_updated: string;
  source_url: string;
  routes: {
    [key: string]: RouteStatusInfo;
  };
}
