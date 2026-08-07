<p align="center">
  <img src="assets/images/logo.png" alt="StrikeFeed logo — a pike" width="220" />
</p>

<h1 align="center">StrikeFeed</h1>

<p align="center">
  <strong>Catch the moment. Share the story.</strong><br />
  A mobile companion for anglers to log catches, discover fishing spots, and connect with the fishing community.
</p>

<p align="center">
  <a href="https://github.com/sergei4k/fishingapp"><img src="https://img.shields.io/badge/platform-iOS%20%26%20Android-18354D?style=flat-square" alt="iOS and Android" /></a>
  <a href="https://expo.dev/"><img src="https://img.shields.io/badge/built%20with-Expo-000020?style=flat-square&logo=expo" alt="Built with Expo" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#technology">Technology</a> ·
  <a href="#project-structure">Project structure</a>
</p>

---

## The fishing journal that goes where you go

StrikeFeed turns every trip into a useful record. Save the catch, pin the place, add the details that matter, and revisit the story when the next great day on the water begins.

Designed for Russian-speaking anglers and already seen by more than **6,900 people on RuStore**, StrikeFeed combines a personal catch log with a social fishing community.

<p align="center">
  <img src="screenshots/StrikeFeed.png" alt="StrikeFeed catch map and catch detail" width="260" />
</p>

## Features

| | What you can do |
| :-- | :-- |
| 🎣 | **Log every catch** — record species, size, weight, gear, notes, photos, and the moment it happened. |
| 📍 | **Explore the map** — see catches and fishing spots in context with location-aware mapping. |
| 📸 | **Keep the proof** — attach a photo from the camera or library, including additional catch photos. |
| 🌦️ | **Plan with confidence** — check fishing-focused weather before heading out. |
| 🐟 | **Know your species and gear** — use a broad catalog of freshwater and saltwater species, baits, and tackle. |
| 👥 | **Join the community** — share catches, react, comment, follow anglers, and take part in groups. |
| 📶 | **Fish offline** — keep logging even without reception; pending catches sync when the connection returns. |
| 🔐 | **Make it yours** — sign in with email, Google, Yandex, or Apple and keep your profile and records together. |

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm
- An Android or iOS simulator/device, or [Expo Go](https://expo.dev/go)

### Install and run

```bash
git clone https://github.com/sergei4k/fishingapp.git
cd fishingapp
npm install
npm start
```

Then scan the QR code with Expo Go, or choose an emulator from the Expo development server.

### Run a native build locally

```bash
npm run android
# or
npm run ios
```

> iOS builds require macOS with Xcode. Native maps require the configuration described below.

## Configuration

Create a local `.env` file for values that differ from the shared defaults. Never commit credentials or private keys.

```dotenv
# Optional: defaults to the StrikeFeed backend when omitted
EXPO_PUBLIC_POCKETBASE_URL=https://your-pocketbase.example

# Required for custom Mapbox builds
EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_public_token
MAPBOX_DOWNLOADS_TOKEN=your_download_token

# Required for Android Google Maps builds
GOOGLE_MAPS_API_KEY=your_google_maps_key

# Optional: enables purchases in your own app environment
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_your_key
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_your_key
```

The app uses [PocketBase](https://pocketbase.io/) as its backend. The `pb_migrations/` and `pb_hooks/` directories contain the backend schema changes and server-side hooks needed to support the social, notification, moderation, and account-management features.

## Technology

- [Expo](https://expo.dev/) and [React Native](https://reactnative.dev/) for one codebase across iOS, Android, and web
- [Expo Router](https://docs.expo.dev/router/introduction/) for file-based navigation
- TypeScript for safer, maintainable application code
- [Mapbox](https://www.mapbox.com/) and Google Maps configuration for location-aware catch mapping
- [PocketBase](https://pocketbase.io/) for authentication, data, real-time features, and file storage
- Expo SQLite and AsyncStorage for local data and resilient offline use
- [RevenueCat](https://www.revenuecat.com/) for in-app subscriptions

## Project structure

```text
app/             Screens and Expo Router navigation
components/      Reusable interface components
lib/             App services, data access, sync, and domain logic
assets/          App icons, fish species, gear, and visual assets
pb_migrations/   PocketBase database migrations
pb_hooks/        PocketBase server hooks
screenshots/     Product imagery and store assets
```

## Useful commands

| Command | Description |
| :-- | :-- |
| `npm start` | Start the Expo development server |
| `npm run android` | Run the Android app locally |
| `npm run ios` | Run the iOS app locally |
| `npm run web` | Start the web version |
| `npm run lint` | Run Expo linting |
| `npm run build:production` | Create a production Android build with EAS |
| `npm run build:rustore` | Create an Android build for RuStore with EAS |

## Privacy and terms

StrikeFeed requests only the device permissions necessary for its features: location for the fishing map, camera and photo access for catch records, and notifications when enabled by the user.

- [Privacy Policy](https://sergei4k.github.io/fishingapp/privacy-policy.html)
- [Terms of Service](https://sergei4k.github.io/fishingapp/terms.html)

## Contributing

Issues and pull requests are welcome. Please keep changes focused, run `npm run lint` before opening a pull request, and never include `.env` files, credentials, or signing keys.

---

<p align="center">
  Made for anglers who never want to forget a great catch. 🎣
</p>
