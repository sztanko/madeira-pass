/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate minimum distance from a point to a line segment
 */
function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  return calculateDistance(py, px, yy, xx);
}

/**
 * Calculate minimum distance from a point to a GeoJSON geometry
 * Returns distance in meters
 */
export function distanceToGeometry(
  latitude: number,
  longitude: number,
  geometry: GeoJSON.Geometry
): number {
  if (geometry.type === 'LineString') {
    const coordinates = geometry.coordinates as [number, number][];
    let minDistance = Infinity;

    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];
      const distance = distanceToSegment(longitude, latitude, lon1, lat1, lon2, lat2);
      minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
  } else if (geometry.type === 'MultiLineString') {
    const coordinates = geometry.coordinates as [number, number][][];
    let minDistance = Infinity;

    for (const lineString of coordinates) {
      for (let i = 0; i < lineString.length - 1; i++) {
        const [lon1, lat1] = lineString[i];
        const [lon2, lat2] = lineString[i + 1];
        const distance = distanceToSegment(longitude, latitude, lon1, lat1, lon2, lat2);
        minDistance = Math.min(minDistance, distance);
      }
    }

    return minDistance;
  } else if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates as [number, number];
    return calculateDistance(latitude, longitude, lat, lon);
  }

  return Infinity;
}
