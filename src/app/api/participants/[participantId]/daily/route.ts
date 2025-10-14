export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import {
    ensureAccessToken,
    fetchChallengeStepSummary,
    type DailyStepBreakdown,
} from '@/lib/google-fit';
import { getMongoClient, hasMongoUri } from '@/lib/mongodb';

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
    const participantsCollection =
        db.collection<ParticipantDocument>(COLLECTION_PARTICIPANTS);
    const stepsCollection =
        db.collection<StepsDataDocument>(COLLECTION_STEPS);

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

    try {
        const { accessToken, updatedTokens } = await ensureAccessToken(
            participant.googleTokens
        );

        const { totalSteps, dailySteps } =
            await fetchChallengeStepSummary(accessToken);
        const now = new Date();

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
        ]);

        return NextResponse.json({
            participantId,
            dailySteps,
        });
    } catch (error) {
        console.error(
            `Failed to fetch daily steps for participant ${participantId}`,
            error
        );
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to fetch daily steps',
            },
            { status: 500 }
        );
    }
}
