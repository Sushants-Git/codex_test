# Fit Month Challenge Web App

This project will power a company-wide Fit Month challenge site where participants sign in with Google, link their Google Fit accounts, and compete on a shared leaderboard. All pages are public so anyone can view progress, but only authenticated users can join and sync data.

## Core Features

-   **Join button on top** of every page that triggers Google sign-in via NextAuth.
-   **Google Fit integration** that requests the necessary scopes, stores refresh tokens securely in MongoDB, and pulls activity data (estimated steps and latest readings).
-   **Leaderboard** covering 6 October (IST) through 31 October, ranking participants by total estimated steps in that window.
-   **Recent activity & conditional re-sync** — When someone opens the leaderboard, show the last cached data immediately for fast load. If a participant’s data hasn’t been synced in the last 30 minutes, trigger a background re-fetch and display a small “refreshing” indicator until the updated stats are available. This ensures near-real-time accuracy without delaying page loads.
-   **Minimal, clean UI** prioritizing readability and fast navigation.

## Tech & Credentials

-   Uses Next.js with NextAuth for Google authentication.
-   Persists tokens and user profiles in MongoDB.
-   Relies on the following environment variables (already issued):
    -   NEXTAUTH_SECRET=**\*\*\*\***
    -   NEXTAUTH_URL=**\*\*\*\***
    -   GOOGLE_CLIENT_ID=**\*\*\*\***
    -   GOOGLE_CLIENT_SECRET=**\*\*\*\***
    -   MONGODB_URI=**\*\*\*\***

## Next Steps

1. Set up a new Next.js project and integrate NextAuth with the Google provider using the provided credentials.
2. Implement Google Fit API calls to retrieve daily steps and recent activity; cache results with refresh tokens.
3. Design the leaderboard UI with a default order by total steps and additional detail showing last-sync time and last 30-minute snapshot.
4. Deploy to Netlify (or preferred host) and validate OAuth redirect URIs align with `NEXTAUTH_URL`.

Keep future updates confined to this README until the core project structure is ready.
