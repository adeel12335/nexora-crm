/** Haversine distance in meters. */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const OFFICE_OUTSIDE_MESSAGE = 'You are not in the office.';
export const LOCATION_REQUIRED_MESSAGE =
  'Location access is required to check in. Please allow location and try again.';
export const LOCATION_UNAVAILABLE_MESSAGE =
  'Unable to read your location. Please enable GPS and try again.';

/**
 * Watch browser geolocation against an office geofence config from the API.
 * @param {null | { enabled: boolean, lat: number|null, lng: number|null, radiusMeters: number|null }} geofence
 */
export function createOfficePresence(geofence) {
  const enabled = Boolean(geofence?.enabled && geofence.lat != null && geofence.lng != null);
  return {
    enabled,
    office: enabled
      ? { lat: Number(geofence.lat), lng: Number(geofence.lng), radiusMeters: Number(geofence.radiusMeters) || 150 }
      : null,
  };
}

export function evaluateOfficePresence(office, position, geoErrorCode) {
  if (!office) {
    return { ready: true, allowed: true, message: '', distanceMeters: null };
  }

  if (geoErrorCode === 'denied') {
    return { ready: true, allowed: false, message: LOCATION_REQUIRED_MESSAGE, distanceMeters: null };
  }
  if (geoErrorCode === 'unavailable' || geoErrorCode === 'timeout') {
    return { ready: true, allowed: false, message: LOCATION_UNAVAILABLE_MESSAGE, distanceMeters: null };
  }
  if (!position) {
    return { ready: false, allowed: false, message: 'Checking your location…', distanceMeters: null };
  }

  const d = distanceMeters(position.lat, position.lng, office.lat, office.lng);
  if (d > office.radiusMeters) {
    return {
      ready: true,
      allowed: false,
      message: OFFICE_OUTSIDE_MESSAGE,
      distanceMeters: Math.round(d),
    };
  }
  return { ready: true, allowed: true, message: '', distanceMeters: Math.round(d) };
}
