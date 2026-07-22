/**
 * Office geofence from env.
 * Set OFFICE_LAT / OFFICE_LNG / OFFICE_RADIUS_METERS and OFFICE_GEOFENCE_ENABLED=true.
 * Google Maps API is optional (not required for distance checks).
 */

function numEnv(key, fallback = null) {
  const raw = process.env[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getOfficeGeofenceConfig() {
  const lat = numEnv('OFFICE_LAT');
  const lng = numEnv('OFFICE_LNG');
  const radiusMeters = Math.max(25, numEnv('OFFICE_RADIUS_METERS', 150) || 150);
  const enabledFlag = String(process.env.OFFICE_GEOFENCE_ENABLED || '').toLowerCase();
  const enabled =
    (enabledFlag === '1' || enabledFlag === 'true') &&
    lat != null &&
    lng != null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  return {
    enabled,
    lat: enabled ? lat : null,
    lng: enabled ? lng : null,
    radiusMeters: enabled ? radiusMeters : null,
  };
}

/** Haversine distance in meters between two WGS84 points. */
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

/**
 * @returns {{ ok: true, distanceMeters: number } | { ok: false, error: string, distanceMeters?: number }}
 */
export function assertWithinOffice(lat, lng) {
  const cfg = getOfficeGeofenceConfig();
  if (!cfg.enabled) return { ok: true, distanceMeters: null };

  const userLat = Number(lat);
  const userLng = Number(lng);
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
    return { ok: false, error: 'Location is required to check in from the office.' };
  }
  if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
    return { ok: false, error: 'Invalid location coordinates.' };
  }

  const d = distanceMeters(userLat, userLng, cfg.lat, cfg.lng);
  if (d > cfg.radiusMeters) {
    return {
      ok: false,
      error: 'You are not in the office.',
      distanceMeters: Math.round(d),
    };
  }
  return { ok: true, distanceMeters: Math.round(d) };
}
