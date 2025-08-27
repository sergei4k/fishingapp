// @ts-ignore: no type declarations for 'exifr' in this project
import exifr from "exifr";
import { geohashForLocation } from "geofire-common";

/**
 * Parse common EXIF GPS formats returned by expo-image-picker / other libs.
 * Returns { lat, lon } in decimal degrees or null if not found.
 */
function parseRational(r: string | number) {
  if (typeof r === "number") return r;
  // "num/den" or "num/den,num/den,..." or "num,den,..." formats
  if (typeof r === "string") {
    // handle comma separated rationals or numbers
    const parts = r.split(/[, ]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1 && parts[0].includes("/")) {
      const [n, d] = parts[0].split("/").map(Number);
      return d === 0 ? 0 : n / d;
    }
    if (parts.length === 3) {
      return parts.map((p) => {
        if (p.includes("/")) {
          const [n, d] = p.split("/").map(Number);
          return d === 0 ? 0 : n / d;
        }
        return Number(p);
      });
    }
    const v = Number(parts[0]);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function dmsArrayToDecimal(dms: any, ref?: string) {
  if (!dms) return null;
  // dms can be array of numbers or array of ["num/den", ...]
  let nums: number[] = [];
  if (Array.isArray(dms) && dms.length >= 3) {
    nums = dms.map((p) => {
      if (typeof p === "number") return p;
      if (typeof p === "string" && p.includes("/")) {
        const [n, d] = p.split("/").map(Number);
        return d === 0 ? 0 : n / d;
      }
      return Number(p);
    });
  } else if (typeof dms === "string") {
    // e.g. "12/1,34/1,56/1" or "12,34,56"
    const parsed = dms.split(/[, ]+/).map((s) => {
      if (s.includes("/")) {
        const [n, d] = s.split("/").map(Number);
        return d === 0 ? 0 : n / d;
      }
      return Number(s);
    });
    if (parsed.length >= 3) nums = parsed;
  } else {
    return null;
  }

  const [deg, min, sec] = nums;
  const dec = deg + (min || 0) / 60 + (sec || 0) / 3600;
  if (!ref) return dec;
  return (ref === "S" || ref === "W") ? -dec : dec;
}

export function exifToLatLon(exif: any): { lat: number; lon: number } | null {
  if (!exif) return null;

  // common expo-image-picker shape: exif.GPSLatitude / GPSLatitudeRef etc.
  const gps = exif.GPSLatitude || exif.GPSLatitudeRef || exif.GPSLongitude || exif.GPSLongitudeRef ? exif : null;

  // try GPSLatitude/GPSLongitude + refs
  if (gps) {
    const latVal = exif.GPSLatitude;
    const latRef = exif.GPSLatitudeRef || exif.GPSLatitudeRef || exif.GPSLatitudeRef;
    const lonVal = exif.GPSLongitude;
    const lonRef = exif.GPSLongitudeRef || exif.GPSLongitudeRef || exif.GPSLongitudeRef;

    const lat = dmsArrayToDecimal(latVal, latRef);
    const lon = dmsArrayToDecimal(lonVal, lonRef);
    if (lat != null && lon != null) return { lat, lon };
  }

  // sometimes exif has GPSLatitude and GPSLongitude as decimals
  if (typeof exif.GPSLatitude === "number" && typeof exif.GPSLongitude === "number") {
    return { lat: exif.GPSLatitude, lon: exif.GPSLongitude };
  }

  // some cameras put "Latitude" / "Longitude" or "lat"/"lng"
  const candidates = [
    ["Latitude", "Longitude"],
    ["latitude", "longitude"],
    ["lat", "lng"],
    ["Lat", "Lng"],
  ];
  for (const [latKey, lonKey] of candidates) {
    if (exif[latKey] != null && exif[lonKey] != null) {
      const la = Number(exif[latKey]);
      const lo = Number(exif[lonKey]);
      if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lon: lo };
    }
  }

  return null;
}

/**
 * Given a local URI or remote URL to a JPEG, return { lat, lon, geohash } or null
 */
export async function extractGpsFromUri(uri: string): Promise<{ lat: number; lon: number; geohash: string } | null> {
  try {
    const res = await fetch(uri);
    const buffer = await res.arrayBuffer();
    // exifr.gps returns { latitude, longitude, ... } or null
    const gps: any = await exifr.gps(buffer);
    if (!gps || gps.latitude == null || gps.longitude == null) return null;
    const lat = Number(gps.latitude);
    const lon = Number(gps.longitude);
    const geohash = geohashForLocation([lat, lon]);
    return { lat, lon, geohash };
  } catch (err) {
    console.warn("extractGpsFromUri error:", err);
    return null;
  }
}