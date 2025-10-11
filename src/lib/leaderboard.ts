import { Db, ObjectId } from "mongodb";
import {
    CHALLENGE_END,
    CHALLENGE_START,
    THIRTY_MINUTES_MS,
    challengeWindowMillis,
} from "./challenge";
import { fetchTotalSteps, ensureAccessToken } from "./google-fit";
import { getMongoClient, hasMongoUri } from "./mongodb";

type ParticipantDocument = {
    _id: ObjectId;
    name?: string;
    email?: string;
    profileImageUrl?: string;
    createdAt?: Date;
    googleTokens?: {
        accessToken?: string;
        refreshToken?: string;
        expiryDate?: Date | string;
        scope?: string;
        tokenType?: string;
    };
    metrics?: StepsDataDocument | null;
};

type StepsDataDocument = {
    _id?: ObjectId;
    participantId: ObjectId;
    steps?: number;
    updatedAt?: Date | string;
    lastSyncedAt?: Date | string;
    refreshStartedAt?: Date | string;
    status?: "ready" | "refreshing" | "error";
    errorMessage?: string;
};

export type LeaderboardRow = {
    participantId: string;
    name: string;
    email: string;
    photo?: string;
    totalSteps: number;
    lastSyncedAt: Date | null;
    isRefreshing: boolean;
    syncStatus: StepsDataDocument["status"] | "stale";
};

const COLLECTION_PARTICIPANTS = "participants";
const COLLECTION_STEPS = "stepsdata";

export async function fetchLeaderboard(limit = 100): Promise<LeaderboardRow[]> {
    if (!hasMongoUri) {
        return [];
    }

    const client = await getMongoClient();
    const db = client.db();

    const participantDocs = (await db
        .collection<ParticipantDocument>(COLLECTION_PARTICIPANTS)
        .aggregate<ParticipantDocument>([
            {
                $lookup: {
                    from: COLLECTION_STEPS,
                    localField: "_id",
                    foreignField: "participantId",
                    as: "metrics",
                },
            },
            {
                $unwind: {
                    path: "$metrics",
                    preserveNullAndEmptyArrays: true,
                },
            },
        ])
        .toArray()) as ParticipantDocument[];

    const staleParticipants: ParticipantDocument[] = [];
    const rows = participantDocs
        .map((doc) => {
            const stepsDoc = doc.metrics ?? undefined;
            const lastSyncedAt =
                stepsDoc?.lastSyncedAt ?? stepsDoc?.updatedAt ?? null;
            const lastSyncedDate = lastSyncedAt ? new Date(lastSyncedAt) : null;
            const totalSteps =
                typeof stepsDoc?.steps === "number" ? stepsDoc.steps : 0;
            const status = stepsDoc?.status ?? "ready";

            const now = Date.now();
            const needsRefresh = shouldRefresh(lastSyncedDate, now);
            if (needsRefresh) {
                staleParticipants.push(doc);
            }

            const refreshStartedAt = stepsDoc?.refreshStartedAt
                ? new Date(stepsDoc.refreshStartedAt)
                : null;
            const millisecondsSinceRefreshStart = refreshStartedAt
                ? now - refreshStartedAt.getTime()
                : null;
            const refreshTimedOut =
                status === "refreshing" &&
                millisecondsSinceRefreshStart != null &&
                millisecondsSinceRefreshStart > 60 * 1000;

            const isRefreshing =
                status === "refreshing" &&
                !refreshTimedOut &&
                (!refreshStartedAt ||
                    millisecondsSinceRefreshStart! < THIRTY_MINUTES_MS);

            const effectiveStatus =
                refreshTimedOut || needsRefresh
                    ? "stale"
                    : status === "error"
                      ? "error"
                      : status;

            if (refreshTimedOut && !needsRefresh) {
                staleParticipants.push(doc);
            }

            const syncStatus = effectiveStatus;

            return {
                participantId: doc._id.toString(),
                name: doc.name ?? doc.email ?? "Participant",
                email: doc.email ?? "",
                photo: doc.profileImageUrl ?? undefined,
                totalSteps,
                lastSyncedAt: lastSyncedDate,
                isRefreshing,
                syncStatus,
            };
        })
        .sort((a, b) => {
            if (b.totalSteps === a.totalSteps) {
                return a.name.localeCompare(b.name);
            }
            return b.totalSteps - a.totalSteps;
        })
        .slice(0, limit);

    if (staleParticipants.length > 0) {
        queueParticipantSync(staleParticipants.map((doc) => doc._id));
    }

    return rows;
}

