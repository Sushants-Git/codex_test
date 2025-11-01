export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import {
    ensureAccessToken,
    fetchChallengeStepSummary,
    type DailyStepBreakdown,
} from '@/lib/google-fit';
import {
    getMongoClient,
    hasMongoUri,
    getCachedDailySteps,
    setCachedDailySteps,
    shouldFetchFreshData,
} from '@/lib/mongodb';

const COLLECTION_PARTICIPANTS = 'participants';
const COLLECTION_STEPS = 'stepsdata';

type ParticipantDocument = {
    _id: ObjectId;
    googleTokens?: {
        accessToken?: string;
        refreshToken?: string;
        expiryDate?: Date | string;
        scope?: string;
        tokenType?: string;
    };
};

type StepsDataDocument = {
    participantId: ObjectId;
    steps?: number;
    dailySteps?: DailyStepBreakdown[];
    dailyStepsUpdatedAt?: Date | string;
    lastSyncedAt?: Date | string;
    updatedAt?: Date | string;
    status?: 'ready' | 'refreshing' | 'error';
    errorMessage?: string | null;
    createdAt?: Date | string;
};

export async function GET(
    request: Request,
    context: { params: { participantId: string } }
) {
    if (!hasMongoUri) {
        return NextResponse.json(
            { error: 'MongoDB not configured' },
            { status: 503 }
        );
    }

    const participantId = context.params?.participantId ?? '';

    let objectId: ObjectId;
    try {
        objectId = new ObjectId(participantId);
    } catch {
        return NextResponse.json(
            { error: 'Invalid participant id' },
            { status: 400 }
        );
    }

    const client = await getMongoClient();
    const db = client.db();
    const participantsCollection = db.collection<ParticipantDocument>(
        COLLECTION_PARTICIPANTS
    );
    const stepsCollection = db.collection<StepsDataDocument>(COLLECTION_STEPS);

    const participant = await participantsCollection.findOne({ _id: objectId });

    if (!participant) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!participant.googleTokens?.refreshToken) {
        return NextResponse.json(
            { error: 'Participant is not linked to Google Fit' },
            { status: 400 }
        );
    }

    // Check cache first
    const cacheDoc = await getCachedDailySteps(objectId);
    const shouldFresh = shouldFetchFreshData(cacheDoc);

    // If we have recent cached data and don't need fresh data, return cache
    if (!shouldFresh && cacheDoc?.dailySteps) {
        console.log(
            `Returning cached daily steps for participant ${participantId}`
        );
        return NextResponse.json({
            participantId,
            dailySteps: cacheDoc.dailySteps,
            fromCache: true,
        });
    }

    // Try to fetch fresh data
    try {
        console.log(
            `Fetching fresh daily steps for participant ${participantId}`
        );
        const { accessToken, updatedTokens } = await ensureAccessToken(
            participant.googleTokens as any // Type assertion to fix the compilation error
        );

        const { totalSteps, dailySteps } = await fetchChallengeStepSummary(
            accessToken
        );
        const now = new Date();

        // Update both the existing steps collection and the new cache
        await Promise.all([
            participantsCollection.updateOne(
                { _id: objectId },
                {
                    $set: {
                        googleTokens: updatedTokens,
                        updatedAt: now,
                    },
                }
            ),
            stepsCollection.updateOne(
                { participantId: objectId },
                {
                    $set: {
                        steps: totalSteps,
                        dailySteps,
                        dailyStepsUpdatedAt: now,
                        lastSyncedAt: now,
                        updatedAt: now,
                        status: 'ready',
                        errorMessage: null,
                    },
                    $setOnInsert: {
                        createdAt: now,
                        participantId: objectId,
                    },
                },
                { upsert: true }
            ),
            setCachedDailySteps(objectId, dailySteps, true),
        ]);

        return NextResponse.json({
            participantId,
            dailySteps,
            fromCache: false,
        });
    } catch (error) {
        console.error(
            `Failed to fetch daily steps for participant ${participantId}`,
            error
        );

        const errorMessage =
            error instanceof Error
                ? error.message
                : 'Failed to fetch daily steps';

        // Store the failed attempt in cache
        await setCachedDailySteps(objectId, [], false, errorMessage);

        // If we have cached data from a previous successful fetch, return it
        if (cacheDoc?.dailySteps && cacheDoc.dailySteps.length > 0) {
            console.log(
                `Returning cached daily steps for participant ${participantId} after fetch failure`
            );
            return NextResponse.json({
                participantId,
                dailySteps: cacheDoc.dailySteps,
                fromCache: true,
                warning: 'Data may be outdated due to sync failure',
            });
        }

        // No cached data available, return error
        return NextResponse.json(
            {
                error: errorMessage,
            },
            { status: 500 }
        );
    }
}
