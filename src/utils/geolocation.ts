import { UserLocation } from '../types';

/**
 * Request user's current location
 */
export function getCurrentLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

/**
 * Watch user's location changes
 */
export function watchLocation(
  onLocationUpdate: (location: UserLocation) => void,
  onError: (error: GeolocationPositionError) => void
): number {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser');
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      onLocationUpdate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
    },
    onError,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

/**
 * Stop watching location
 */
export function clearLocationWatch(watchId: number): void {
  navigator.geolocation.clearWatch(watchId);
}

/**
 * Check if coordinates are within Madeira archipelago bounds
 * Approximate bounds for Madeira and Porto Santo islands
 */
export function isInMadeira(latitude: number, longitude: number): boolean {
  // Madeira island bounds (approximate)
  const madeiraBounds = {
    north: 32.89,
    south: 32.60,
    east: -16.65,
    west: -17.30
  };

  // Porto Santo island bounds (approximate)
  const portoSantoBounds = {
    north: 33.10,
    south: 33.04,
    east: -16.28,
    west: -16.42
  };

  const inMadeira =
    latitude >= madeiraBounds.south &&
    latitude <= madeiraBounds.north &&
    longitude >= madeiraBounds.west &&
    longitude <= madeiraBounds.east;

  const inPortoSanto =
    latitude >= portoSantoBounds.south &&
    latitude <= portoSantoBounds.north &&
    longitude >= portoSantoBounds.west &&
    longitude <= portoSantoBounds.east;

  return inMadeira || inPortoSanto;
}
