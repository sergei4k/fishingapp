export default {
  expo: {
    name: "Rybolov",
    slug: "fishingapp",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "fishingapp",
    userInterfaceStyle: "automatic",
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
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
          apiKey: process.env.API_KEY
        }
      },
      package: "com.anonymous.fishingapp"
    },
    plugins: [
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
      "expo-maps",
      "expo-web-browser",
      "expo-sqlite",
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
    runtimeVersion: "1.0.0",
    updates: {
      enabled: true,
      fallbackToCacheTimeout: 0
    }
  }
};