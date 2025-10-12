import { unstable_noStore } from "next/cache";
import { auth } from "@/lib/auth";
import { fetchLeaderboard } from "@/lib/leaderboard";
import SignInButton from "@/components/sign-in-button";

const FOOTER_PUNCHLINES = [
  "Made with glutton free bread!",
  "Powered by 4 a.m. cardio and questionable life choices.",
  "Whipped up after taking leave to hit the gym.",
  "One push-up per bug and the tech team would be absolutely shredded."
];

export default async function LeaderboardPage() {
  unstable_noStore();
  const session = await auth();
  const leaderboard = await fetchLeaderboard(100);
  const hasEntries = leaderboard.length > 0;
  const podiumEmojis = ["🔥", "💪", "⚡"];
  const podiumTitles = ["On Fire", "Flexing Hard", "Charged Up"];
  const footerPunchline =
    FOOTER_PUNCHLINES[Math.floor(Math.random() * FOOTER_PUNCHLINES.length)];

  return (
    <main className="page leaderboard-page">
      <header className="leaderboard-header">
        <div className="leaderboard-copy">
          <p className="badge">#GetFitOctober | 6-31 Oct</p>
          <h1>#GetFitOctober By Swipe</h1>
          <p className="lede">
            Ready to step up and crush your fitness goals? Track every stride this October—our top
            three step masters bring home the prizes.
          </p>
          <ul className="challenge-steps">
            <li>
              <strong>Step 1:</strong>{" "}
              <a href="https://www.google.com/fit/" target="_blank" rel="noreferrer noopener">
                Install the Google Fit app
              </a>
            </li>
            <li>
              <strong>Step 2:</strong>{" "}
              <a
                href="https://forms.gle/oj6tCHpporSjAsoW7"
                target="_blank"
                rel="noreferrer noopener"
              >
                Register for the challenge
              </a>
            </li>
          </ul>
          <p className="challenge-dates">Challenge runs from 6 October to 31 October (IST).</p>
        </div>
        {session?.user ? <SignInButton variant="signout" name={session.user.name} /> : <SignInButton />}
      </header>

      <section className="leaderboard-card">
        {hasEntries ? (
          <table className="leaderboard" role="grid">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Name</th>
                <th scope="col" className="right-align">
                  Steps
                </th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => (
                <tr
                  key={entry.participantId}
                  className={
                    index < 3
                      ? `leaderboard-row leaderboard-row--podium leaderboard-row--podium-${index + 1}`
                      : "leaderboard-row"
                  }
                >
                  <td className="rank">
                    <span className="rank-number">{index + 1}</span>
                    {index < 3 ? (
                      <span
                        className={`rank-emoji rank-emoji--${index + 1}`}
                        aria-hidden="true"
                        role="img"
                      >
                        {podiumEmojis[index]}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <div className="participant">
                      {entry.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.photo} alt={entry.name} referrerPolicy="no-referrer" />
                      ) : null}
                      <div>
                        <p className="participant-name">{entry.name}</p>
                        {index < 3 ? (
                          <p className={`podium-label podium-label--${index + 1}`}>
                            {podiumTitles[index]}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="steps">
                    <div className="steps-value">{entry.totalSteps.toLocaleString()}</div>
                    {(entry.syncStatus === "error") && (
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
                        {entry.isRefreshing ? "Refreshing..." : "Sync failed"}
                      </div>
                    )}
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
      <p className="challenge-note">Note: Data might take around an hour to update.</p>
      <p className="challenge-note challenge-note--bread">{footerPunchline}</p>
    </main>
  );
}
