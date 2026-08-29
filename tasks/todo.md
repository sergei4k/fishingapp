# UGC safeguards tasks

- [x] Add group-chat report and block controls.
  - Acceptance: Report and Block are available for another member's message; blocking removes their messages immediately.
  - Verify: Type check and physical-device walkthrough.
  - Files: `components/GroupModal.tsx`, `lib/moderation.ts`

- [x] Add server-side text filtering for known UGC collections.
  - Acceptance: A direct PocketBase create or update request with a blocked term is rejected.
  - Verify: Deploy hook to a test PocketBase instance and issue an authenticated request.
  - Files: `pb_hooks/group_chat.pb.js`, `pb_hooks/ugc_text_filter.pb.js`

- [ ] Verify release prerequisites.
  - Acceptance: Report/block rules, alerting, and a documented 24-hour moderation owner are active in production.
  - Verify: Submit and resolve a test report within the defined process.
  - Files: Production PocketBase and App Store Connect (external configuration)
