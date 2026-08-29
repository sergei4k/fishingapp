# Implementation Plan: App Review UGC safeguards

## Objective

Close the app-side gaps identified under App Review Guideline 1.2: users can report or block a group-chat participant, blocked participants disappear immediately from group chat, and group-message text is rejected by the server when it contains objectionable terms.

## Scope

- Reuse the existing `content_reports` and `user_blocks` collections; do not alter database schemas.
- Store group-message report context in the existing report `details` field.
- Enforce a conservative text filter at the PocketBase request boundary for comments, catches, groups, and group messages.
- Preserve existing user controls for catch and comment moderation.

## Out of scope / release prerequisites

- PocketBase collection rules and field configuration must permit authenticated users to create `content_reports` and `user_blocks` records safely.
- The production operator must receive and action reports within 24 hours, remove violating content, and ban offending users.
- Image classification and server-side moderation of catches/comments require separate backend hooks because their current server write paths are not in this repository.

## Tasks

1. Add group-chat report and block actions, plus immediate local removal of blocked users' messages.
2. Reject objectionable text in every known UGC collection before it is stored.
3. Run type checking and linting; manually test a report, block, and rejected send on a physical iPad release build.

## Success criteria

- A non-own group message exposes Report and Block actions.
- Blocking immediately removes that user's existing messages from the open chat and prevents their future realtime messages from being rendered.
- Reporting records the reporter, reported user, group and message IDs, and reason using the existing collection.
- The server rejects blocked terms even if a client bypasses the UI.
