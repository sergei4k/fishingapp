// Import the functions you need from the SDKs you need
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyArkzmoMrL56hbxOWreFw2Gv3hbms7nZzI",
  authDomain: "fishapp-29d59.firebaseapp.com",
  projectId: "fishapp-29d59",
  storageBucket: "fishapp-29d59.firebasestorage.app",
  messagingSenderId: "756412818018",
  appId: "1:756412818018:web:dc52fb87c8a6cab2a7673b",
  measurementId: "G-15JL14FE8P",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// prefer RN persistence when API is available, otherwise fallback to in-memory
import type { Auth } from "firebase/auth";

// detect getReactNativePersistence at runtime to avoid static resolve errors
let getReactNativePersistence: any | undefined;
try {
  const authPkg = require("firebase/auth") as any;
  getReactNativePersistence = authPkg.getReactNativePersistence ?? undefined;
} catch (e) {
  /* ignore */
}
if (!getReactNativePersistence) {
  try {
    getReactNativePersistence = require("firebase/auth/react-native").getReactNativePersistence;
  } catch (e) {
    getReactNativePersistence = undefined;
  }
}

export let auth: Auth;
if (Platform.OS !== "web" && typeof initializeAuth === "function" && typeof getReactNativePersistence === "function") {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} else {
  auth = getAuth(app); // in-memory fallback (no persistence across restarts)
}

export const firestore = getFirestore(app);
export const storage = getStorage(app);

// optional: anonymous sign-in for dev
signInAnonymously(auth).catch((e) => console.warn("Anonymous sign-in failed", e));
onAuthStateChanged(auth, (u) => console.log("Firebase auth ready, uid:", u?.uid ?? null));

