import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
    const limitArg = Number(process.argv[2]);
    const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 100;
    const { fetchLeaderboard } = await import("@/lib/leaderboard");

    try {
        const rows = await fetchLeaderboard(limit);

        if (rows.length === 0) {
            console.log("No participants found. Ensure MongoDB is populated and credentials are correct.");
            process.exit(0);
        }

        const display = rows.map((row, index) => ({
            Rank: index + 1,
            Name: row.name,
            Email: row.email,
            Steps: row.totalSteps.toLocaleString(),
            Status: row.isRefreshing ? "refreshing" : row.syncStatus ?? "ready",
            "Last Synced":
                row.lastSyncedAt instanceof Date ? row.lastSyncedAt.toISOString() : String(row.lastSyncedAt ?? ""),
        }));

        console.table(display);
        process.exit(0);
    } catch (error) {
        console.error("Failed to load leaderboard data:", error);
        process.exit(1);
    }
}

void main();
