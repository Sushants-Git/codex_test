import { Db, ObjectId } from 'mongodb';
import {
    CHALLENGE_END,
    CHALLENGE_START,
    REFRESH_STEPS_THROTTLE,
    challengeWindowMillis,
} from './challenge';
import {
    ensureAccessToken,
    fetchChallengeStepSummary,
    type DailyStepBreakdown,
} from './google-fit';
import { getMongoClient, hasMongoUri } from './mongodb';

type ParticipantDocument = {
    _id: ObjectId;
    name?: string;
    email?: string;
    profileImageUrl?: string;
    gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
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
    status?: 'ready' | 'refreshing' | 'error';
    errorMessage?: string;
    dailySteps?: DailyStepBreakdown[];
    dailyStepsUpdatedAt?: Date | string;
    tokenExpired?: boolean;
};

export type LeaderboardRow = {
    participantId: string;
    name: string;
    email: string;
    photo?: string;
    gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
    totalSteps: number;
    lastSyncedAt: Date | null;
    isRefreshing: boolean;
    syncStatus: StepsDataDocument['status'] | 'stale';
    tokenExpired?: boolean;
};

const COLLECTION_PARTICIPANTS = 'participants';
const COLLECTION_STEPS = 'stepsdata';

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
                    localField: '_id',
                    foreignField: 'participantId',
                    as: 'metrics',
                },
            },
            {
                $unwind: {
                    path: '$metrics',
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
                typeof stepsDoc?.steps === 'number' ? stepsDoc.steps : 0;
            const status = stepsDoc?.status ?? 'ready';
            const tokenExpired = stepsDoc?.tokenExpired ?? false;

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
                status === 'refreshing' &&
                millisecondsSinceRefreshStart != null &&
                millisecondsSinceRefreshStart > 60 * 1000;

            const isRefreshing =
                status === 'refreshing' &&
                !refreshTimedOut &&
                (!refreshStartedAt ||
                    millisecondsSinceRefreshStart! < REFRESH_STEPS_THROTTLE);

            const effectiveStatus: LeaderboardRow['syncStatus'] =
                refreshTimedOut || needsRefresh
                    ? 'stale'
                    : status === 'error'
                    ? 'error'
                    : status;

            if (refreshTimedOut && !needsRefresh) {
                staleParticipants.push(doc);
            }

            const syncStatus = effectiveStatus;

            return {
                participantId: doc._id.toString(),
                name: doc.name ?? doc.email ?? 'Participant',
                email: doc.email ?? '',
                photo: doc.profileImageUrl ?? undefined,
                gender: doc.gender,
                totalSteps,
                lastSyncedAt: lastSyncedDate,
                isRefreshing,
                syncStatus,
                tokenExpired,
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

    return now - lastSyncedAt.getTime() > REFRESH_STEPS_THROTTLE;
}

const pendingSyncs = new Set<string>();

export function queueParticipantSync(ids: Array<ObjectId | string>) {
    const participantIds = ids.map((id) =>
        typeof id === 'string' ? new ObjectId(id) : id
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
                console.error('Failed to refresh participants', error);
            })
            .finally(() => {
                idsToSync.forEach((id) =>
                    pendingSyncs.delete(id.toHexString())
                );
            });
    }, 0);
}

export type FailedParticipant = {
    participantId: string;
    name: string;
    email: string;
    reason: string;
};

export type RefreshStats = {
    totalAttempted: number;
    tokensRefreshed: number;
    successfulSyncs: number;
    failedSyncs: number;
    failedParticipants: FailedParticipant[];
};

async function refreshParticipants(
    participantIds: ObjectId[]
): Promise<RefreshStats> {
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
                $set: { status: 'refreshing', refreshStartedAt: new Date() },
            },
            { upsert: true }
        );
    }

    const results = await Promise.allSettled(
        participants.map((participant) => refreshParticipant(participant, db))
    );

    const stats: RefreshStats = {
        totalAttempted: participants.length,
        tokensRefreshed: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        failedParticipants: [],
    };

    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
            if (result.value.tokenRefreshed) {
                stats.tokensRefreshed++;
            }
            if (result.value.success) {
                stats.successfulSyncs++;
            } else {
                stats.failedSyncs++;
                stats.failedParticipants.push({
                    participantId: result.value.participantId,
                    name: result.value.name,
                    email: result.value.email,
                    reason: result.value.errorReason || 'Unknown error',
                });
            }
        } else {
            stats.failedSyncs++;
            const participant = participants[index];
            stats.failedParticipants.push({
                participantId: participant._id.toString(),
                name: participant.name ?? participant.email ?? 'Unknown',
                email: participant.email ?? 'No email',
                reason:
                    result.status === 'rejected'
                        ? result.reason instanceof Error
                            ? result.reason.message
                            : String(result.reason)
                        : 'Promise rejected with unknown reason',
            });
        }
    });

    return stats;
}

