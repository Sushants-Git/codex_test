import { challengeWindowMillis } from "./challenge";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AGGREGATE_ENDPOINT =
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";
const DATA_SOURCES_ENDPOINT =
    "https://www.googleapis.com/fitness/v1/users/me/dataSources";

const IST_TIMEZONE = "Asia/Kolkata";
const DAY_IN_MILLIS = 24 * 60 * 60 * 1000;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    throw new Error(
        "Missing Google client credentials in environment variables."
    );
}

type GoogleTokenSet = {
    accessToken?: string;
    refreshToken: string;
    expiryDate?: string | Date | number;
    scope?: string;
    tokenType?: string;
};

type EnsureAccessTokenResult = {
    accessToken: string;
    refreshed: boolean;
    updatedTokens: {
        accessToken: string;
        refreshToken: string;
        expiryDate: Date;
        scope?: string;
        tokenType?: string;
    };
};

export async function ensureAccessToken(
    tokens: GoogleTokenSet
): Promise<EnsureAccessTokenResult> {
    if (!tokens.refreshToken) {
        throw new Error("Participant does not have a refresh token.");
    }

    const expiryDate = tokens.expiryDate ? new Date(tokens.expiryDate) : null;
    const shouldRefresh =
        !tokens.accessToken ||
        !expiryDate ||
        expiryDate.getTime() - Date.now() < 60 * 1000;

    if (!shouldRefresh && tokens.accessToken) {
        return {
            accessToken: tokens.accessToken,
            refreshed: false,
            updatedTokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiryDate,
                scope: tokens.scope,
                tokenType: tokens.tokenType,
            },
        };
    }

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token",
    });

    const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Failed to refresh Google token: ${response.status} ${errorBody}`
        );
    }

    const tokenPayload = (await response.json()) as {
        access_token: string;
        expires_in: number;
        token_type?: string;
        scope?: string;
    };

    const nextExpiry = new Date(Date.now() + tokenPayload.expires_in * 1000);

    return {
        accessToken: tokenPayload.access_token,
        refreshed: true,
        updatedTokens: {
            accessToken: tokenPayload.access_token,
            refreshToken: tokens.refreshToken,
            expiryDate: nextExpiry,
            scope: tokenPayload.scope ?? tokens.scope,
            tokenType: tokenPayload.token_type ?? tokens.tokenType,
        },
    };
}

export type DailyStepBreakdown = {
    date: string;
    steps: number;
    startTimeMillis: number;
    endTimeMillis: number;
    source?: string;
};

export type ChallengeStepSummary = {
    totalSteps: number;
    dailySteps: DailyStepBreakdown[];
};

export async function fetchDailySteps(
    accessToken: string
): Promise<DailyStepBreakdown[]> {
    const { dailySteps } = await fetchChallengeStepSummary(accessToken);
    return dailySteps;
}

export async function fetchTotalSteps(accessToken: string): Promise<number> {
    const { totalSteps } = await fetchChallengeStepSummary(accessToken);
    return totalSteps;
}

export async function fetchChallengeStepSummary(
    accessToken: string
): Promise<ChallengeStepSummary> {
    const buckets = await fetchStepBuckets(accessToken, DAY_IN_MILLIS);
    const filteredBuckets = buckets.filter((bucket) => bucket.steps > 0);

    const dailySteps = filteredBuckets.map((bucket) => ({
        date: formatIstDate(bucket.startTimeMillis),
        steps: bucket.steps,
        startTimeMillis: bucket.startTimeMillis,
        endTimeMillis: bucket.endTimeMillis,
        source: bucket.originDataSourceId,
    }));

    const totalSteps = filteredBuckets.reduce(
        (sum, bucket) => sum + bucket.steps,
        0
    );

    return {
        totalSteps,
        dailySteps,
    };
}

type StepBucket = {
    startTimeMillis: number;
    endTimeMillis: number;
    steps: number;
    originDataSourceId?: string;
};

async function fetchStepBuckets(
    accessToken: string,
    bucketDurationMillis: number
): Promise<StepBucket[]> {
    const aggregateBy = await resolveAggregateSources(accessToken);
    const payload = {
        aggregateBy,
        bucketByTime: { durationMillis: bucketDurationMillis },
        startTimeMillis: challengeWindowMillis.start,
        endTimeMillis: challengeWindowMillis.end,
    };

    const response = await fetch(AGGREGATE_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Failed to fetch Google Fit data: ${response.status} ${errorBody}`
        );
    }

    const data = await response.json();
    const buckets = Array.isArray(data.bucket) ? data.bucket : [];

    return buckets
        .map(parseBucket)
        .filter((bucket): bucket is StepBucket => bucket !== null);
}

async function resolveAggregateSources(accessToken: string) {
    const response = await fetch(DATA_SOURCES_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Failed to fetch data sources: ${response.status} ${errorBody}`
        );
    }

    const sourcesData = await response.json();
    const allSources = Array.isArray(sourcesData.dataSource)
        ? sourcesData.dataSource
        : [];

    const stepSources = allSources.filter(
        (src: any) =>
            src?.dataStreamId?.includes("com.google.step_count.delta") &&
            !src?.dataStreamId?.includes("user_input")
    );

    if (stepSources.length === 0) {
        throw new Error("No valid step sources found (excluding user_input).");
    }

    const estimated = stepSources.find((src: any) =>
        src.dataStreamId?.includes("estimated_steps")
    );

    if (estimated?.dataStreamId) {
        return [{ dataSourceId: estimated.dataStreamId }];
    }

    return stepSources
        .map((src: any) => src.dataStreamId)
        .filter(Boolean)
        .map((dataSourceId: string) => ({ dataSourceId }));
}

function parseBucket(rawBucket: any): StepBucket | null {
    const start = Number.parseInt(rawBucket?.startTimeMillis, 10);
    const end = Number.parseInt(rawBucket?.endTimeMillis, 10);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return null;
    }

    const points = (rawBucket?.dataset ?? [])
        .flatMap((dataset: any) => dataset?.point ?? [])
        .filter(Boolean);

    let steps = 0;
    let origin: string | undefined;

    for (const point of points) {
        const originId =
            point?.originDataSourceId ??
            point?.dataSourceId ??
            point?.dataOrigin;

        if (typeof originId === "string" && originId.includes("user_input")) {
            continue;
        }

        const value = Array.isArray(point?.value) ? point.value[0] : undefined;
        const intVal =
            typeof value?.intVal === "number"
                ? value.intVal
                : typeof value?.fpVal === "number"
                ? Math.round(value.fpVal)
                : 0;

        if (intVal > 0 && !origin && typeof originId === "string") {
            origin = originId;
        }

        steps += intVal;
    }

    return {
        startTimeMillis: start,
        endTimeMillis: end,
        steps,
        originDataSourceId: origin,
    };
}

function formatIstDate(millis: number): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(millis));
}
