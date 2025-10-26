import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export interface CatchData {
  id: string;
  imageUrl: string | null;
  lat: number | null;
  lon: number | null;
  species: string | null;
  description: string;
  userId?: string | null;
  createdAt: any;
}

export function useCatches(maxResults = 100) {
  const [catches, setCatches] = useState<CatchData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const raw = await AsyncStorage.getItem("local_catches_v1");
        let list: CatchData[] = [];
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed;
        }
        // Sort newest first
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCatches(list.slice(0, maxResults));
      } catch (e) {
        setCatches([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [maxResults]);

  return { catches, loading };
}

