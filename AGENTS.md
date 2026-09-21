# StrikeFeed Agent Guide

## Commands
- Start the root Expo Router app with `npm start`; use `npm run android`, `npm run ios`, or `npm run web` for a platform target.
- Run lint with `npm run lint` and TypeScript validation with `npx tsc --noEmit`. Lint currently reports pre-existing warnings but exits successfully.
- Root contract tests are Node tests, not an npm script: run all with `node --test`, or a focused test with `node --test components/CatchDetailModal.test.mjs`.
- These tests often inspect source text with regexes. Update their asserted source contracts when intentionally changing the corresponding implementation.
- `lib/pushRegistration.test.mjs` expects `ios/Rybolov/Rybolov.entitlements`; the native `ios/` directory is not checked in, so the full root suite fails until native projects are generated or that test is excluded.

## Architecture
- The root package is the active app: Expo Router routes are in `app/`; `app/_layout.tsx` installs auth, purchases, language, network, fonts, and toast providers, while `app/(tabs)/_layout.tsx` owns the tab navigator.
- Shared UI belongs in `components/`; application services and domain data live in `lib/`. Use the `@/` alias for root-relative imports.
- Client data is backed by PocketBase through the singleton in `lib/pocketbase.ts`; catches are stored locally and reconciled through `lib/sync.ts` to preserve offline-created records.
- `photo-coords-firebase/` is a separate legacy Expo 48/Firebase app with its own `package.json`. Do not use root dependencies, scripts, or TypeScript settings for work in that directory.

## PocketBase And Builds
- Schema changes are timestamped, reversible PocketBase migrations in `pb_migrations/`; they execute in PocketBase, not Node.
- `pb_hooks/*.pb.js` run in isolated Goja handler scopes. Require shared helpers inside every handler via `${__hooks}/...`; top-level helper bindings are not available inside handlers.
- Notification hooks must catch their own failures and still call `e.next()` so notification delivery cannot fail the triggering write.
- `app.config.js` loads `.env`; native Mapbox builds require `MAPBOX_DOWNLOADS_TOKEN`, and app runtime configuration uses `EXPO_PUBLIC_*` variables. Do not commit credentials.
- Android release shortcuts are `npm run build:production` and `npm run build:rustore`; both clean native build caches before invoking the corresponding EAS profile.
