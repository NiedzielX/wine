---
id: guest-008-landing-links-to-how-we-pick-page
area: guest
title: "Landing links to how we pick page"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-how-it-works-explanations.md
  ac: ["AC12"]
test:
  file: packages/app/tests/e2e/how-it-works.e2e.test.ts
  it: "G0 links to G12; G12 has the heading, the sections and the way back with the session"
---

# guest-008-landing-links-to-how-we-pick-page: Landing links to how we pick page

## Goal

The landing page links to the "How we pick your wine" page, which has its sections and a way back that keeps the guest session.

## Given

1. The guest is on the landing page (script-free), where the link to the explanation page carries a session id.

## When

1. The guest follows that link.

## Then

1. The link address has the form /r/halka/how-it-works?sid=<session id>.
2. The page heading is "How we pick your wine".
3. The page says "The sommelier has the last word", "pinot noir with duck" and "No producer pays to be listed."
4. The page has seven sections.
5. Two links lead back to the landing page with the same session id.

## Edge cases covered

- The session id is carried to the explanation page and back.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.
- The test continues the browser session of the earlier tests in the same file (the page it starts on is the one the previous test left), so it is not meant to run alone.

## Test implementation

[packages/app/tests/e2e/how-it-works.e2e.test.ts](../../../packages/app/tests/e2e/how-it-works.e2e.test.ts): `G0 links to G12; G12 has the heading, the sections and the way back with the session`
