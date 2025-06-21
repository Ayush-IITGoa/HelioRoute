import SunCalc from 'suncalc';

// Returns sun azimuth in degrees at a given location and time
export function getSunAzimuth(lat: number, lon: number, date: Date): number {
  const sunPos = SunCalc.getPosition(date, lat, lon);
  // Convert azimuth from radians to degrees, normalize to [0, 360)
  let azimuthDeg = (sunPos.azimuth * 180) / Math.PI + 180;
  if (azimuthDeg < 0) azimuthDeg += 360;
  return azimuthDeg;
}

// Returns initial bearing from (lat1, lon1) to (lat2, lon2) in degrees
export function getInitialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  let bearing = toDeg(Math.atan2(y, x));
  bearing = (bearing + 360) % 360;
  return bearing;
}

// Interpolates points along a great-circle route and computes sun position at each
export function interpolateSunAlongRoute(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  startDate: Date,
  durationHours: number,
  intervalMinutes: number
): Array<{ time: Date; lat: number; lon: number; azimuth: number; altitude: number }> {
  const points: Array<{ time: Date; lat: number; lon: number; azimuth: number; altitude: number }> = [];
  const steps = Math.ceil((durationHours * 60) / intervalMinutes);
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    // Interpolate along great circle
    const { lat, lon } = interpolateGreatCircle(lat1, lon1, lat2, lon2, frac);
    const time = new Date(startDate.getTime() + frac * durationHours * 3600 * 1000);
    const sun = SunCalc.getPosition(time, lat, lon);
    points.push({
      time,
      lat,
      lon,
      azimuth: (sun.azimuth * 180) / Math.PI + 180, // deg
      altitude: (sun.altitude * 180) / Math.PI // deg
    });
  }
  return points;
}

// Spherical linear interpolation (great circle)
export function interpolateGreatCircle(lat1: number, lon1: number, lat2: number, lon2: number, frac: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const φ1 = toRad(lat1), λ1 = toRad(lon1);
  const φ2 = toRad(lat2), λ2 = toRad(lon2);
  const Δ = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
  ));
  if (Δ === 0) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - frac) * Δ) / Math.sin(Δ);
  const B = Math.sin(frac * Δ) / Math.sin(Δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λ = Math.atan2(y, x);
  return { lat: toDeg(φ), lon: ((toDeg(λ) + 540) % 360) - 180 };
} 