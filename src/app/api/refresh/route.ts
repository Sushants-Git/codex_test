export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { THIRTY_MINUTES_MS } from "@/lib/challenge";
import { refreshParticipantsByIds } from "@/lib/leaderboard";
import { getMongoClient, hasMongoUri } from "@/lib/mongodb";

type ParticipantWithMetrics = {
    _id: ObjectId;
    metrics?: {
        lastSyncedAt?: Date | string;
        updatedAt?: Date | string;
    } | null;
};

const COLLECTION_PARTICIPANTS = "participants";
const COLLECTION_STEPS = "stepsdata";

export async function GET(request: Request) {
    if (!hasMongoUri) {
        return NextResponse.json(
            { error: "MongoDB not configured" },
            { status: 503 }
        );
    }

    const { searchParams } = new URL(request.url);
    const forceParam = searchParams.get("forceRefresh");
    const forceRefresh =
        forceParam == null ? true : forceParam.toLowerCase() !== "false";

    const client = await getMongoClient();
    const db = client.db();

    const participantDocs = (await db
        .collection<ParticipantWithMetrics>(COLLECTION_PARTICIPANTS)
        .aggregate([
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
            return now - lastSyncedAt.getTime() > THIRTY_MINUTES_MS;
        })
        .map((doc) => doc._id);

    if (idsToRefresh.length > 0) {
        await refreshParticipantsByIds(idsToRefresh);
    }

    return NextResponse.json({
        totalParticipants: participantDocs.length,
        refreshed: idsToRefresh.length,
        forceRefresh: Boolean(forceRefresh),
    });
}
