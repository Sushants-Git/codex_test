import { unstable_noStore } from 'next/cache';
import { auth } from '@/lib/auth';
import { fetchLeaderboard } from '@/lib/leaderboard';
import SignInButton from '@/components/sign-in-button';
import PageHeader from '@/components/page-header';

const FOOTER_PUNCHLINES = [
    'Made with glutton free bread!',
    'Powered by 4 a.m. cardio and questionable life choices.',
    'Whipped up after taking leave to hit the gym.',
    'One push-up per bug and the tech team would be absolutely shredded.',
];

export default async function LeaderboardPage() {
    unstable_noStore();
    const session = await auth();
    const leaderboard = await fetchLeaderboard(100);
    const hasEntries = leaderboard.length > 0;
    const podiumEmojis = [
        '🏆',
        '🥇',
        '🥈',
        '🥉',
        '⚡',
        '🔥',
        '💪',
        '⭐',
        '✨',
        '🎯',
    ];
    const podiumTitles = [
        'Champion',
        'Gold Standard',
        'Silver Streak',
        'Bronze Elite',
        'Lightning Fast',
        'On Fire',
        'Power House',
        'All Star',
        'Dazzling',
        'Laser Focused',
    ];
    const footerPunchline =
        FOOTER_PUNCHLINES[Math.floor(Math.random() * FOOTER_PUNCHLINES.length)];

    return (
        <main className="page leaderboard-page">
            <PageHeader session={session} />

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
                                        index < 10
                                            ? `leaderboard-row leaderboard-row--podium leaderboard-row--podium-${
                                                  index + 1
                                              }`
                                            : 'leaderboard-row'
                                    }
                                >
                                    <td className="rank">
                                        <span className="rank-number">
                                            {index + 1}
                                        </span>
                                        {index < 10 ? (
                                            <span
                                                className={`rank-emoji rank-emoji--${
                                                    index + 1
                                                }`}
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
                                                <img
                                                    src={entry.photo}
                                                    alt={entry.name}
                                                    referrerPolicy="no-referrer"
                                                />
                                            ) : null}
                                            <div>
                                                <p className="participant-name">
                                                    {entry.name}
                                                </p>
                                                {index < 10 ? (
                                                    <p
                                                        className={`podium-label podium-label--${
                                                            index + 1
                                                        }`}
                                                    >
                                                        {podiumTitles[index]}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="steps">
                                        <div className="steps-value">
                                            {entry.totalSteps.toLocaleString()}
                                        </div>
                                        {entry.syncStatus === 'error' && (
                                            <div
                                                className={[
                                                    'sync-pill',
                                                    entry.isRefreshing
                                                        ? 'sync-pill--refreshing'
                                                        : '',
                                                    entry.syncStatus === 'error'
                                                        ? 'sync-pill--error'
                                                        : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                            >
                                                <span
                                                    className="sync-pill__dot"
                                                    aria-hidden="true"
                                                />
                                                {entry.isRefreshing
                                                    ? 'Refreshing...'
                                                    : 'Sync failed'}
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
                                Once authentication is ready, signing in with
                                your Google account will pull your latest steps
                                automatically on every visit—no manual sync
                                required.
                            </p>
                        </div>
                    </>
                )}
            </section>
            <p className="challenge-note">
                Note: Data might take around an hour to update.
            </p>
            <p className="challenge-note challenge-note--bread">
                {footerPunchline}
            </p>
        </main>
    );
}
