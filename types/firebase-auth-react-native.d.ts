declare module "firebase/auth/react-native" {
  // minimal typed surface for getReactNativePersistence
  import type { Persistence } from "firebase/auth";
  export function getReactNativePersistence(storage: any): Persistence;
}