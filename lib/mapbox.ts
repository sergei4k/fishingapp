import { useEffect, useState } from "react";
import MapboxGL from "@rnmapbox/maps";

export const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  "pk.eyJ1Ijoic2VyZzRrIiwiYSI6ImNtaXpkbWJxMjBwMG4zaHEwZXl3d3Y3YjIifQ.SqeKOgJSr65YJjm_TXqpow";

export const mapboxReady = Promise.resolve(MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN))
  .then(() => true)
  .catch((error) => {
    console.warn("Mapbox token setup failed:", error);
    return false;
  });

export function useMapboxReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    mapboxReady.then((ok) => {
      if (mounted) setReady(ok);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return ready;
}
