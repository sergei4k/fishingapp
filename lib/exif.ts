import exifr from "exifr";
import * as Location from "expo-location";
import { geohashForLocation } from "geofire-common";

export async function extractGpsFromUri(uri: string): Promise<{ lat: number; lon: number } | null> {
  try {
    // Fetch image and get ArrayBuffer (works in Expo)
    const res = await fetch(uri);
    const ab = await res.arrayBuffer();
    const data = await exifr.parse(ab, { gps: true });
    const lat = data?.latitude ?? data?.GPSLatitude;
    const lon = data?.longitude ?? data?.GPSLongitude;
    if (typeof lat === "number" && typeof lon === "number" && !(lat === 0 && lon === 0)) {
      return { lat: Number(lat), lon: Number(lon) };
    }
  } catch (e) {
    // EXIF read failed or absent
  }
  return null;
}

// helper to handle adding a new catch from an image URI and optional metadata
export async function addCatchFromImage(params: {
  imageUri: string;
  species?: string | null;
  description?: string | null;
  currentUserId?: string | null;
}): Promise<any> {
  const { imageUri, species, description, currentUserId } = params;

  const coordsFromPhoto = await extractGpsFromUri(imageUri);
  let lat = coordsFromPhoto?.lat ?? null;
  let lon = coordsFromPhoto?.lon ?? null;

  if (lat == null || lon == null) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      const pos = await Location.getCurrentPositionAsync({});
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    }
  }

  const geohash = (lat != null && lon != null) ? geohashForLocation([lat, lon]) : null;

  return await uploadImageAndSaveCatch({
    imageUri,
    lat,
    lon,
    meta: { species, description, geohash },
    userId: currentUserId ?? null,
  });
}
async function uploadImageAndSaveCatch(arg0: {
    imageUri: any;
    lat: number | null;
    lon: number | null;
    meta: { species: any; description: any; geohash: string | null };
    userId: any;
}): Promise<any> {
    const { imageUri, lat, lon, meta, userId } = arg0;

    // Endpoint to receive the uploaded image + metadata.
    // Replace with your real backend URL if needed.
    const uploadUrl =
        (process.env.EXPO_PUBLIC_API_URL || process.env.API_URL) + "/api/catches" || "https://example.com/api/catches";

    try {
        // Convert local URI to blob (works in Expo / RN when using fetch on a file:// URI)
        const fileResp = await fetch(imageUri);
        const blob = await fileResp.blob();

        const fileName = (imageUri && imageUri.split("/").pop()) || "photo.jpg";
        const form = new FormData();
        // @ts-ignore - React Native FormData accepts { uri, name, type } in some runtimes
        form.append("file", {
            uri: imageUri,
            name: fileName,
            type: blob.type || "image/jpeg",
        });
        form.append("lat", String(lat ?? ""));
        form.append("lon", String(lon ?? ""));
        form.append("meta", JSON.stringify(meta));
        form.append("userId", userId ?? "");

        const res = await fetch(uploadUrl, {
            method: "POST",
            // Do not set a content-type header here; let fetch / RN set the multipart boundary.
            body: form as any,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Upload failed: ${res.status} ${res.statusText} ${text}`);
        }

        const result = await res.json().catch(() => null);
        return result;
    } catch (err) {
        console.error("uploadImageAndSaveCatch error:", err);
        throw err;
    }
}
