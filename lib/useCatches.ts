import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestore } from "./firebase";

export interface CatchData {
  id: string;
  imageUrl: string | null;
  lat: number | null;
  lon: number | null;
  species: string | null;
  description: string;
  userId: string;
  createdAt: any;
}

export function useCatches(maxResults = 100) {
  const [catches, setCatches] = useState<CatchData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Use geohash field to filter for catches with coordinates
    // Only catches with lat/lon will have a geohash
    const q = query(
      collection(firestore, "catches"),
      where("geohash", "!=", null), // Single != filter
      orderBy("geohash"), // Required when using !=
      orderBy("createdAt", "desc"),
      limit(maxResults)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const catchesData: CatchData[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Double-check coordinates exist (redundant but safe)
        if (data.lat != null && data.lon != null && data.geohash) {
          catchesData.push({
            id: doc.id,
            ...data,
          } as CatchData);
        }
      });
      setCatches(catchesData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [maxResults]);

  return { catches, loading };
}

