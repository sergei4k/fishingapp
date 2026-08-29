# App News tasks

- [x] Add the secure `app_news` PocketBase collection migration.
  - Acceptance: app clients can list/view only currently published posts and cannot write.
  - Verify: migration contract test and PocketBase migration application.

- [x] Add the typed App News data boundary and unread tracking.
  - Acceptance: records are normalized, unsafe URLs rejected, and the last-seen timestamp persists locally.
  - Verify: unit tests.

- [x] Build and integrate the full-screen News UI.
  - Acceptance: Social icon/badge opens a bilingual modal with loading, error, empty, refresh, image, and CTA states.
  - Verify: integration tests, TypeScript, lint, and simulator walkthrough.

- [x] Deploy in dependency order.
  - Acceptance: migration is live before the OTA is published.
  - Verify: production collection query, OTA production listing, and rollback group recorded.
