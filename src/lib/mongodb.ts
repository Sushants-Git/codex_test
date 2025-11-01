import { MongoClient, ObjectId } from 'mongodb';
import type { DailyStepBreakdown } from './google-fit';

const uri = process.env.MONGODB_URI;

export const hasMongoUri = Boolean(uri);

let clientPromise: Promise<MongoClient> | null = null;

declare global {
    // eslint-disable-next-line no-var
    var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getMongoClient(): Promise<MongoClient> {
    if (!uri) {
        throw new Error('Missing MONGODB_URI environment variable');
    }

    if (process.env.NODE_ENV === 'development') {
        if (!global._mongoClientPromise) {
            const client = new MongoClient(uri);
            global._mongoClientPromise = client.connect();
        }
        return global._mongoClientPromise;
    }

    if (!clientPromise) {
        const client = new MongoClient(uri);
        clientPromise = client.connect();
    }

    return clientPromise;
}

// Daily Steps Cache Collection Schema
export type DailyStepsCacheDocument = {
    _id?: ObjectId;
    participantId: ObjectId;
    dailySteps: DailyStepBreakdown[];
    lastFetchedAt: Date;
    lastSuccessfulFetchAt?: Date;
    fetchErrorCount: number;
    lastError?: string | null;
    createdAt: Date;
    updatedAt: Date;
};

const COLLECTION_DAILY_STEPS_CACHE = 'dailyStepsCache';
const CACHE_TTL_HOURS = 1; // Cache for 1 hour

export async function getCachedDailySteps(
    participantId: ObjectId
): Promise<DailyStepsCacheDocument | null> {
    if (!hasMongoUri) {
        return null;
    }

    const client = await getMongoClient();
    const db = client.db();
    const collection = db.collection<DailyStepsCacheDocument>(
        COLLECTION_DAILY_STEPS_CACHE
    );

    return await collection.findOne({ participantId });
}

export async function setCachedDailySteps(
    participantId: ObjectId,
    dailySteps: DailyStepBreakdown[],
    isSuccessful: boolean,
    error?: string | null
): Promise<void> {
    if (!hasMongoUri) {
        return;
    }

    const client = await getMongoClient();
    const db = client.db();
    const collection = db.collection<DailyStepsCacheDocument>(
        COLLECTION_DAILY_STEPS_CACHE
    );

    const now = new Date();
    const existingDoc = await collection.findOne({ participantId });

    const updateData: Partial<DailyStepsCacheDocument> = {
        participantId,
        lastFetchedAt: now,
        updatedAt: now,
    };

    if (isSuccessful) {
        updateData.dailySteps = dailySteps;
        updateData.lastSuccessfulFetchAt = now;
        updateData.fetchErrorCount = 0;
        updateData.lastError = null;
    } else {
        updateData.fetchErrorCount = (existingDoc?.fetchErrorCount || 0) + 1;
        updateData.lastError = error || 'Unknown error';
        // Keep existing dailySteps if fetch failed
        if (existingDoc?.dailySteps) {
            updateData.dailySteps = existingDoc.dailySteps;
        }
    }

    await collection.updateOne(
        { participantId },
        {
            $set: updateData,
            $setOnInsert: {
                createdAt: now,
            },
        },
        { upsert: true }
    );
}

export function shouldFetchFreshData(
    cacheDoc: DailyStepsCacheDocument | null
): boolean {
    if (!cacheDoc) {
        return true; // No cache, fetch fresh
    }

    const now = Date.now();
    const lastFetched = cacheDoc.lastFetchedAt.getTime();
    const hoursSinceLastFetch = (now - lastFetched) / (1000 * 60 * 60);

    // Always try to fetch fresh data if cache is older than TTL
    if (hoursSinceLastFetch >= CACHE_TTL_HOURS) {
        return true;
    }

    // If recent fetch failed and we have no successful data, try again
    if (!cacheDoc.lastSuccessfulFetchAt && cacheDoc.fetchErrorCount > 0) {
        return true;
    }

    return false;
}
