# Fit Month Challenge TODO

## 0. Project Hygiene

-   [ ] Run `bun install` locally to generate `bun.lockb` and commit it.
-   [ ] Configure Prettier (or equivalent) and wire it into `package.json` scripts.
-   [x] Check in `.env.local.example` with the current issued credentials for quick setup (rotate if secrets change).

## 1. Homepage Leaderboard

-   [x] Replace the landing page with a leaderboard-first layout and Google sign-in CTA.
-   [x] Provide an empty-state message and preview rows while no participant data is available.
-   [x] Hook NextAuth session state into the header so authenticated users see account controls rather than the sign-in CTA.
-   [x] Fetch leaderboard entries server-side from MongoDB (aggregated Google Fit data).
-   [x] Format total steps for the IST challenge window (6-31 Oct) and render without manual sync prompts.

## 2. Google Auth & Account Linking

-   [ ] Create Google Cloud OAuth client (Web) with `https://swipe-fit.netlify.app/api/auth/callback/google` and local dev redirects.
-   [x] Configure NextAuth Google provider requesting Google Fit scopes (`https://www.googleapis.com/auth/fitness.activity.read` at minimum).
-   [x] Persist NextAuth sessions in MongoDB via the official adapter.
-   [ ] Store Google refresh tokens securely and encrypt at rest before saving.
-   [x] Wire the homepage sign-in button to `signIn("google")`, including loading and error feedback.

## 3. Google Fit Data Pipeline

-   [x] Implement backend utilities for Google Fit aggregate requests (`users.dataset:aggregate` for challenge steps).
-   [ ] Add Google Fit sessions retrieval (`users.sessions.list`) to support 30-minute activity snapshots.
-   [x] Trigger Google Fit aggregation for all participants whenever the leaderboard is requested, using caching to stay within API limits (stale refresh detection now retries when last sync exceeds 30 minutes).
-   [x] Cache aggregated steps for the leaderboard window (6 Oct 00:00 IST - 31 Oct 23:59 IST) per user to minimize API usage.
-   [x] Expose `/api/refresh` GET endpoint to refresh stale participants or force a resync on demand.
-   [ ] Store the computed 30-minute activity snapshot in MongoDB for potential “recent effort” views (no manual sync timestamps needed).

## 4. Supporting Views & UX Polish

-   [ ] Add a `/rules` page outlining challenge guidelines, scoring, and privacy notes.
-   [ ] Provide a `/profile` page for authenticated users to inspect their synced metrics and trigger manual refresh.
-   [x] Ensure the leaderboard is fully responsive (compact cards on mobile, accessible contrast, focus states).
-   [x] Surface per-day step breakdown in the leaderboard when selecting a participant.

## 5. Observability & Admin

-   [ ] Add server-side logging around OAuth callbacks, token refreshes, and Fit API responses (sanitize PII).
-   [ ] Expose a hidden `/admin/sync` page or route handler gated by role to inspect recent sync jobs.
-   [ ] Configure error monitoring (Sentry or similar) before launch.

## 6. Quality & Deployment

-   [ ] Write integration tests covering NextAuth callbacks and Fit API data transformations.
-   [ ] Add unit tests for leaderboard ranking logic and 30-minute recency calculations.
-   [ ] Set up GitHub Actions (or Netlify build hooks) to run `bun run lint` and the test suite on PRs.
-   [ ] Prepare Netlify deployment pipeline; confirm environment variables and secrets are injected at build time.
-   [ ] Run a full end-to-end rehearsal before 6 October to validate syncing and leaderboard accuracy.
