import { auth } from "@/lib/auth";
import { fetchLeaderboard } from "@/lib/leaderboard";
import SignInButton from "@/components/sign-in-button";

function formatRelative(date: Date | null): string {
  if (!date) {
    return "Sync pending";
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 45_000) {
    return "Updated just now";
  }

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) {
    return `Updated ${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `Updated ${hours} hr${hours > 1 ? "s" : ""} ago`;
  }

  const days = Math.round(hours / 24);
  return `Updated ${days} day${days > 1 ? "s" : ""} ago`;
}

export default async function LeaderboardPage() {
  const session = await auth();
  const leaderboard = await fetchLeaderboard(100);
  const hasEntries = leaderboard.length > 0;

  return (
    <main className="page leaderboard-page">
      <header className="leaderboard-header">
        <div className="leaderboard-copy">
          <p className="badge">Fit Month | 6-30 Oct (IST)</p>
          <h1>Leaderboard</h1>
          <p className="lede">
            Google Fit data refreshes automatically every time this leaderboard loads. Sign in with
            Google once, and we&apos;ll keep your stats current for you.
          </p>
        </div>
        {session?.user ? <SignInButton variant="signout" name={session.user.name} /> : <SignInButton />}
      </header>

      <section className="leaderboard-card">
        {hasEntries ? (
          <table className="leaderboard" role="grid">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Participant</th>
                <th scope="col" className="right-align">
                  Estimated Steps
                </th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => (
                <tr key={entry.participantId}>
                  <td className="rank">{index + 1}</td>
                  <td>
                    <div className="participant">
                      {entry.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.photo} alt={entry.name} referrerPolicy="no-referrer" />
                      ) : null}
                      <div>
                        <p className="participant-name">{entry.name}</p>
                        <p className="participant-email">{entry.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="steps">
                    <div className="steps-value">{entry.totalSteps.toLocaleString()}</div>
                    <div
                      className={[
                        "sync-pill",
                        entry.isRefreshing ? "sync-pill--refreshing" : "",
                        entry.syncStatus === "error" ? "sync-pill--error" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="sync-pill__dot" aria-hidden="true" />
                      {entry.isRefreshing
                        ? "Refreshing..."
                        : entry.syncStatus === "error"
                        ? "Sync failed"
                        : formatRelative(entry.lastSyncedAt)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <div className="empty-state">
              <h2>Connect Google Fit to appear on the board</h2>
              <p>
                Once authentication is ready, signing in with your Google account will pull your
                latest steps automatically on every visit—no manual sync required.
              </p>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