function shouldRefresh(lastSyncedAt: Date | null, now = Date.now()) {
    if (!lastSyncedAt) {
        return true;
    }

    return now - lastSyncedAt.getTime() > THIRTY_MINUTES_MS;
}

const pendingSyncs = new Set<string>();

export function queueParticipantSync(ids: Array<ObjectId | string>) {
    const participantIds = ids.map((id) =>
        typeof id === "string" ? new ObjectId(id) : id
    );

    const idsToSync = participantIds.filter((id) => {
        const key = id.toHexString();
        if (pendingSyncs.has(key)) {
            return false;
        }
        pendingSyncs.add(key);
        return true;
    });

    if (idsToSync.length === 0) {
        return;
    }

    // Run the refresh flow in the background; we swallow rejections so the page render is not blocked.
    setTimeout(() => {
        refreshParticipants(idsToSync)
            .catch((error) => {
                console.error("Failed to refresh participants", error);
            })
            .finally(() => {
                idsToSync.forEach((id) =>
                    pendingSyncs.delete(id.toHexString())
                );
            });
    }, 0);
}

async function refreshParticipants(participantIds: ObjectId[]) {
    const client = await getMongoClient();
    const db = client.db();
    const participantsCollection = db.collection<ParticipantDocument>(
        COLLECTION_PARTICIPANTS
    );
    const stepsCollection = db.collection<StepsDataDocument>(COLLECTION_STEPS);

    const participants = await participantsCollection
        .find({ _id: { $in: participantIds } })
        .toArray();

    for (const participant of participants) {
        await stepsCollection.updateOne(
            { participantId: participant._id },
            {
                $setOnInsert: {
                    createdAt: new Date(),
                    participantId: participant._id,
                },
                $set: { status: "refreshing", refreshStartedAt: new Date() },
            },
            { upsert: true }
        );
    }

    await Promise.allSettled(
        participants.map((participant) => refreshParticipant(participant, db))
    );
}

export async function refreshParticipantsByIds(ids: Array<ObjectId | string>) {
    const participantIds = ids.map((id) =>
        typeof id === "string" ? new ObjectId(id) : id
    );
    if (participantIds.length === 0) {
        return;
    }

    await refreshParticipants(participantIds);
}

async function refreshParticipant(participant: ParticipantDocument, db: Db) {
    if (!participant.googleTokens?.refreshToken) {
        await markSyncError(
            participant._id,
            "Missing Google refresh token; reconnect account.",
            db
        );
        return;
    }

    try {
        const { accessToken, updatedTokens } = await ensureAccessToken(
            participant.googleTokens
        );

        const totalSteps = await fetchTotalSteps(accessToken);
        const now = new Date();

        const stepsCollection =
            db.collection<StepsDataDocument>(COLLECTION_STEPS);
        const participantsCollection = db.collection<ParticipantDocument>(
            COLLECTION_PARTICIPANTS
        );

        await Promise.all([
            stepsCollection.updateOne(
                { participantId: participant._id },
                {
                    $set: {
                        steps: totalSteps,
                        updatedAt: now,
                        lastSyncedAt: now,
                        status: "ready",
                        errorMessage: null,
                    },
                    $setOnInsert: {
                        createdAt: now,
                        participantId: participant._id,
                    },
                },
                { upsert: true }
            ),
            participantsCollection.updateOne(
                { _id: participant._id },
                {
                    $set: {
                        googleTokens: updatedTokens,
                        updatedAt: now,
                    },
                }
            ),
        ]);
    } catch (error) {
        console.error(
            `Failed to refresh participant ${participant._id.toString()}`,
            error
        );
        await markSyncError(
            participant._id,
            error instanceof Error
                ? error.message
                : "Unknown error during Google Fit sync.",
            db
        );
    }
}

async function markSyncError(
    participantId: ObjectId,
    message: string,
    db?: Db
) {
    let database: Db;
    if (db) {
        database = db;
    } else {
        const client = await getMongoClient();
        database = client.db();
    }

    await database.collection(COLLECTION_STEPS).updateOne(
        { participantId },
        {
            $set: {
                status: "error",
                errorMessage: message,
                updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date(), participantId },
        },
        { upsert: true }
    );
}

export function getChallengeWindow() {
    return {
        start: CHALLENGE_START,
        end: CHALLENGE_END,
        millis: challengeWindowMillis,
    };
}
