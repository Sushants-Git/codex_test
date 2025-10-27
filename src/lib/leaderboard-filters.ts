export type FilterOption = 'default' | 'women' | 'men' | 'ordered';

export type LeaderboardRow = {
    participantId: string;
    name: string;
    email: string;
    photo?: string;
    gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
    totalSteps: number;
    lastSyncedAt: string | null;
    isRefreshing: boolean;
    syncStatus: string;
    tokenExpired?: boolean;
};

export type ProcessedLeaderboardRow = LeaderboardRow & {
    originalRank: number;
    originalIndex: number;
};

export function filterLeaderboardData(
    rows: LeaderboardRow[],
    filter: FilterOption
): ProcessedLeaderboardRow[] {
    switch (filter) {
        case 'women':
            return rows
                .filter((row) => row.gender === 'female')
                .sort((a, b) => {
                    if (b.totalSteps === a.totalSteps) {
                        return a.name.localeCompare(b.name);
                    }
                    return b.totalSteps - a.totalSteps;
                })
                .map((row, index) => ({
                    ...row,
                    originalRank: index + 1,
                    originalIndex: index,
                }));

        case 'men':
            return rows
                .filter((row) => row.gender === 'male')
                .sort((a, b) => {
                    if (b.totalSteps === a.totalSteps) {
                        return a.name.localeCompare(b.name);
                    }
                    return b.totalSteps - a.totalSteps;
                })
                .map((row, index) => ({
                    ...row,
                    originalRank: index + 1,
                    originalIndex: index,
                }));

        case 'ordered':
            return rows
                .slice()
                .sort((a, b) => {
                    if (b.totalSteps === a.totalSteps) {
                        return a.name.localeCompare(b.name);
                    }
                    return b.totalSteps - a.totalSteps;
                })
                .map((row, index) => ({
                    ...row,
                    originalRank: index + 1,
                    originalIndex: index,
                }));

        case 'default':
        default:
            // Return randomized order (current behavior)
            const rowsWithRank = rows.map((row, index) => ({
                ...row,
                originalRank: index + 1,
                originalIndex: index,
            }));

            // Shuffle the array randomly
            const shuffled = [...rowsWithRank];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            return shuffled;
    }
}

export const filterOptions = [
    {
        value: 'default' as const,
        label: 'Default',
        description: 'Current leaderboard (randomized)',
    },
    {
        value: 'women' as const,
        label: 'Women',
        description: 'All females by rank',
    },
    { value: 'men' as const, label: 'Men', description: 'All males by rank' },
    {
        value: 'ordered' as const,
        label: 'Ordered',
        description: 'Everyone by rank',
    },
] as const;
