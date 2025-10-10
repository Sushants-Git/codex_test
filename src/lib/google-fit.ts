import { challengeWindowMillis } from "./challenge";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AGGREGATE_ENDPOINT = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    throw new Error("Missing Google client credentials in environment variables.");
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

export async function ensureAccessToken(tokens: GoogleTokenSet): Promise<EnsureAccessTokenResult> {
    if (!tokens.refreshToken) {
        throw new Error("Participant does not have a refresh token.");
    }

    const expiryDate = tokens.expiryDate ? new Date(tokens.expiryDate) : null;
    const shouldRefresh =
        !tokens.accessToken || !expiryDate || expiryDate.getTime() - Date.now() < 60 * 1000;

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
        throw new Error(`Failed to refresh Google token: ${response.status} ${errorBody}`);
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

export async function fetchTotalSteps(accessToken: string): Promise<number> {
  // 1️⃣ Fetch all data sources
  const sourcesResponse = await fetch(
    "https://www.googleapis.com/fitness/v1/users/me/dataSources",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!sourcesResponse.ok) {
    const errorBody = await sourcesResponse.text();
    throw new Error(`Failed to fetch data sources: ${sourcesResponse.status} ${errorBody}`);
  }

  const sourcesData = await sourcesResponse.json();
  const allSources = sourcesData.dataSource ?? [];

  // ✅ Filter to only step_count.delta sources, excluding manual (user_input)
  const stepSources = allSources.filter(
    (src: any) =>
      src.dataStreamId?.includes("com.google.step_count.delta") &&
      !src.dataStreamId?.includes("user_input")
  );

  if (stepSources.length === 0) {
    throw new Error("No valid step sources found (excluding user_input).");
  }

  // 2️⃣ Aggregate data from all valid sources
  const aggregateBy = stepSources.map((src: any) => ({
    dataSourceId: src.dataStreamId,
  }));

  const payload = {
    aggregateBy,
    bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
    startTimeMillis: challengeWindowMillis.start,
    endTimeMillis: challengeWindowMillis.end,
  };

  const response = await fetch(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch Google Fit data: ${response.status} ${errorBody}`);
  }

  const data = await response.json();

  // 3️⃣ Process each day's bucket
  let totalSteps = 0;
  const dailySteps: { date: string; steps: number; source?: string }[] = [];

  for (const bucket of data.bucket ?? []) {
    const dateKey = new Date(parseInt(bucket.startTimeMillis)).toISOString().split("T")[0];
    let daySteps = 0;

    // Ignore all datasets except the first valid non-user_input one
    const validDataset = bucket.dataset?.find(
      (d) =>
        d.point?.[0]?.originDataSourceId &&
        !d.point[0].originDataSourceId.includes("user_input") &&
        d.point[0].value?.[0]?.intVal > 0
    );

    if (!validDataset) continue; // skip empty days

    const point = validDataset.point[0];
    const steps =
      point.value?.[0]?.intVal ??
      (point.value?.[0]?.fpVal ? Math.round(point.value[0].fpVal) : 0);

    daySteps = steps;
    totalSteps += steps;

    dailySteps.push({
      date: dateKey,
      steps: daySteps,
      source: point.originDataSourceId,
    });
  }

  console.table(dailySteps);
  console.log("🏃‍♂️ Total real steps:", totalSteps);

  return totalSteps;
}
