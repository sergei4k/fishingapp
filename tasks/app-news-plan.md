# Spec and Plan: App News

## Objective

Add a News entry beside the Social notification bell. It opens a full-screen, bilingual feed of approved StrikeFeed updates, promotions, and announcements. Content is managed through PocketBase so publishing does not require an OTA.

## Contract

- `app_news` is read-only to app clients; only PocketBase superusers can create, edit, approve, archive, or delete posts.
- Clients can list only posts with `status = published`, `publish_at <= now`, and no passed expiry date.
- A post contains English and Russian title/body, type, optional image, optional HTTPS CTA, publish time, and optional expiry time.
- Remote text is rendered as text, never HTML. CTA URLs are validated and restricted to HTTPS before opening.
- Unread state is local to the device and advances only after the News modal successfully displays the current feed.

## UI

- A labelled newspaper icon sits immediately before the Social notification bell.
- A small badge indicates unseen published posts.
- The full-screen modal has native safe-area handling, close and refresh controls, loading/error/empty states, and newest-first cards using existing StrikeFeed theme tokens.

## Commands

- Tests: `node --experimental-strip-types --test components/AppNewsModal.test.mjs lib/appNews.test.mjs`
- Type check: `npx tsc --noEmit`
- Lint: `npm run lint`

## Structure

- `pb_migrations/*_create_app_news.js`: schema and server access rules.
- `lib/appNews.ts`: record normalization, fetching, link validation, and unread persistence.
- `components/AppNewsModal.tsx`: presentation and interaction.
- `app/(tabs)/social.tsx`: icon, badge, modal integration.

## Testing

- Pure unit tests cover localization fallback, malformed records, HTTPS link validation, published-feed filtering contract, and unread timestamps.
- Source integration tests cover the migration rules and Social/modal wiring.
- Full project tests, TypeScript, and lint run before release.

## Boundaries

- Always: validate PocketBase records and links at the client boundary; enforce publication rules on the server.
- Ask first: deploying the migration or publishing an OTA.
- Never: render remote HTML, permit client writes, or expose draft content.

## Success criteria

- Published posts appear without a new OTA; drafts, archived, future, and expired posts do not.
- News opens full-screen from Social and supports English/Russian content.
- Users see an unread indicator for newer posts and can clear it by opening News.
- Empty, loading, offline/error, image, CTA, and refresh states are handled.

