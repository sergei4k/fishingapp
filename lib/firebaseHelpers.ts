import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";
import { geohashForLocation } from "geofire-common";
import { extractGpsFromUri } from "./exif";
import { firestore } from "./firebase";

export async function uploadImageAndSaveCatch({
  imageUri,
  lat = null,
  lon = null,
  meta = {},
  userId,
}: {
  imageUri: string;
  lat?: number | null;
  lon?: number | null;
  meta?: Record<string, any>;
  userId: string;
}) {
  // create a Firestore id first so storage path and doc id match
  const docRef = doc(collection(firestore, "catches"));
  const id = docRef.id;
  const storage = getStorage();
  const path = `catches/${id}.jpg`;
  const sRef = storageRef(storage, path);

  // if coordinates not provided, try extract from EXIF
  let finalLat = lat;
  let finalLon = lon;
  let finalGeohash = meta.geohash ?? null;
  if ((finalLat == null || finalLon == null) && imageUri) {
    try {
      const imgGps = await extractGpsFromUri(imageUri);
      if (imgGps) {
        finalLat = imgGps.lat;
        finalLon = imgGps.lon;
        finalGeohash = imgGps.geohash;
      }
    } catch (e) {
      // ignore EXIF errors — we'll fallback to device location upstream
      console.warn("extractGpsFromUri failed:", e);
    }
  }

  // upload image blob
  const resp = await fetch(imageUri);
  const blob = await resp.blob();

  const uploadMeta: any = {};
  if (finalLat != null) uploadMeta.customMetadata = { ...(uploadMeta.customMetadata ?? {}), gpsLat: String(finalLat) };
  if (finalLon != null) uploadMeta.customMetadata = { ...(uploadMeta.customMetadata ?? {}), gpsLon: String(finalLon) };

  await uploadBytes(sRef, blob, uploadMeta);
  const imageUrl = await getDownloadURL(sRef);

  // build firestore payload
  const payload: any = {
    imageUrl,
    storagePath: path,
    userId,
    lat: finalLat ?? null,
    lon: finalLon ?? null,
    geohash: finalGeohash ?? (finalLat != null && finalLon != null ? geohashForLocation([finalLat, finalLon]) : null),
    createdAt: serverTimestamp(),
    ...meta,
  };

  await setDoc(docRef, payload);
  return id;
}