export async function refreshParticipantsByIds(
    ids: Array<ObjectId | string>
): Promise<RefreshStats> {
    const participantIds = ids.map((id) =>
        typeof id === 'string' ? new ObjectId(id) : id
    );
    if (participantIds.length === 0) {
        return {
            totalAttempted: 0,
            tokensRefreshed: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            failedParticipants: [],
        };
    }

    return await refreshParticipants(participantIds);
}

type RefreshParticipantResult = {
    success: boolean;
    tokenRefreshed: boolean;
    participantId: string;
    name: string;
    email: string;
    errorReason?: string;
};

async function refreshParticipant(
    participant: ParticipantDocument,
    db: Db
): Promise<RefreshParticipantResult> {
    const participantInfo = {
        participantId: participant._id.toString(),
        name: participant.name ?? participant.email ?? 'Unknown',
        email: participant.email ?? 'No email',
    };

    if (!participant.googleTokens?.refreshToken) {
        const errorReason = 'Missing Google refresh token; reconnect account.';
        await markSyncError(participant._id, errorReason, db);
        return {
            success: false,
            tokenRefreshed: false,
            ...participantInfo,
            errorReason,
        };
    }

    try {
        const participantsCollection = db.collection<ParticipantDocument>(
            COLLECTION_PARTICIPANTS
        );

        // Ensure access token is valid, refresh if expired
        const { accessToken, refreshed, updatedTokens } =
            await ensureAccessToken({
                accessToken: participant.googleTokens.accessToken,
                refreshToken: participant.googleTokens.refreshToken,
                expiryDate: participant.googleTokens.expiryDate,
                scope: participant.googleTokens.scope,
                tokenType: participant.googleTokens.tokenType,
            });

        // Update tokens in DB if they were refreshed
        if (refreshed) {
            await participantsCollection.updateOne(
                { _id: participant._id },
                {
                    $set: {
                        googleTokens: updatedTokens,
                        updatedAt: new Date(),
                    },
                }
            );
        }

        // Fetch steps data with the valid access token
        const { totalSteps, dailySteps } = await fetchChallengeStepSummary(
            accessToken
        );
        const now = new Date();

        const stepsCollection =
            db.collection<StepsDataDocument>(COLLECTION_STEPS);

        // Update steps data and participant tokens, reset tokenExpired flag
        await Promise.all([
            stepsCollection.updateOne(
                { participantId: participant._id },
                {
                    $set: {
                        steps: totalSteps,
                        dailySteps,
                        dailyStepsUpdatedAt: now,
                        updatedAt: now,
                        lastSyncedAt: now,
                        status: 'ready' as const,
                        errorMessage: undefined,
                        tokenExpired: false,
                    },
                    $setOnInsert: {
                        createdAt: now,
                        participantId: participant._id,
                    },
                },
                { upsert: true }
            ),
            // Update tokens one more time to ensure consistency
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

        return {
            success: true,
            tokenRefreshed: refreshed,
            ...participantInfo,
        };
    } catch (error) {
        const errorReason =
            error instanceof Error
                ? error.message
                : 'Unknown error during Google Fit sync.';

        // Check if the error is related to token expiration
        const isTokenError =
            error instanceof Error &&
            (error.message.includes('refresh') ||
                error.message.includes('token') ||
                error.message.includes('401') ||
                error.message.includes('invalid_grant'));

        console.error(
            `Failed to refresh participant ${participant._id.toString()}`,
            error
        );
        await markSyncError(participant._id, errorReason, db, isTokenError);
        return {
            success: false,
            tokenRefreshed: false,
            ...participantInfo,
            errorReason,
        };
    }
}

async function markSyncError(
    participantId: ObjectId,
    message: string,
    db?: Db,
    isTokenError?: boolean
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
                status: 'error' as const,
                errorMessage: message,
                updatedAt: new Date(),
                tokenExpired: isTokenError ?? false,
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
