export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { REFRESH_STEPS_THROTTLE } from '@/lib/challenge';
import { refreshParticipantsByIds, type RefreshStats } from '@/lib/leaderboard';
import { getMongoClient, hasMongoUri } from '@/lib/mongodb';

type ParticipantWithMetrics = {
    _id: ObjectId;
    metrics?: {
        lastSyncedAt?: Date | string;
        updatedAt?: Date | string;
    } | null;
};

const COLLECTION_PARTICIPANTS = 'participants';
const COLLECTION_STEPS = 'stepsdata';

export async function GET(request: Request) {
    if (!hasMongoUri) {
        return NextResponse.json(
            { error: 'MongoDB not configured' },
            { status: 503 }
        );
    }

    const { searchParams } = new URL(request.url);
    const forceParam = searchParams.get('forceRefresh');
    const forceRefresh =
        forceParam == null ? true : forceParam.toLowerCase() !== 'false';

    const client = await getMongoClient();
    const db = client.db();

    const participantDocs = (await db
        .collection<ParticipantWithMetrics>(COLLECTION_PARTICIPANTS)
        .aggregate([
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
        .toArray()) as ParticipantWithMetrics[];

    const now = Date.now();
    const idsToRefresh = participantDocs
        .filter((doc) => {
            if (forceRefresh) {
                return true;
            }

            const metrics = doc.metrics ?? undefined;
            const lastSyncedAtRaw =
                metrics?.lastSyncedAt ?? metrics?.updatedAt ?? null;
            if (!lastSyncedAtRaw) {
                return true;
            }

            const lastSyncedAt = new Date(lastSyncedAtRaw);
            return now - lastSyncedAt.getTime() > REFRESH_STEPS_THROTTLE;
        })
        .map((doc) => doc._id);

    let refreshStats: RefreshStats = {
        totalAttempted: 0,
        tokensRefreshed: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        failedParticipants: [],
    };

    if (idsToRefresh.length > 0) {
        // refreshParticipantsByIds will:
        // 1. Check if each participant's access token is expired
        // 2. Refresh the token using the refresh token if expired
        // 3. Update the refreshed tokens in the database
        // 4. Fetch the latest steps data using the valid access token
        // 5. Update the steps data in the database
        refreshStats = await refreshParticipantsByIds(idsToRefresh);
    }

    return NextResponse.json({
        totalParticipants: participantDocs.length,
        refreshAttempted: refreshStats.totalAttempted,
        tokensRefreshed: refreshStats.tokensRefreshed,
        successfulSyncs: refreshStats.successfulSyncs,
        failedSyncs: refreshStats.failedSyncs,
        failedParticipants: refreshStats.failedParticipants,
        forceRefresh: Boolean(forceRefresh),
    });
}
