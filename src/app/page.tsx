import { unstable_noStore } from 'next/cache';
import { auth } from '@/lib/auth';
import { fetchLeaderboard } from '@/lib/leaderboard';
import PageHeader from '@/components/page-header';
import LeaderboardTable from '@/components/leaderboard-table';

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

    const interactiveRows = leaderboard.map((entry) => ({
        participantId: entry.participantId,
        name: entry.name,
        email: entry.email,
        photo: entry.photo,
        totalSteps: entry.totalSteps,
        lastSyncedAt: entry.lastSyncedAt
            ? entry.lastSyncedAt.toISOString()
            : null,
        isRefreshing: entry.isRefreshing,
        syncStatus: entry.syncStatus ?? 'ready',
        tokenExpired: entry.tokenExpired ?? false,
    }));

    return (
        <main className="page leaderboard-page">
            <PageHeader session={session} />

            <section className="leaderboard-card">
                {hasEntries ? (
                    <LeaderboardTable
                        rows={interactiveRows}
                        podiumEmojis={podiumEmojis}
                        podiumTitles={podiumTitles}
                    />
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
