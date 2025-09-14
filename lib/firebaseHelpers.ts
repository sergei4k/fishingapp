import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";
import { geohashForLocation } from "geofire-common";
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
  const docRef = doc(collection(firestore, "catches"));
  const id = docRef.id;
  const storage = getStorage();
  const path = `catches/${id}.jpg`;
  const sRef = storageRef(storage, path);

  // Do not attempt EXIF extraction here anymore.
  const finalLat = lat;
  const finalLon = lon;
  const finalGeohash = meta.geohash ?? (finalLat != null && finalLon != null ? geohashForLocation([finalLat, finalLon]) : null);

  // upload image blob
  const resp = await fetch(imageUri);
  const blob = await resp.blob();

  const uploadMeta: any = {};
  if (finalLat != null) uploadMeta.customMetadata = { ...(uploadMeta.customMetadata ?? {}), gpsLat: String(finalLat) };
  if (finalLon != null) uploadMeta.customMetadata = { ...(uploadMeta.customMetadata ?? {}), gpsLon: String(finalLon) };

  await uploadBytes(sRef, blob, uploadMeta);
  const imageUrl = await getDownloadURL(sRef);

  const payload: any = {
    imageUrl,
    storagePath: path,
    userId,
    lat: finalLat ?? null,
    lon: finalLon ?? null,
    geohash: finalGeohash,
    createdAt: serverTimestamp(),
    ...meta,
  };

  await setDoc(docRef, payload);
  return id;
}

