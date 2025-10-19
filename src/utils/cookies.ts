import { PaidRoute } from '../types';

const COOKIE_NAME = 'madeira_hiking_paid_routes';

/**
 * Get the expiration date for midnight today
 */
function getMidnightExpiration(): Date {
  const midnight = new Date();
  midnight.setHours(23, 59, 59, 999);
  return midnight;
}

/**
 * Get all paid routes from cookie
 */
export function getPaidRoutes(): PaidRoute[] {
  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${COOKIE_NAME}=`));

  if (!cookie) {
    return [];
  }

  try {
    const value = cookie.split('=')[1];
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error parsing paid routes cookie:', error);
    return [];
  }
}

/**
 * Check if a route has been paid for today
 */
export function isRoutePaid(routeId: string): boolean {
  const paidRoutes = getPaidRoutes();
  const today = new Date().toISOString().split('T')[0];

  return paidRoutes.some(
    route => route.routeId === routeId && route.paidDate === today
  );
}

/**
 * Mark a route as paid
 */
export function markRoutePaid(routeId: string): void {
  const paidRoutes = getPaidRoutes();
  const today = new Date().toISOString().split('T')[0];

  // Remove any existing entry for this route
  const filteredRoutes = paidRoutes.filter(route => route.routeId !== routeId);

  // Add new entry
  filteredRoutes.push({
    routeId,
    paidDate: today
  });

  // Save to cookie
  const expires = getMidnightExpiration();
  const value = encodeURIComponent(JSON.stringify(filteredRoutes));
  document.cookie = `${COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/`;
}

/**
 * Clear all paid routes (useful for testing)
 */
export function clearPaidRoutes(): void {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}
