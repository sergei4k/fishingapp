export interface Photo {
  id: string;
  uri: string;
  coordinates: Coordinates | null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}