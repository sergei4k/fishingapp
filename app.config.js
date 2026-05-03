import "dotenv/config";

export default {
  expo: {
    name: "StrikeFeed",
    slug: "fishingapp",
    version: "1.2.2",
    description: "Track and share your fishing catches with location, photos, and details",
    orientation: "portrait",
    icon: "./assets/images/logo.png",
    scheme: "fishingapp",
    userInterfaceStyle: "automatic",
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/logo.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_MEDIA_LOCATION",
        "READ_MEDIA_IMAGES",
        "READ_EXTERNAL_STORAGE",
        "CAMERA"
      ],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY
        }
      },
      package: "com.strikefeed.myapp",
      privacy: "https://sergei4k.github.io/fishingapp/privacy-policy.html"
    },
    ios: {
      
      bundleIdentifier: "com.strikefeed.myapp"
    },
    plugins: [
      "expo-notifications",
      ["@rnmapbox/maps", {
        "RNMapboxMapsDownloadToken": process.env.MAPBOX_DOWNLOADS_TOKEN,
        "RNMAPBOX_MAPS_DOWNLOAD_TOKEN": process.env.MAPBOX_DOWNLOADS_TOKEN
      }],
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff"
        }
      ],
      "expo-web-browser",
      "expo-secure-store",
      "expo-sqlite",
      "expo-document-picker",
      [
        "expo-media-library",
        {
          photosPermission: "Allow app to access your photos.",
          savePhotosPermission: "Allow app to save photos.",
          isAccessMediaLocationEnabled: true,
          isMicrophonePermissionDeclared: false
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "b4647e00-4478-4b12-b489-a7a8d98f70f4"
      }
    },
    runtimeVersion: "1.2.1",
    updates: {
      enabled: true,
      fallbackToCacheTimeout: 0,
      url: "https://u.expo.dev/b4647e00-4478-4b12-b489-a7a8d98f70f4"
    }
  }
};
